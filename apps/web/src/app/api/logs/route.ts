import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

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

/// How far back to scan. Base/Unichain Sepolia ~2s blocks → 200k ≈ 4.6 days,
/// covers the Nov 14–17 deployment + demo window. Lasna ~4 blocks/s → 200k ≈ 14h.
const SCAN_BLOCKS = 200_000n;
const CHUNK = 10_000n;
const CONCURRENCY = 8;

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

/// @dev eth_getLogs over chunked block ranges, fetched in parallel batches.
///      Public RPCs reject very large single ranges, hence the chunking.
async function scanLogs(rpcUrl: string, address: string): Promise<NormalizedLog[]> {
  const latestHex = (await rpcCall(rpcUrl, "eth_blockNumber", [])) as string;
  const latest = BigInt(latestHex);
  const from = latest > SCAN_BLOCKS ? latest - SCAN_BLOCKS : 0n;

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
  return logs;
}

const workingRpc = new Map<string, string>();

/// @dev Try each candidate RPC until one completes the scan; cache the winner
///      so subsequent requests skip the failing endpoints.
async function fetchLogs(chain: string, address: string): Promise<NormalizedLog[]> {
  const candidates = RPC_CANDIDATES[chain];
  if (!candidates?.length) throw new Error(`no RPC configured for chain ${chain}`);

  const cached = workingRpc.get(chain);
  const ordered = cached
    ? [cached, ...candidates.filter((u) => u !== cached)]
    : candidates;

  let lastErr: unknown;
  for (const url of ordered) {
    try {
      const logs = await scanLogs(url, address);
      workingRpc.set(chain, url);
      return logs;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/// @dev Unified log proxy: ?chain=base|uni|lasna&address=0x...
///      All chains served via eth_getLogs over their configured RPC endpoint.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chain = searchParams.get("chain");
  const address = searchParams.get("address");
  if (!chain || !address) {
    return NextResponse.json({ error: "chain and address required" }, { status: 400 });
  }
  if (!RPC_CANDIDATES[chain]) {
    return NextResponse.json({ error: `unknown chain ${chain}` }, { status: 400 });
  }
  try {
    const logs = await fetchLogs(chain, address);
    return NextResponse.json({ logs });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
