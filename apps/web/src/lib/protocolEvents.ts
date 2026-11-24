"use client";

import { decodeEventLog, createPublicClient, http, type Abi, type Hash } from "viem";
import { deployments, isConfigured, baseSepolia, unichainSepolia, reactiveLasna, environment } from "@pulseguard/config";
import {
  PulseGuardVaultAbi,
  ProtectionManagerAbi,
  ProtectionExecutorAbi,
  MockPriceFeedAbi,
  CrossChainExecutorAbi,
  PulseGuardReactiveAbi,
} from "@pulseguard/abi";
import { formatPrice } from "./format";

export interface ProtocolEvent {
  key: string;
  txHash: Hash;
  logIndex?: string;
  blockNumber: bigint;
  timestamp?: number; // unix seconds
  chain: string;
  source: string;
  eventName: string;
  summary: string;
  policyId?: string;
  originKey?: string; // `${originTxHash}:${originLogIndex}`
  price?: number; // USD, for PriceUpdated
  amount?: bigint; // token amount for deposit/withdraw/exit events
}

interface Source {
  label: string;
  envKey: keyof typeof deployments;
  abi: Abi;
  chain: string;
  chainKey: "base" | "uni";
}

const lasnaClient = createPublicClient({
  chain: reactiveLasna,
  transport: http(environment.lasnaRpc),
});
const baseClient = createPublicClient({
  chain: baseSepolia,
  transport: http(environment.baseSepoliaRpc),
});
const uniClient = createPublicClient({
  chain: unichainSepolia,
  transport: http(environment.unichainSepoliaRpc),
});

export const SOURCES: Source[] = [
  { label: "Price Feed", envKey: "priceFeed", abi: MockPriceFeedAbi, chain: "Base Sepolia", chainKey: "base" },
  { label: "Policy Manager", envKey: "protectionManager", abi: ProtectionManagerAbi, chain: "Base Sepolia", chainKey: "base" },
  { label: "Executor", envKey: "protectionExecutor", abi: ProtectionExecutorAbi, chain: "Base Sepolia", chainKey: "base" },
  { label: "Vault", envKey: "vault", abi: PulseGuardVaultAbi, chain: "Base Sepolia", chainKey: "base" },
  { label: "Unichain Executor", envKey: "crossChainExecutor", abi: CrossChainExecutorAbi, chain: "Unichain Sepolia", chainKey: "uni" },
];

export const EVENT_ALLOWLIST = new Set([
  "PriceUpdated",
  "PolicyCreated", "PolicyActivated", "PolicyExecuted", "PolicyCancelled",
  "PolicyDeactivated", "PolicyExpired", "PolicyMirrorSync",
  "CallbackReceived", "ProtectionExecuted", "ProtectedExit",
  "CrossChainProtectionRecorded",
  "PolicyMirrored", "PolicyMirrorRemoved", "TriggerEvaluated", "CallbackRequested",
  "Deposited", "Withdrawn",
]);

const TRIGGER_NAMES = ["STOP_LOSS", "TAKE_PROFIT", "MAX_DRAWDOWN", "EMERGENCY"];

export function summarize(eventName: string, args: Record<string, unknown>): string {
  switch (eventName) {
    case "PriceUpdated":
      return `price → ${formatPrice(args.price as bigint, 8)}`;
    case "PolicyCreated":
      return `policy #${args.id} created (${TRIGGER_NAMES[Number(args.triggerType)] ?? ""})`;
    case "PolicyExecuted":
      return `policy #${args.id} executed`;
    case "CallbackReceived":
      return `callback received — policy #${args.policyId}`;
    case "ProtectionExecuted":
      return `policy #${args.policyId} protected`;
    case "ProtectedExit":
      return `protected exit — ${args.amount} tokens`;
    case "CrossChainProtectionRecorded":
      return `cross-chain attestation — policy #${args.policyId}`;
    case "PolicyMirrored":
      return `policy #${args.id} mirrored on Lasna`;
    case "PolicyMirrorRemoved":
      return `policy #${args.id} mirror removed`;
    case "TriggerEvaluated":
      return `policy #${args.policyId} trigger evaluated`;
    case "CallbackRequested":
      return `callback requested — policy #${args.policyId} → chain ${args.destinationChainId}`;
    case "Deposited":
      return `deposit — ${formatPrice(args.amount as bigint)} tokens`;
    case "Withdrawn":
      return `withdrawal — ${args.amount} tokens`;
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
  timestamp?: string;
}

function getEventTimestamp(
  args: Record<string, unknown>,
  log: NormalizedLog
): number | undefined {
  const rawTimestamp = args.timestamp;

  if (
    typeof rawTimestamp === "bigint" ||
    typeof rawTimestamp === "number" ||
    typeof rawTimestamp === "string"
  ) {
    const timestamp = Number(rawTimestamp);

    if (Number.isFinite(timestamp) && timestamp > 0) {
      return timestamp;
    }
  }

  if (log.timestamp !== undefined) {
    const timestamp = Number(log.timestamp);

    if (Number.isFinite(timestamp) && timestamp > 0) {
      return timestamp;
    }
  }

  return undefined;
}

/**
 * Identifies the exact PriceUpdated log responsible for a Reactive event.
 *
 * PriceUpdated uses its own transaction hash and log index.
 * TriggerEvaluated and CallbackRequested carry the originating coordinates.
 */
function getOriginKey(
  eventName: string,
  args: Record<string, unknown>,
  log: NormalizedLog
): string | undefined {
  if (eventName === "PriceUpdated") {
    return `${log.transactionHash.toLowerCase()}:${log.logIndex}`;
  }

  if (
    eventName !== "TriggerEvaluated" &&
    eventName !== "CallbackRequested"
  ) {
    return undefined;
  }

  const rawTx = args.originTxHash;
  const rawIndex = args.originLogIndex;

  if (
    rawTx === undefined ||
    rawTx === null ||
    rawIndex === undefined ||
    rawIndex === null
  ) {
    return undefined;
  }

  try {
    const txHash = `0x${BigInt(rawTx as bigint | number | string)
      .toString(16)
      .padStart(64, "0")}`.toLowerCase();

    return `${txHash}:${String(rawIndex)}`;
  } catch {
    return undefined;
  }
}

export async function fetchChainLogs(chainKey: string, address: string): Promise<NormalizedLog[]> {
  // Retry on 429/5xx with backoff — several pages share this endpoint and the
  // per-IP rate limit can trip during simultaneous bursts.
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`/api/logs?chain=${chainKey}&address=${address}`, { cache: "no-store" });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`logs ${res.status} for ${chainKey}/${address}`);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`logs ${res.status} for ${chainKey}/${address}`);
      const json = (await res.json()) as { logs?: NormalizedLog[] };
      return json.logs ?? [];
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error(`logs failed for ${chainKey}/${address}`);
}

/// @dev Fetch + decode all PulseGuard events across Base, Lasna, Unichain.
///      Returns events sorted by timestamp desc (events without timestamps last).
export async function fetchProtocolEvents(): Promise<ProtocolEvent[]> {
  const collected: ProtocolEvent[] = [];

  // A provider failure on one chain must not hide events already available
  // from the others.
  const sourceResults = await Promise.allSettled(
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
          const eventName: string = decoded.eventName ?? "Unknown";
          if (!EVENT_ALLOWLIST.has(eventName)) continue;
          const args = (decoded.args ?? {}) as unknown as Record<string, unknown>;
          collected.push({
            key: `${src.chain}-${log.transactionHash}-${log.logIndex}`,
            txHash: log.transactionHash,
            blockNumber: BigInt(log.blockNumber),
            timestamp: getEventTimestamp(args, log),
            logIndex: log.logIndex,
            originKey: getOriginKey(eventName, args, log),
            chain: src.chain,
            source: src.label,
            eventName,
            summary: summarize(eventName, args),
            policyId: args.policyId !== undefined ? String(args.policyId) : args.id !== undefined ? String(args.id) : undefined,
            price: eventName === "PriceUpdated" && args.price !== undefined ? Number(args.price) / 1e8 : undefined,
            amount: args.amount as bigint | undefined,
          });
        } catch {
          // event not in this ABI — skip
        }
      }
    })
  );
  for (const result of sourceResults) {
    if (result.status === "rejected") console.warn("Protocol log fetch failed", result.reason);
  }

  // Lasna reactive events
  const reactiveAddr = deployments.reactive.address as `0x${string}`;
  if (isConfigured("reactive") && reactiveAddr) {
    try {
      const logs = await fetchChainLogs("lasna", reactiveAddr);
      for (const log of logs) {
        try {
          const decoded = decodeEventLog({
            abi: PulseGuardReactiveAbi,
            data: log.data as `0x${string}`,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          });
          const eventName: string = decoded.eventName ?? "Unknown";
          if (!EVENT_ALLOWLIST.has(eventName)) continue;
          const args = (decoded.args ?? {}) as unknown as Record<string, unknown>;
          collected.push({
            key: `Reactive Lasna-${log.transactionHash}-${log.logIndex}`,
            txHash: log.transactionHash,
            blockNumber: BigInt(log.blockNumber),
            timestamp: getEventTimestamp(args, log),
            logIndex: log.logIndex,
            originKey: getOriginKey(eventName, args, log),
            chain: "Reactive Lasna",
            source: "Reactive Contract",
            eventName,
            summary: summarize(eventName, args),
            policyId: args.policyId !== undefined ? String(args.policyId) : args.id !== undefined ? String(args.id) : undefined,
          });
        } catch {
          // skip
        }
      }
    } catch {
      // Lasna fetch failed — continue without it
    }
  }

  // Fetch timestamps for unique blocks (batched, capped).
  const clients: Record<string, { getBlock: (a: { blockNumber: bigint }) => Promise<{ timestamp: bigint }> }> = {
    "Base Sepolia": baseClient,
    "Unichain Sepolia": uniClient,
    "Reactive Lasna": lasnaClient,
  };
  const uniqueBlocks = new Map<string, bigint>();
  for (const e of collected) {
    if (e.timestamp !== undefined) continue;
    const k = `${e.chain}:${e.blockNumber}`;
    if (!uniqueBlocks.has(k)) uniqueBlocks.set(k, e.blockNumber);
  }
  const jobs = [...uniqueBlocks.entries()].slice(0, 250).map(([k, bn]) => {
    const [chain] = k.split(":");
    return { chain, bn };
  });
  const tsByBlock = new Map<string, number>();
  for (let i = 0; i < jobs.length; i += 20) {
    await Promise.all(
      jobs.slice(i, i + 20).map(async (j) => {
        const c = clients[j.chain];
        if (!c) return;
        try {
          const b = await c.getBlock({ blockNumber: j.bn });
          tsByBlock.set(`${j.chain}:${j.bn}`, Number(b.timestamp));
        } catch {
          // skip
        }
      })
    );
  }
  for (const e of collected) {
    const ts = tsByBlock.get(`${e.chain}:${e.blockNumber}`);
    if (ts !== undefined) e.timestamp = ts;
  }

  collected.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return collected;
}
