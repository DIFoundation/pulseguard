"use client";

import { useEffect, useState } from "react";
import { useReadContract, usePublicClient } from "wagmi";
import { decodeEventLog, createPublicClient, http, type Abi, type Hash } from "viem";
import { formatPrice, formatTokenAmount, shortAddress, shortHash } from "@/lib/format";
import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge, Skeleton } from "@/components/ui";
import { deployments, isConfigured, baseSepolia, unichainSepolia, reactiveLasna, environment } from "@pulseguard/config";
import {
  PulseGuardVaultAbi,
  ProtectionManagerAbi,
  ProtectionExecutorAbi,
  MockPriceFeedAbi,
  CrossChainExecutorAbi,
  PulseGuardReactiveAbi,
} from "@pulseguard/abi";

interface ActivityEvent {
  key: string;
  txHash: Hash;
  blockNumber: bigint;
  timestamp?: bigint;
  chain: string;
  explorer: string;
  source: string;
  eventName: string;
  summary: string;
  policyId?: string;
  logIndex?: string;
  /** `${txHash}:${logIndex}` of the originating PriceUpdated log, when known. */
  originKey?: string;
  latencyOriginToReactive?: number;
  latencyReactiveToDest?: number;
  latencyTotal?: number;
}

interface Source {
  label: string;
  envKey: keyof typeof deployments;
  abi: Abi;
  chain: string;
  chainKey: "base" | "uni";
  explorer: string;
}

const BASE_EXPLORER = "https://sepolia.basescan.org";
const UNI_EXPLORER = "https://sepolia.uniscan.xyz";
const LASNA_EXPLORER = "https://lasna.reactscan.net";

// Lasna is not in the wagmi network list (monitoring-only chain) — use a direct viem client.
const lasnaClient = createPublicClient({
  chain: reactiveLasna,
  transport: http(environment.lasnaRpc),
});

const SOURCES: Source[] = [
  { label: "Price Feed", envKey: "priceFeed", abi: MockPriceFeedAbi, chain: "Base Sepolia", chainKey: "base", explorer: BASE_EXPLORER },
  { label: "Policy Manager", envKey: "protectionManager", abi: ProtectionManagerAbi, chain: "Base Sepolia", chainKey: "base", explorer: BASE_EXPLORER },
  { label: "Executor", envKey: "protectionExecutor", abi: ProtectionExecutorAbi, chain: "Base Sepolia", chainKey: "base", explorer: BASE_EXPLORER },
  { label: "Vault", envKey: "vault", abi: PulseGuardVaultAbi, chain: "Base Sepolia", chainKey: "base", explorer: BASE_EXPLORER },
  { label: "Unichain Executor", envKey: "crossChainExecutor", abi: CrossChainExecutorAbi, chain: "Unichain Sepolia", chainKey: "uni", explorer: UNI_EXPLORER },
];

// Only lifecycle events relevant to the demo narrative — drops config/admin noise
// (OwnershipTransferred, Paused, ExecutorForChainSet, ReactiveContractSet,
// ExecutorUpdated, IrrelevantEvent, Callback, etc.).
const EVENT_ALLOWLIST = new Set([
  "PriceUpdated",
  "PolicyCreated", "PolicyActivated", "PolicyExecuted", "PolicyCancelled",
  "PolicyDeactivated", "PolicyExpired", "PolicyMirrorSync",
  "CallbackReceived", "ProtectionExecuted", "ProtectedExit",
  "CrossChainProtectionRecorded",
  "PolicyMirrored", "PolicyMirrorRemoved", "TriggerEvaluated", "CallbackRequested",
  "Deposited", "Withdrawn",
]);

const TRIGGER_NAMES = ["STOP_LOSS", "TAKE_PROFIT", "MAX_DRAWDOWN", "EMERGENCY"];

const EXECUTION_EVENTS = new Set(["ProtectionExecuted", "CrossChainProtectionRecorded", "ProtectedExit"]);

function fmtLatency(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function summarize(eventName: string, args: Record<string, unknown>): string {
  switch (eventName) {
    case "PriceUpdated":
      return `price → ${formatPrice(args.price as bigint)}`;
    case "PolicyCreated":
      return `policy #${args.id} created (${TRIGGER_NAMES[Number(args.triggerType)] ?? ""})`;
    case "PolicyExecuted":
      return `policy #${args.id} executed`;
    case "CallbackReceived":
      return `callback received — policy #${args.policyId}`;
    case "ProtectionExecuted":
      return `policy #${args.policyId} protected`;
    case "ProtectedExit":
      return `protected exit — ${formatTokenAmount(args.amount as bigint)} tokens → ${shortAddress(String(args.recipient))}`;
    case "CrossChainProtectionRecorded":
      return `cross-chain attestation — policy #${args.policyId} @ ${formatPrice(args.price as bigint)}`;
    case "PolicyMirrored":
      return `policy #${args.id} mirrored on Lasna`;
    case "PolicyMirrorRemoved":
      return `policy #${args.id} mirror removed`;
    case "TriggerEvaluated":
      return `policy #${args.policyId} trigger evaluated @ ${formatPrice(args.price as bigint)}`;
    case "CallbackRequested":
      return `callback requested — policy #${args.policyId} → chain ${args.destinationChainId}`;
    case "Deposited":
      return `deposit — ${formatTokenAmount(args.amount as bigint)} tokens`;
    case "Withdrawn":
      return `withdrawal — ${formatTokenAmount(args.amount as bigint)} tokens`;
    default:
      return eventName;
  }
}

interface NormalizedLog {
  blockNumber: string;
  transactionHash: `0x${string}`;
  logIndex: string;
  topics: string[];
  data: string;
}

/**
 * Build the `${txHash}:${logIndex}` correlation key for an event.
 * - PriceUpdated: its own log coordinates (it IS the origin event).
 * - TriggerEvaluated / CallbackRequested: the origin PriceUpdated coordinates
 *   carried in the originTxHash (uint256) / originLogIndex args.
 */
function originKeyFor(
  eventName: string,
  args: Record<string, unknown>,
  log: NormalizedLog
): string | undefined {
  if (eventName === "PriceUpdated") {
    return `${log.transactionHash}:${log.logIndex}`;
  }
  if (eventName === "TriggerEvaluated" || eventName === "CallbackRequested") {
    const rawTx = args.originTxHash;
    const rawIdx = args.originLogIndex;
    if (rawTx === undefined || rawTx === null || rawIdx === undefined || rawIdx === null) return undefined;
    const txHash = `0x${BigInt(rawTx as bigint | number | string).toString(16).padStart(64, "0")}` as `0x${string}`;
    return `${txHash}:${String(rawIdx)}`;
  }
  return undefined;
}

async function fetchChainLogs(chainKey: string, address: string): Promise<NormalizedLog[]> {
  const res = await fetch(`/api/logs?chain=${chainKey}&address=${address}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`logs ${res.status} for ${chainKey}/${address}`);
  const json = (await res.json()) as { logs?: NormalizedLog[] };
  return json.logs ?? [];
}

const PAGE_SIZE = 20;

export default function ActivityPage() {
  const baseClient = usePublicClient({ chainId: baseSepolia.id });
  const uniClient = usePublicClient({ chainId: unichainSepolia.id });
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [lasnaFailed, setLasnaFailed] = useState(false);

  const uniAddr = deployments.crossChainExecutor.address as `0x${string}`;
  const { data: recordCount } = useReadContract({
    abi: CrossChainExecutorAbi,
    address: isConfigured("crossChainExecutor") ? uniAddr : undefined,
    functionName: "recordCount",
    chainId: unichainSepolia.id,
    query: { enabled: isConfigured("crossChainExecutor") },
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const collected: ActivityEvent[] = [];

        await Promise.all(
          SOURCES.map(async (src) => {
            const info = deployments[src.envKey];
            if (!info.address) return;
            const logs = await fetchChainLogs(src.chainKey, info.address);
            for (const log of logs) {
              try {
                const decoded = decodeEventLog({
                  abi: src.abi,
                  data: log.data as `0x${string}`,
                  topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
                });
                const eventName = decoded.eventName ?? "Unknown";
                if (!EVENT_ALLOWLIST.has(eventName)) continue; // drop noise
                const args = (decoded.args ?? {}) as unknown as Record<string, unknown>;
                collected.push({
                  key: `${src.chain}-${log.transactionHash}-${log.logIndex}`,
                  txHash: log.transactionHash,
                  blockNumber: BigInt(log.blockNumber),
                  chain: src.chain,
                  explorer: src.explorer,
                  source: src.label,
                  eventName,
                  summary: summarize(eventName, args),
                  policyId: args.policyId !== undefined ? String(args.policyId) : args.id !== undefined ? String(args.id) : undefined,
                  logIndex: log.logIndex,
                  originKey: originKeyFor(eventName, args, log),
                });
              } catch {
                // log from an event not in this ABI — skip
              }
            }
          })
        );

        // Reactive Lasna: fetched via the unified server-side proxy — browser
        // RPC getLogs was unreliable (CORS/rate-limit on ranges).
        const reactiveAddr = deployments.reactive.address as `0x${string}`;
        if (isConfigured("reactive") && reactiveAddr) {
          try {
            const logs = await fetchChainLogs("lasna", reactiveAddr);
            setLasnaFailed(false);
            for (const log of logs) {
              try {
                const decoded = decodeEventLog({
                  abi: PulseGuardReactiveAbi,
                  data: log.data as `0x${string}`,
                  topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
                });
                const eventName: string = decoded.eventName ?? "Unknown";
                if (!EVENT_ALLOWLIST.has(eventName)) continue; // drop noise
                const args = (decoded.args ?? {}) as unknown as Record<string, unknown>;
                collected.push({
                  key: `Reactive Lasna-${log.transactionHash}-${log.logIndex}`,
                  txHash: log.transactionHash,
                  blockNumber: BigInt(log.blockNumber),
                  chain: "Reactive Lasna",
                  explorer: LASNA_EXPLORER,
                  source: "Reactive Contract",
                  eventName,
                  summary: summarize(eventName, args),
                  policyId: args.policyId !== undefined ? String(args.policyId) : args.id !== undefined ? String(args.id) : undefined,
                  logIndex: log.logIndex,
                  originKey: originKeyFor(eventName, args, log),
                });
              } catch {
                // log from an event not in this ABI — skip
              }
            }
          } catch (err) {
            console.warn("Lasna log fetch failed", err);
            setLasnaFailed(true);
          }
        }

        // Timestamps only for the most recent events per chain (the top-200 feed
        // needs at most ~80/chain), fetched in parallel batches across all chains.
        type BlockClient = { getBlock: (args: { blockNumber: bigint }) => Promise<{ timestamp: bigint }> };
        const clients: Record<string, BlockClient> = {
          "Base Sepolia": baseClient as unknown as BlockClient,
          "Unichain Sepolia": uniClient as unknown as BlockClient,
          "Reactive Lasna": lasnaClient as unknown as BlockClient,
        };
        const RECENT_PER_CHAIN = 80;
        const byChain = new Map<string, ActivityEvent[]>();
        for (const e of collected) {
          const arr = byChain.get(e.chain) ?? [];
          arr.push(e);
          byChain.set(e.chain, arr);
        }
        const candidates = new Set<ActivityEvent>();
        for (const evts of byChain.values()) {
          evts.sort((a, b) => Number(b.blockNumber - a.blockNumber));
          for (const e of evts.slice(0, RECENT_PER_CHAIN)) candidates.add(e);
        }
        const tsByBlock = new Map<string, bigint>();
        const jobs: { chain: string; bn: bigint }[] = [];
        const seen = new Set<string>();
        for (const e of candidates) {
          const key = `${e.chain}:${e.blockNumber}`;
          if (seen.has(key)) continue;
          seen.add(key);
          jobs.push({ chain: e.chain, bn: e.blockNumber });
        }
        for (let i = 0; i < jobs.length; i += 20) {
          await Promise.all(
            jobs.slice(i, i + 20).map(async (j) => {
              const c = clients[j.chain];
              if (!c) return;
              try {
                const b = await c.getBlock({ blockNumber: j.bn });
                tsByBlock.set(`${j.chain}:${j.bn}`, b.timestamp);
              } catch {
                // block fetch failed — event keeps undefined timestamp
              }
            })
          );
        }
        for (const e of candidates) {
          e.timestamp = tsByBlock.get(`${e.chain}:${e.blockNumber}`);
        }

        // Correlate executions to their originating PriceUpdated via the
        // originTxHash/originLogIndex carried by TriggerEvaluated/CallbackRequested.
        // Fallback for pre-upgrade events: latest PriceUpdated before the callback.
        const priceByOriginKey = new Map<string, ActivityEvent>();
        const priceEvents = collected
          .filter((e) => e.eventName === "PriceUpdated" && e.timestamp !== undefined)
          .sort((a, b) => Number(a.timestamp! - b.timestamp!));
        for (const p of priceEvents) {
          if (p.txHash && p.logIndex !== undefined) {
            priceByOriginKey.set(`${p.txHash}:${p.logIndex}`, p);
          }
        }

        // policyId -> { callback event, origin price event }
        const callbackByPolicy = new Map<string, { cb: ActivityEvent; price?: ActivityEvent }>();
        for (const e of collected) {
          if ((e.eventName === "CallbackRequested" || e.eventName === "TriggerEvaluated") && e.policyId) {
            const price = e.originKey ? priceByOriginKey.get(e.originKey) : undefined;
            const existing = callbackByPolicy.get(e.policyId);
            // Prefer CallbackRequested (later stage) over TriggerEvaluated.
            if (!existing || e.eventName === "CallbackRequested") {
              callbackByPolicy.set(e.policyId, { cb: e, price });
            }
          }
        }

        // ProtectedExit carries no policyId — recover it from a sibling execution
        // event in the same transaction (e.g. PolicyExecuted).
        const policyByTx = new Map<string, string>();
        for (const e of collected) {
          if (e.policyId && EXECUTION_EVENTS.has(e.eventName)) {
            policyByTx.set(e.txHash, e.policyId);
          }
        }

        const setLatencies = (e: ActivityEvent, price?: ActivityEvent, cb?: ActivityEvent) => {
          if (e.timestamp === undefined) return;
          const priceTs = price?.timestamp;
          const cbTs = cb?.timestamp;
          if (priceTs !== undefined && cbTs !== undefined && cbTs >= priceTs) {
            e.latencyOriginToReactive = Number(cbTs - priceTs);
          }
          if (cbTs !== undefined && e.timestamp >= cbTs) {
            e.latencyReactiveToDest = Number(e.timestamp - cbTs);
          }
          if (priceTs !== undefined && e.timestamp >= priceTs) {
            e.latencyTotal = Number(e.timestamp - priceTs);
          }
        };

        for (const e of collected) {
          if (!EXECUTION_EVENTS.has(e.eventName) || e.timestamp === undefined) continue;
          const pid = e.policyId ?? policyByTx.get(e.txHash);
          const linked = pid ? callbackByPolicy.get(pid) : undefined;
          if (linked?.price) {
            setLatencies(e, linked.price, linked.cb);
            continue;
          }
          // Fallback: latest PriceUpdated before the callback timestamp (legacy events).
          const anchor = linked?.cb.timestamp ?? e.timestamp;
          let priceTs: bigint | undefined;
          for (const p of priceEvents) {
            if (p.timestamp! <= anchor) priceTs = p.timestamp;
            else break;
          }
          if (priceTs !== undefined) {
            const delta = Number(e.timestamp - priceTs);
            if (delta >= 0 && delta < 86400) e.latencyTotal = delta;
          }
        }

        collected.sort((x, y) => Number(y.timestamp ?? 0n) - Number(x.timestamp ?? 0n));
        if (!cancelled) {
          setEvents(collected.slice(0, 200));
          setPage(0);
        }
      } catch (err) {
        console.error("activity load failed", err);
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 60000); // live refresh
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [baseClient, uniClient]);

  const countFor = (chain: string) => events.filter((e) => e.chain === chain).length;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <PageHeader title="Activity" description="Execution lifecycle events across origin, Reactive, and destination chains." />

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <h3 className="font-semibold">Origin Chain — Base Sepolia</h3>
            <p className="mt-2 text-sm text-foreground/60">PriceUpdated events, policy creation, vault deposits/withdrawals.</p>
            <p className="mt-2 text-sm">Events: <span className="font-semibold">{countFor("Base Sepolia")}</span></p>
            <a href="https://sepolia.basescan.org" target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-accent hover:underline">View explorer →</a>
          </Card>
          <Card>
            <h3 className="font-semibold">Reactive Network — Lasna</h3>
            <p className="mt-2 text-sm text-foreground/60">react() evaluations, callback requests, CallbackRequest events.</p>
            <p className="mt-2 text-sm">Events: <span className="font-semibold">{countFor("Reactive Lasna")}</span></p>
            {lasnaFailed && (
              <p className="mt-2 text-xs text-warning">Reactive log fetch failed (RPC range limit) — will retry on next refresh.</p>
            )}
            <a href="https://lasna.reactscan.net" target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-accent hover:underline">View explorer →</a>
          </Card>
          <Card>
            <h3 className="font-semibold">Destination — Unichain Sepolia</h3>
            <p className="mt-2 text-sm text-foreground/60">Cross-chain protection records.</p>
            <p className="mt-2 text-sm">Records: <span className="font-semibold">{recordCount?.toString() ?? "—"}</span></p>
            <p className="mt-1 text-sm">Events: <span className="font-semibold">{countFor("Unichain Sepolia")}</span></p>
            <a href="https://sepolia.uniscan.xyz" target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-accent hover:underline">View explorer →</a>
          </Card>
        </div>

        <Card className="mt-6">
          <h3 className="font-semibold">Execution Timeline</h3>
          <p className="mt-2 text-sm text-foreground/60">
            Live on-chain events across Base Sepolia, Reactive Lasna, and Unichain Sepolia.
          </p>
          {loading ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              Failed to load events: {error}
            </div>
          ) : events.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-foreground/40">
              No events found yet — see docs/DEMO_SCRIPT.md for the demo flow.
            </div>
          ) : (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-foreground/50">
                      <th className="py-2 pr-4 font-medium">Time</th>
                      <th className="py-2 pr-4 font-medium">Chain</th>
                      <th className="py-2 pr-4 font-medium">Source</th>
                      <th className="py-2 pr-4 font-medium">Event</th>
                      <th className="py-2 pr-4 font-medium">Details</th>
                      <th className="py-2 font-medium">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((e) => (
                      <tr key={e.key} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-4 whitespace-nowrap text-foreground/60">
                          {e.timestamp ? new Date(Number(e.timestamp) * 1000).toLocaleString() : "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge tone={e.chain === "Unichain Sepolia" ? "accent" : "default"}>{e.chain}</Badge>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge>{e.source}</Badge>
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">
                          {e.eventName}
                          {e.latencyTotal !== undefined && (
                            <span
                              className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 font-sans text-[10px] text-accent"
                              title={
                                e.latencyOriginToReactive !== undefined || e.latencyReactiveToDest !== undefined
                                  ? `origin→Reactive: ${e.latencyOriginToReactive ?? "—"}s · Reactive→dest: ${e.latencyReactiveToDest ?? "—"}s`
                                  : undefined
                              }
                            >
                              ⚡ {fmtLatency(e.latencyTotal)} total
                              {e.latencyOriginToReactive !== undefined && (
                                <span className="ml-1 opacity-70">({fmtLatency(e.latencyOriginToReactive)}+{fmtLatency(e.latencyReactiveToDest ?? 0)})</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-foreground/80">{e.summary}</td>
                        <td className="py-2">
                          <a
                            href={`${e.explorer}/tx/${e.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-accent hover:underline"
                          >
                            {shortHash(e.txHash)}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {events.length > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between text-sm text-foreground/60">
                  <span>
                    Page {page + 1} of {Math.ceil(events.length / PAGE_SIZE)} · {events.length} events
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-card disabled:opacity-40"
                    >
                      ← Prev
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(Math.ceil(events.length / PAGE_SIZE) - 1, p + 1))}
                      disabled={(page + 1) * PAGE_SIZE >= events.length}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-card disabled:opacity-40"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
