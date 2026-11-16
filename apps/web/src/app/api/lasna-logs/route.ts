import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const RPC = process.env.LASNA_RPC_URL ?? "https://lasna-rpc.rnk.dev/";
const ADDRESS =
  process.env.NEXT_PUBLIC_REACTIVE_ADDRESS ?? "0x79d74e8799881524de20cc294744137db840853f";

/// @dev The Lasna erpc gateway fingerprints TLS clients and rejects Node's fetch
///      (undici) with "fetch failed", while curl works. Use curl as the transport.
async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const { stdout } = await execFileAsync(
    "curl",
    ["-s", "-m", "30", "-X", "POST", RPC, "-H", "content-type: application/json", "-d", body],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  const json = JSON.parse(stdout) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

export interface LasnaLog {
  blockNumber: string;
  transactionHash: `0x${string}`;
  logIndex: string;
  data: `0x${string}`;
  topics: [`0x${string}`, ...`0x${string}`[]];
}

/// @dev Server-side proxy for Lasna eth_getLogs — avoids browser CORS/rate-limit
///      issues. Lasna produces ~4 blocks/sec, so the window must be wide (200k
///      blocks ≈ 14h) to cover the demo history. Chunks are fetched in parallel
///      batches server-side (the RPC rejects huge single ranges).
export async function GET() {
  try {
    const latestHex = (await rpc("eth_blockNumber", [])) as string;
    const latest = BigInt(latestHex);
    const from = latest > 200_000n ? latest - 200_000n : 0n;
    const CHUNK = 10_000n;
    const ranges: { fromBlock: string; toBlock: string }[] = [];
    for (let f = from; f <= latest; f += CHUNK) {
      const t = f + CHUNK - 1n > latest ? latest : f + CHUNK - 1n;
      ranges.push({ fromBlock: "0x" + f.toString(16), toBlock: "0x" + t.toString(16) });
    }
    const logs: LasnaLog[] = [];
    const CONCURRENCY = 8;
    for (let i = 0; i < ranges.length; i += CONCURRENCY) {
      const batch = await Promise.all(
        ranges.slice(i, i + CONCURRENCY).map((r) =>
          rpc("eth_getLogs", [{ address: ADDRESS, ...r }]) as Promise<LasnaLog[]>
        )
      );
      for (const b of batch) logs.push(...b);
    }
    return NextResponse.json({ logs });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
