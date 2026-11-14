"use client";

import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge } from "@/components/ui";
import { usePolicies } from "@/hooks/useContracts";
import { deployments, isConfigured, baseSepolia } from "@pulseguard/config";
import { ProtectionManagerAbi } from "@pulseguard/abi";
import { useReadContract, useAccount } from "wagmi";
import Link from "next/link";
import { Plus } from "lucide-react";

const STATUS_LABELS = ["Created", "Active", "Triggered", "Executed", "Cancelled", "Expired", "Failed"];
const STATUS_TONES: Record<number, "default" | "success" | "warning" | "danger" | "accent"> = {
  0: "default", 1: "success", 2: "warning", 3: "accent", 4: "default", 5: "warning", 6: "danger",
};
const TRIGGER_LABELS = ["Stop-Loss", "Take-Profit", "Max Drawdown", "Emergency"];

export default function PoliciesPage() {
  const { address } = useAccount();
  const { nextId, deactivate, cancel, isPending } = usePolicies();
  const [filter, setFilter] = useState<string>("all");

  const count = nextId.data ? Number(nextId.data) : 0;
  const ids = Array.from({ length: Math.min(count - 1, 50) }, (_, i) => BigInt(i + 1));

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <PageHeader
          title="Protection Policies"
          description="On-chain protection policies stored in ProtectionManager."
          action={
            <Link href="/policies/create" className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
              <Plus className="h-4 w-4" /> New Policy
            </Link>
          }
        />

        {!isConfigured("protectionManager") && (
          <Card className="mb-6 border-warning/30 bg-warning/5 p-4 text-sm text-warning">
            ProtectionManager not deployed yet. Policies will appear here after deployment.
          </Card>
        )}

        <div className="mb-4 flex gap-2">
          {["all", "active", "executed", "cancelled"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm capitalize ${filter === f ? "bg-accent/15 text-accent" : "text-foreground/60 hover:bg-card"}`}
            >
              {f}
            </button>
          ))}
        </div>

        {ids.length === 0 ? (
          <Card className="p-8 text-center text-foreground/50">
            No policies yet. Create your first protection policy to get started.
          </Card>
        ) : (
          <div className="space-y-3">
            {ids.map((id) => (
              <PolicyRow key={id.toString()} id={id} filter={filter} onDeactivate={deactivate} onCancel={cancel} isPending={isPending} owner={address} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function PolicyRow({ id, filter, onDeactivate, onCancel, isPending, owner }: {
  id: bigint; filter: string;
  onDeactivate: (id: bigint) => void; onCancel: (id: bigint) => void;
  isPending: boolean; owner?: `0x${string}`;
}) {
  const { data: policyRaw } = useReadContract({
    abi: ProtectionManagerAbi,
    address: deployments.protectionManager.address as `0x${string}`,
    functionName: "getPolicy",
    args: [id],
    chainId: baseSepolia.id,
    query: { enabled: isConfigured("protectionManager") },
  });

  interface Policy {
    id: bigint; owner: `0x${string}`; asset: `0x${string}`; monitoredAsset: `0x${string}`;
    destinationChainId: bigint; triggerType: number; threshold: bigint; referencePrice: bigint;
    maxDrawdownBps: bigint; protectedAmount: bigint; recipient: `0x${string}`; action: number;
    status: number; createdAt: number; expiresAt: number; executedAt: number;
  }
  const policy = policyRaw as Policy | undefined;
  if (!policy) return null;
  const status = Number(policy.status);
  if (filter === "active" && status !== 1) return null;
  if (filter === "executed" && status !== 3) return null;
  if (filter === "cancelled" && status !== 4) return null;

  const isOwner = owner?.toLowerCase() === policy.owner.toLowerCase();

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-accent">#{id.toString()}</span>
          <Badge tone={STATUS_TONES[status] ?? "default"}>{STATUS_LABELS[status]}</Badge>
          <Badge tone="accent">{TRIGGER_LABELS[Number(policy.triggerType)]}</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-foreground/50">
          <span>Asset: <span className="font-mono">{policy.asset.slice(0, 8)}…</span></span>
          <span>Threshold: {policy.threshold.toString()}</span>
          <span>Amount: {policy.protectedAmount.toString()}</span>
          <span>Dest chain: {policy.destinationChainId.toString()}</span>
        </div>
      </div>
      {isOwner && (status === 1 || status === 0) && (
        <div className="flex gap-2">
          {status === 1 && (
            <button onClick={() => onDeactivate(id)} disabled={isPending} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-card disabled:opacity-50">
              Deactivate
            </button>
          )}
          <button onClick={() => onCancel(id)} disabled={isPending} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50">
            Cancel
          </button>
        </div>
      )}
    </Card>
  );
}
