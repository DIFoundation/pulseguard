"use client";

import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge } from "@/components/ui";
import { deployments, isConfigured, baseSepolia, unichainSepolia, reactiveLasna } from "@pulseguard/config";
import { useReadContract } from "wagmi";
import { CrossChainExecutorAbi } from "@pulseguard/abi";

export default function ActivityPage() {
  const uniAddr = deployments.crossChainExecutor.address as `0x${string}`;
  const { data: recordCount } = useReadContract({
    abi: CrossChainExecutorAbi,
    address: isConfigured("crossChainExecutor") ? uniAddr : undefined,
    functionName: "recordCount",
    chainId: unichainSepolia.id,
    query: { enabled: isConfigured("crossChainExecutor") },
  });

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
            Once live testnet execution is performed, this timeline will show: origin tx → Reactive tx → callback request → destination tx,
            with measured latencies from actual block timestamps. No metrics are shown until real data exists.
          </p>
          <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-foreground/40">
            Awaiting first live execution — see docs/DEMO_SCRIPT.md for the demo flow.
          </div>
        </Card>
      </main>
    </div>
  );
}
