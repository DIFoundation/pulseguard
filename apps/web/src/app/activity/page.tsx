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
  latencySeconds?: number;
}

interface Source {
  label: string;
  envKey: keyof typeof deployments;
  abi: Abi;
  chain: string;
  blockscout: string;
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
  { label: "Price Feed", envKey: "priceFeed", abi: MockPriceFeedAbi, chain: "Base Sepolia", blockscout: "https://base-sepolia.blockscout.com", explorer: BASE_EXPLORER },
  { label: "Policy Manager", envKey: "protectionManager", abi: ProtectionManagerAbi, chain: "Base Sepolia", blockscout: "https://base-sepolia.blockscout.com", explorer: BASE_EXPLORER },
  { label: "Executor", envKey: "protectionExecutor", abi: ProtectionExecutorAbi, chain: "Base Sepolia", blockscout: "https://base-sepolia.blockscout.com", explorer: BASE_EXPLORER },
  { label: "Vault", envKey: "vault", abi: PulseGuardVaultAbi, chain: "Base Sepolia", blockscout: "https://base-sepolia.blockscout.com", explorer: BASE_EXPLORER },
  { label: "Unichain Executor", envKey: "crossChainExecutor", abi: CrossChainExecutorAbi, chain: "Unichain Sepolia", blockscout: "https://unichain-sepolia.blockscout.com", explorer: UNI_EXPLORER },
];

const TRIGGER_NAMES = ["STOP_LOSS", "TAKE_PROFIT", "MAX_DRAWDOWN", "EMERGENCY"];

const EXECUTION_EVENTS = new Set(["ProtectionExecuted", "CrossChainProtectionRecorded", "ProtectedExit"]);

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

interface BlockscoutLog {
  block_number: number;
  transaction_hash: string;
  index?: number;
  log_index?: number;
  topics: string[];
  data: string;
}

interface BlockscoutLogsPage {
  items: BlockscoutLog[];
  next_page_params: Record<string, string> | null;
}

async function fetchAddressLogs(address: string, base: string): Promise<BlockscoutLog[]> {
  const all: BlockscoutLog[] = [];
  let url: string | null = `${base}/api/v2/addresses/${address}/logs`;
  // cap pagination to avoid runaway requests
  for (let page = 0; page < 10 && url; page++) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Blockscout ${res.status} for ${address}`);
    const json = (await res.json()) as BlockscoutLogsPage;
    all.push(...(json.items ?? []));
    const params = json.next_page_params;
    url = params
      ? `${base}/api/v2/addresses/${address}/logs?${new URLSearchParams(params).toString()}`
      : null;
  }
  return all;
}

const PAGE_SIZE = 20;

export default function ActivityPage() {
    const baseClient = usePublicClient({ chainId: baseSepolia.id });
    const uniClient = usePublicClient({ chainId: unichainSepolia.id });
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

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
            const logs = await fetchAddressLogs(info.address, src.blockscout);
            for (const log of logs) {
              try {
                const decoded = decodeEventLog({
                  abi: src.abi,
                  data: log.data as `0x${string}`,
                  topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
                });
                const eventName = decoded.eventName ?? "Unknown";
                const args = (decoded.args ?? {}) as unknown as Record<string, unknown>;
                collected.push({
                  key: `${src.chain}-${log.transaction_hash}-${log.index ?? log.log_index ?? 0}`,
                  txHash: log.transaction_hash as Hash,
                  blockNumber: BigInt(log.block_number),
                  chain: src.chain,
                  explorer: src.explorer,
                  source: src.label,
                  eventName,
                  summary: summarize(eventName, args),
                  policyId: args.policyId !== undefined ? String(args.policyId) : args.id !== undefined ? String(args.id) : undefined,
                });
              } catch {
                // log from an event not in this ABI — skip
              }
            }
          })
        );

        // Reactive Lasna: no Blockscout API — fetch logs directly via RPC.
        const reactiveAddr = deployments.reactive.address as `0x${string}`;
        if (isConfigured("reactive") && reactiveAddr) {
          try {
            // Bound the range — Lasna RPC rejects/times out on fromBlock 0.
            const latest = await lasnaClient.getBlockNumber();
            const logs = await lasnaClient.getLogs({
              address: reactiveAddr,
              fromBlock: latest > 200_000n ? latest - 200_000n : 0n,
              toBlock: "latest",
            });
            const tsCache = new Map<bigint, bigint>();
            for (const log of logs) {
              try {
                const decoded = decodeEventLog({
                  abi: PulseGuardReactiveAbi,
                  data: log.data,
                  topics: log.topics,
                });
                const eventName: string = decoded.eventName ?? "Unknown";
                if (eventName === "IrrelevantEvent") continue; // noise
                const args = (decoded.args ?? {}) as unknown as Record<string, unknown>;
                if (!tsCache.has(log.blockNumber)) {
                  const b = await lasnaClient.getBlock({ blockNumber: log.blockNumber });
                  tsCache.set(log.blockNumber, b.timestamp);
                }
                collected.push({
                  key: `Reactive Lasna-${log.transactionHash}-${log.logIndex}`,
                  txHash: log.transactionHash,
                  blockNumber: log.blockNumber,
                  timestamp: tsCache.get(log.blockNumber),
                  chain: "Reactive Lasna",
                  explorer: LASNA_EXPLORER,
                  source: "Reactive Contract",
                  eventName,
                  summary: summarize(eventName, args),
                  policyId: args.policyId !== undefined ? String(args.policyId) : args.id !== undefined ? String(args.id) : undefined,
                });
              } catch {
                // log from an event not in this ABI — skip
              }
            }
          } catch (err) {
            console.warn("Lasna log fetch failed", err);
          }
        }

        const clients: Record<string, typeof baseClient> = {
          "Base Sepolia": baseClient,
          "Unichain Sepolia": uniClient,
        };
        const byChain = new Map<string, ActivityEvent[]>();
        for (const e of collected) {
          const arr = byChain.get(e.chain) ?? [];
          arr.push(e);
          byChain.set(e.chain, arr);
        }
        for (const [chain, evts] of byChain) {
          const c = clients[chain];
          if (!c) continue;
          const blockNums = [...new Set(evts.map((e) => e.blockNumber))].slice(0, 30);
          const tsMap = new Map<bigint, bigint>();
          await Promise.all(
            blockNums.map(async (bn) => {
              const b = await c.getBlock({ blockNumber: bn });
              tsMap.set(bn, b.timestamp);
            })
          );
          for (const e of evts) e.timestamp = tsMap.get(e.blockNumber);
        }

        // Correlate each execution event to its originating PriceUpdated:
        // anchor = the policy's CallbackRequested timestamp on Lasna (the react() tx
        // that consumed the price event), then take the latest PriceUpdated before it.
        const priceEvents = collected
          .filter((e) => e.eventName === "PriceUpdated" && e.timestamp !== undefined)
          .sort((a, b) => Number(a.timestamp! - b.timestamp!));

        const callbackTsByPolicy = new Map<string, bigint>();
        for (const e of collected) {
          if (e.eventName === "CallbackRequested" && e.policyId && e.timestamp !== undefined) {
            callbackTsByPolicy.set(e.policyId, e.timestamp);
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

        for (const e of collected) {
          if (!EXECUTION_EVENTS.has(e.eventName) || e.timestamp === undefined) continue;
          const pid = e.policyId ?? policyByTx.get(e.txHash);
          const anchor = (pid ? callbackTsByPolicy.get(pid) : undefined) ?? e.timestamp;
          let priceTs: bigint | undefined;
          for (const p of priceEvents) {
            if (p.timestamp! <= anchor) priceTs = p.timestamp;
            else break;
          }
          if (priceTs !== undefined) {
            const delta = Number(e.timestamp - priceTs);
            if (delta >= 0 && delta < 86400) e.latencySeconds = delta;
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
    const interval = setInterval(load, 20_000); // live refresh
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [baseClient, uniClient]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <PageHeader title="Activity" description="Execution lifecycle events across origin, Reactive, and destination chains." />

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <h3 className="font-semibold">Origin Chain — Base Sepolia</h3>
            <p className="mt-2 text-sm text-foreground/60">PriceUpdated events, policy creation, vault deposits/withdrawals.</p>
            <a href="https://sepolia.basescan.org" target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-accent hover:underline">View explorer →</a>
          </Card>
          <Card>
            <h3 className="font-semibold">Reactive Network — Lasna</h3>
            <p className="mt-2 text-sm text-foreground/60">react() evaluations, callback requests, CallbackRequest events.</p>
            <a href="https://lasna.reactscan.net" target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-accent hover:underline">View explorer →</a>
          </Card>
          <Card>
            <h3 className="font-semibold">Destination — Unichain Sepolia</h3>
            <p className="mt-2 text-sm text-foreground/60">Cross-chain protection records.</p>
            <p className="mt-2 text-sm">Records: <span className="font-semibold">{recordCount?.toString() ?? "—"}</span></p>
            <a href="https://sepolia.uniscan.xyz" target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-accent hover:underline">View explorer →</a>
          </Card>
        </div>

        <Card className="mt-6">
          <h3 className="font-semibold">Execution Timeline</h3>
          <p className="mt-2 text-sm text-foreground/60">
            Live on-chain events across Base Sepolia and Unichain Sepolia.
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
                        {e.timestamp ? new Date(Number(e.timestamp) * 1000).toLocaleTimeString() : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={e.chain === "Unichain Sepolia" ? "accent" : "default"}>{e.chain}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge>{e.source}</Badge>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {e.eventName}
                        {e.latencySeconds !== undefined && (
                          <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 font-sans text-[10px] text-accent">
                            ⚡ {e.latencySeconds < 60 ? `${e.latencySeconds}s` : `${Math.floor(e.latencySeconds / 60)}m ${e.latencySeconds % 60}s`}
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
