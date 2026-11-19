import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

/// @dev Candidate RPCs per chain, tried in order. The official sepolia.base.org
///      caps eth_getLogs at 200 blocks and sepolia.unichain.org at 1000, which
///      makes a chunked historical scan impractical — publicnode allows 10k.
///      The first endpoint that completes the scan is cached per chain.
const RPC_CANDIDATES: Record<string, string[]> = {
  base: [
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
    process.env.BASE_SEPOLIA_RPC_URL,
    "https://base-sepolia-rpc.publicnode.com",
  ].filter((u): u is string => Boolean(u)),
  uni: [
    process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL,
    process.env.UNICHAIN_SEPOLIA_RPC_URL,
    "https://unichain-sepolia-rpc.publicnode.com",
  ].filter((u): u is string => Boolean(u)),
  lasna: [process.env.LASNA_RPC_URL, "https://lasna-rpc.rnk.dev/"].filter(
    (u): u is string => Boolean(u)
  ),
};

/// @dev Address allowlist per chain — only known PulseGuard contracts may be
///      scanned. Prevents the endpoint being used as a free eth_getLogs proxy
///      for arbitrary addresses (which would burn RPC quota).
const ALLOWED_ADDRESSES: Record<string, Set<string>> = (() => {
  const norm = (a?: string) => (a ? a.toLowerCase() : "");
  const base = [
    process.env.NEXT_PUBLIC_VAULT_ADDRESS,
    process.env.NEXT_PUBLIC_MANAGER_ADDRESS,
    process.env.NEXT_PUBLIC_FEED_ADDRESS,
    process.env.NEXT_PUBLIC_BASE_EXECUTOR,
    process.env.NEXT_PUBLIC_SETTLEMENT_RELAY,
    process.env.NEXT_PUBLIC_TOKEN_ADDRESS,
  ].map(norm).filter(Boolean);
  const uni = [process.env.NEXT_PUBLIC_UNI_EXECUTOR].map(norm).filter(Boolean);
  const lasna = [process.env.NEXT_PUBLIC_REACTIVE_ADDRESS].map(norm).filter(Boolean);

  // Fallback: merge addresses from deployments/*.json so the allowlist stays
  // correct even when env vars are unset (config comments reference these files).
  try {
    const candidates = [
      path.resolve(process.cwd(), "../../deployments"),
      path.resolve(process.cwd(), "../../../deployments"),
    ];
    const files: Record<string, string> = {
      "base-sepolia.json": "base",
      "unichain-sepolia.json": "uni",
      "reactive-lasna.json": "lasna",
    };
    for (const dir of candidates) {
      for (const [file, chain] of Object.entries(files)) {
        try {
          const raw = fs.readFileSync(path.join(dir, file), "utf8");
          const json = JSON.parse(raw) as { contracts?: Record<string, { address?: string }> };
          for (const c of Object.values(json.contracts ?? {})) {
            const a = norm(c.address);
            if (a) {
              if (chain === "base") base.push(a);
              else if (chain === "uni") uni.push(a);
              else lasna.push(a);
            }
          }
        } catch { /* file absent — skip */ }
      }
      if (fs.existsSync(dir)) break;
    }
  } catch { /* deployments dir unavailable — env-only allowlist */ }

  return {
    base: new Set(base),
    uni: new Set(uni),
    lasna: new Set(lasna),
  };
})();

/// How far back to scan. Base/Unichain Sepolia ~2s blocks → 200k ≈ 4.6 days,
/// covers the Nov 14–17 deployment + demo window. Lasna ~4 blocks/s → 200k ≈ 14h.
const SCAN_BLOCKS = 200_000n;
const CHUNK = 10_000n;
const CONCURRENCY = 8;

/// @dev Simple per-IP rate limit: RATE_LIMIT requests per RATE_WINDOW_MS.
///      In-memory — sufficient for a single-instance deployment; swap for a
///      shared store (e.g. Upstash) if horizontally scaled.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export interface NormalizedLog {
  blockNumber: string;
  transactionHash: `0x${string}`;
  logIndex: string;
  topics: string[];
  data: string;
}

interface RpcLog {
  blockNumber: string;
  transactionHash: `0x${string}`;
  logIndex: string;
  topics: string[];
  data: string;
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

/// @dev curl transport for all chains: the Lasna erpc gateway fingerprints TLS
///      clients and rejects Node's fetch (undici); curl works everywhere.
async function rpcCall(url: string, method: string, params: unknown[]): Promise<unknown> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const { stdout } = await execFileAsync(
    "curl",
    ["-s", "-m", "30", "-X", "POST", url, "-H", "content-type: application/json", "-d", body],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  const json = JSON.parse(stdout) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/// @dev Incremental index: per (chain,address) we keep the merged log set and
///      the highest block already scanned. Repeat requests only fetch blocks
///      after `lastBlock` instead of rescanning the full SCAN_BLOCKS window.
///      In-memory — a restart triggers one full rescan. Reorgs are not handled
///      (acceptable for testnet demo; a production indexer should confirm
///      finality before advancing lastBlock).
interface IndexState {
  logs: NormalizedLog[];
  lastBlock: bigint;
  at: number;
}
const indexStore = new Map<string, IndexState>();

/// @dev How stale an index may get before we force a full rescan (covers gaps
///      if the process was paused or a scan partially failed).
const INDEX_MAX_AGE_MS = 10 * 60_000;

/// @dev eth_getLogs over chunked block ranges, fetched in parallel batches.
///      Public RPCs reject very large single ranges, hence the chunking.
///      `fromBlock` is inclusive; pass 0n for a full-window scan.
async function scanLogs(rpcUrl: string, address: string, fromBlock: bigint): Promise<{ logs: NormalizedLog[]; latest: bigint }> {
  const latestHex = (await rpcCall(rpcUrl, "eth_blockNumber", [])) as string;
  const latest = BigInt(latestHex);
  const windowStart = latest > SCAN_BLOCKS ? latest - SCAN_BLOCKS : 0n;
  const from = fromBlock > windowStart ? fromBlock : windowStart;
  if (from > latest) return { logs: [], latest };

  const ranges: { fromBlock: string; toBlock: string }[] = [];
  for (let f = from; f <= latest; f += CHUNK) {
    const t = f + CHUNK - 1n > latest ? latest : f + CHUNK - 1n;
    ranges.push({ fromBlock: "0x" + f.toString(16), toBlock: "0x" + t.toString(16) });
  }

  const logs: NormalizedLog[] = [];
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      ranges.slice(i, i + CONCURRENCY).map((r) =>
        rpcCall(rpcUrl, "eth_getLogs", [{ address, ...r }]) as Promise<RpcLog[]>
      )
    );
    for (const chunk of batch) {
      for (const l of chunk) {
        logs.push({
          blockNumber: BigInt(l.blockNumber).toString(),
          transactionHash: l.transactionHash,
          logIndex: BigInt(l.logIndex).toString(),
          topics: l.topics ?? [],
          data: l.data ?? "0x",
        });
      }
    }
  }
  return { logs, latest };
}

const workingRpc = new Map<string, string>();

/// @dev Try each candidate RPC until one completes the scan; cache the winner
///      so subsequent requests skip the failing endpoints.
async function fetchLogs(chain: string, address: string, fromBlock: bigint): Promise<{ logs: NormalizedLog[]; latest: bigint }> {
  const candidates = RPC_CANDIDATES[chain];
  if (!candidates?.length) throw new Error(`no RPC configured for chain ${chain}`);

  const cached = workingRpc.get(chain);
  const ordered = cached
    ? [cached, ...candidates.filter((u) => u !== cached)]
    : candidates;

  let lastErr: unknown;
  for (const url of ordered) {
    try {
      const result = await scanLogs(url, address, fromBlock);
      workingRpc.set(chain, url);
      return result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/// @dev Unified log proxy: ?chain=base|uni|lasna&address=0x...
///      All chains served via eth_getLogs over their configured RPC endpoint.
///      Restricted to known PulseGuard contract addresses.
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return err("RATE_LIMITED", "Too many requests — try again in a minute.", 429);
  }

  const { searchParams } = new URL(req.url);
  const chain = searchParams.get("chain");
  const address = searchParams.get("address");
  if (!chain || !address) {
    return err("MISSING_PARAMS", "chain and address required", 400);
  }
  if (!RPC_CANDIDATES[chain]) {
    return err("UNKNOWN_CHAIN", `unknown chain ${chain}`, 400);
  }
  if (!ADDR_RE.test(address)) {
    return err("INVALID_ADDRESS", "address must be a 0x-prefixed 20-byte hex address", 400);
  }
  const allowed = ALLOWED_ADDRESSES[chain];
  if (allowed && allowed.size > 0 && !allowed.has(address.toLowerCase())) {
    return err("ADDRESS_NOT_ALLOWED", "address is not a known PulseGuard contract on this chain", 403);
  }

  const cacheKey = `${chain}:${address.toLowerCase()}`;
  const state = indexStore.get(cacheKey);
  const fresh = state && Date.now() - state.at < INDEX_MAX_AGE_MS;

  // Incremental: only scan blocks after lastBlock. Full rescan when there is
  // no state or the index is stale.
  const fromBlock = fresh ? state.lastBlock + 1n : 0n;

  try {
    const { logs: newLogs, latest } = await fetchLogs(chain, address, fromBlock);

    // Merge + dedupe by (txHash, logIndex); keep only logs inside the window.
    const windowStart = latest > SCAN_BLOCKS ? latest - SCAN_BLOCKS : 0n;
    const seen = new Set<string>();
    const merged: NormalizedLog[] = [];
    const all = fresh ? [...state.logs, ...newLogs] : newLogs;
    for (const l of all) {
      if (BigInt(l.blockNumber) < windowStart) continue;
      const k = `${l.transactionHash}:${l.logIndex}`;
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(l);
    }
    merged.sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || Number(BigInt(a.logIndex) - BigInt(b.logIndex)));

    indexStore.set(cacheKey, { logs: merged, lastBlock: latest, at: Date.now() });
    return NextResponse.json({ logs: merged, incremental: fresh });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("RPC_ERROR", message.slice(0, 200), 502);
  }
}
