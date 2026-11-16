import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BLOCKSCOUT: Record<string, string> = {
  base: "https://base-sepolia.blockscout.com",
  uni: "https://unichain-sepolia.blockscout.com",
};
const LASNA_RPC = process.env.LASNA_RPC_URL ?? "https://lasna-rpc.rnk.dev/";

export interface NormalizedLog {
  blockNumber: string;
  transactionHash: `0x${string}`;
  logIndex: string;
  topics: string[];
  data: string;
}

/// @dev The Lasna erpc gateway fingerprints TLS clients and rejects Node's fetch
///      (undici) with "fetch failed", while curl works. Use curl as the transport.
async function lasnaRpc(method: string, params: unknown[]): Promise<unknown> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const { stdout } = await execFileAsync(
    "curl",
    ["-s", "-m", "30", "-X", "POST", LASNA_RPC, "-H", "content-type: application/json", "-d", body],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  const json = JSON.parse(stdout) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

interface BlockscoutLogItem {
  block_number: number;
  transaction_hash: string;
  index?: number;
  log_index?: number;
  topics: string[];
  data: string;
}

interface BlockscoutLogsPage {
  items: BlockscoutLogItem[];
  next_page_params: Record<string, string> | null;
}

async function fetchBlockscoutLogs(base: string, address: string): Promise<NormalizedLog[]> {
  const all: NormalizedLog[] = [];
  let url: string | null = `${base}/api/v2/addresses/${address}/logs`;
  for (let page = 0; page < 4 && url; page++) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Blockscout ${res.status} for ${address}`);
    const json = (await res.json()) as BlockscoutLogsPage;
    for (const item of json.items ?? []) {
      all.push({
        blockNumber: String(item.block_number),
        transactionHash: item.transaction_hash as `0x${string}`,
        logIndex: String(item.log_index ?? item.index ?? 0),
        topics: item.topics ?? [],
        data: item.data ?? "0x",
      });
    }
    const params = json.next_page_params;
    url = params
      ? `${base}/api/v2/addresses/${address}/logs?${new URLSearchParams(params).toString()}`
      : null;
  }
  return all;
}

interface LasnaRpcLog {
  blockNumber: string;
  transactionHash: `0x${string}`;
  logIndex: string;
  topics: string[];
  data: string;
}

/// @dev Lasna produces ~4 blocks/sec, so the window must be wide (200k blocks
///      ≈ 14h) to cover the demo history. Chunks are fetched in parallel batches
///      server-side (the RPC rejects huge single ranges).
async function fetchLasnaLogs(address: string): Promise<NormalizedLog[]> {
  const latestHex = (await lasnaRpc("eth_blockNumber", [])) as string;
  const latest = BigInt(latestHex);
  const from = latest > 200_000n ? latest - 200_000n : 0n;
  const CHUNK = 10_000n;
  const ranges: { fromBlock: string; toBlock: string }[] = [];
  for (let f = from; f <= latest; f += CHUNK) {
    const t = f + CHUNK - 1n > latest ? latest : f + CHUNK - 1n;
    ranges.push({ fromBlock: "0x" + f.toString(16), toBlock: "0x" + t.toString(16) });
  }
  const logs: NormalizedLog[] = [];
  const CONCURRENCY = 8;
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      ranges.slice(i, i + CONCURRENCY).map((r) =>
        lasnaRpc("eth_getLogs", [{ address, ...r }]) as Promise<LasnaRpcLog[]>
      )
    );
    for (const b of batch) {
      for (const l of b) {
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

/// @dev Unified log proxy: ?chain=base|uni|lasna&address=0x...
///      base/uni → Blockscout API (server-side), lasna → curl RPC (chunked).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chain = searchParams.get("chain");
  const address = searchParams.get("address");
  if (!chain || !address) {
    return NextResponse.json({ error: "chain and address required" }, { status: 400 });
  }
  try {
    let logs: NormalizedLog[];
    if (chain === "lasna") {
      logs = await fetchLasnaLogs(address);
    } else if (BLOCKSCOUT[chain]) {
      logs = await fetchBlockscoutLogs(BLOCKSCOUT[chain], address);
    } else {
      return NextResponse.json({ error: `unknown chain ${chain}` }, { status: 400 });
    }
    return NextResponse.json({ logs });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
