"use client";

import { useEffect, useState } from "react";
import { useReadContract, usePublicClient } from "wagmi";
import { decodeEventLog, type Abi, type Hash } from "viem";
import { formatPrice, formatTokenAmount, shortAddress, shortHash } from "@/lib/format";
import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge } from "@/components/ui";
import { deployments, isConfigured, baseSepolia, unichainSepolia } from "@pulseguard/config";
import {
  PulseGuardVaultAbi,
  ProtectionManagerAbi,
  ProtectionExecutorAbi,
  MockPriceFeedAbi,
  CrossChainExecutorAbi,
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

const SOURCES: Source[] = [
  { label: "Price Feed", envKey: "priceFeed", abi: MockPriceFeedAbi, chain: "Base Sepolia", blockscout: "https://base-sepolia.blockscout.com", explorer: BASE_EXPLORER },
  { label: "Policy Manager", envKey: "protectionManager", abi: ProtectionManagerAbi, chain: "Base Sepolia", blockscout: "https://base-sepolia.blockscout.com", explorer: BASE_EXPLORER },
  { label: "Executor", envKey: "protectionExecutor", abi: ProtectionExecutorAbi, chain: "Base Sepolia", blockscout: "https://base-sepolia.blockscout.com", explorer: BASE_EXPLORER },
  { label: "Vault", envKey: "vault", abi: PulseGuardVaultAbi, chain: "Base Sepolia", blockscout: "https://base-sepolia.blockscout.com", explorer: BASE_EXPLORER },
  { label: "Unichain Executor", envKey: "crossChainExecutor", abi: CrossChainExecutorAbi, chain: "Unichain Sepolia", blockscout: "https://unichain-sepolia.blockscout.com", explorer: UNI_EXPLORER },
];

const TRIGGER_NAMES = ["STOP_LOSS", "TAKE_PROFIT", "MAX_DRAWDOWN", "EMERGENCY"];

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
      return `cross-chain record — policy #${args.policyId} @ ${formatPrice(args.price as bigint)}`;
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

export default function ActivityPage() {
    const baseClient = usePublicClient({ chainId: baseSepolia.id });
    const uniClient = usePublicClient({ chainId: unichainSepolia.id });
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        for (const src of SOURCES) {
          const info = deployments[src.envKey];
          if (!info.address) continue;
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
              });
            } catch {
              // log from an event not in this ABI — skip
            }
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

        collected.sort((x, y) => Number(y.timestamp ?? 0n) - Number(x.timestamp ?? 0n));
        if (!cancelled) setEvents(collected.slice(0, 50));
      } catch (err) {
        console.error("activity load failed", err);
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
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
            <p className="mt-4 text-sm text-foreground/50">Loading events…</p>
          ) : error ? (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              Failed to load events: {error}
            </div>
          ) : events.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-foreground/40">
              No events found yet — see docs/DEMO_SCRIPT.md for the demo flow.
            </div>
          ) : (
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
                  {events.map((e) => (
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
                      <td className="py-2 pr-4 font-mono text-xs">{e.eventName}</td>
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
          )}
        </Card>
      </main>
    </div>
  );
}
