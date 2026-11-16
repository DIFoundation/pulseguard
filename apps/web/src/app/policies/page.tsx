"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge, Skeleton } from "@/components/ui";
import { usePolicies } from "@/hooks/useContracts";
import { deployments, isConfigured, baseSepolia, unichainSepolia } from "@pulseguard/config";
import { CrossChainExecutorAbi, ProtectionManagerAbi } from "@pulseguard/abi";
import { useReadContract, useAccount } from "wagmi";
import { formatPrice, formatTokenAmount, shortAddress } from "@/lib/format";
import Link from "next/link";
import { Plus } from "lucide-react";

const STATUS_LABELS = ["Created", "Active", "Triggered", "Executed", "Cancelled", "Expired", "Failed"];
const STATUS_TONES: Record<number, "default" | "success" | "warning" | "danger" | "accent"> = {
  0: "default", 1: "success", 2: "warning", 3: "accent", 4: "default", 5: "warning", 6: "danger",
};
const TRIGGER_LABELS = ["Stop-Loss", "Take-Profit", "Max Drawdown", "Emergency"];

const PAGE_SIZE = 10;

export default function PoliciesPage() {
  const { address } = useAccount();
  const { nextId, deactivate, cancel, settle, isPending } = usePolicies();
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, number>>({});

  const count = nextId.data ? Number(nextId.data) : 0;
  // Newest first — policy ids are sequential, so iterate descending.
  const ids = Array.from({ length: Math.min(count - 1, 50) }, (_, i) => BigInt(count - 1 - i));

  const reportStatus = useCallback((id: bigint, status: number) => {
    setStatuses((prev) => (prev[id.toString()] === status ? prev : { ...prev, [id.toString()]: status }));
  }, []);

  const countFor = (f: string) =>
    f === "all" ? ids.length : ids.filter((id) => statuses[id.toString()] === ({ active: 1, executed: 3, cancelled: 4 } as Record<string, number>)[f]).length;

  const matchesFilter = (id: bigint) => {
    if (filter === "all") return true;
    const s = statuses[id.toString()];
    if (s === undefined) return false;
    if (filter === "active") return s === 1;
    if (filter === "executed") return s === 3;
    if (filter === "cancelled") return s === 4;
    return true;
  };

  const visibleIds = ids.filter(matchesFilter);
  const pageCount = Math.max(1, Math.ceil(visibleIds.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageIds = visibleIds.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

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
              onClick={() => { setFilter(f); setPage(0); }}
              className={`rounded-lg px-3 py-1.5 text-sm capitalize ${filter === f ? "bg-accent/15 text-accent" : "text-foreground/60 hover:bg-card"}`}
            >
              {f} <span className="ml-1 text-xs opacity-60">({countFor(f)})</span>
            </button>
          ))}
        </div>

        {ids.length === 0 ? (
          <Card className="p-8 text-center text-foreground/50">
            No policies yet. Create your first protection policy to get started.
          </Card>
        ) : visibleIds.length === 0 ? (
          <Card className="p-8 text-center text-foreground/50">
            No {filter} policies.
          </Card>
        ) : (
          <>
          <div className="space-y-3">
            {pageIds.map((id) => (
              <PolicyRow key={id.toString()} id={id} filter={filter} onDeactivate={deactivate} onCancel={cancel} onSettle={settle} isPending={isPending} owner={address} />
            ))}
          </div>
          {ids.map((id) => (
            <PolicyProbe key={`probe-${id.toString()}`} id={id} onStatus={reportStatus} />
          ))}
          {visibleIds.length > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-foreground/60">
              <span>
                Page {safePage + 1} of {pageCount} · {visibleIds.length} policies
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-card disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-card disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </main>
    </div>
  );
}

function PolicyProbe({ id, onStatus }: { id: bigint; onStatus: (id: bigint, status: number) => void }) {
  const { data } = useReadContract({
    abi: ProtectionManagerAbi,
    address: deployments.protectionManager.address as `0x${string}`,
    functionName: "getPolicy",
    args: [id],
    chainId: baseSepolia.id,
    query: { enabled: isConfigured("protectionManager"), refetchInterval: 8000 },
  });
  useEffect(() => {
    const raw = data as { status?: number } | undefined;
    if (raw && typeof raw.status === "number") onStatus(id, raw.status);
  }, [data, id, onStatus]);
  return null;
}

function PolicyRow({ id, filter, onDeactivate, onCancel, onSettle, isPending, owner }: {
  id: bigint; filter: string;
  onDeactivate: (id: bigint) => void; onCancel: (id: bigint) => void; onSettle: (id: bigint) => void;
  isPending: boolean; owner?: `0x${string}`;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: policyRaw, isLoading } = useReadContract({
    abi: ProtectionManagerAbi,
    address: deployments.protectionManager.address as `0x${string}`,
    functionName: "getPolicy",
    args: [id],
    chainId: baseSepolia.id,
    query: { enabled: isConfigured("protectionManager"), refetchInterval: 8000 },
  });

  // Unichain attestation probe — CrossChainExecutor.executedPolicies(policyId).
  // Attestation proves the trigger fired cross-chain; it does not execute a vault exit.
  const { data: attested } = useReadContract({
    abi: CrossChainExecutorAbi,
    address: isConfigured("crossChainExecutor") ? (deployments.crossChainExecutor.address as `0x${string}`) : undefined,
    functionName: "executedPolicies",
    args: [id],
    chainId: unichainSepolia.id,
    query: { enabled: isConfigured("crossChainExecutor"), refetchInterval: 10000 },
  });

  interface Policy {
    id: bigint; owner: `0x${string}`; asset: `0x${string}`; monitoredAsset: `0x${string}`;
    destinationChainId: bigint; triggerType: number; threshold: bigint; referencePrice: bigint;
    maxDrawdownBps: bigint; protectedAmount: bigint; recipient: `0x${string}`; action: number;
    status: number; createdAt: bigint; expiresAt: bigint; executedAt: bigint; hash: `0x${string}`;
  }
  const policy = policyRaw as Policy | undefined;
  if (isLoading) {
    return (
      <Card className="flex items-center gap-4">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-4 flex-1" />
      </Card>
    );
  }
  if (!policy) return null;
  const status = Number(policy.status);
  if (filter === "active" && status !== 1) return null;
  if (filter === "executed" && status !== 3) return null;
  if (filter === "cancelled" && status !== 4) return null;

  const isOwner = owner?.toLowerCase() === policy.owner.toLowerCase();

  const fmtTs = (ts: bigint | number) => {
    const n = Number(ts);
    return n > 0 ? new Date(n * 1000).toLocaleString() : "—";
  };

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center gap-3 text-left">
          <span className="font-mono text-sm text-accent">#{id.toString()}</span>
          <Badge tone={STATUS_TONES[status] ?? "default"}>{STATUS_LABELS[status]}</Badge>
          <Badge tone="accent">{TRIGGER_LABELS[Number(policy.triggerType)]}</Badge>
          {attested === true && <Badge tone="success">Attested on Unichain</Badge>}
          {expanded ? <ChevronUp className="ml-auto h-4 w-4 text-foreground/40" /> : <ChevronDown className="ml-auto h-4 w-4 text-foreground/40" />}
        </button>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-foreground/50">
          <span>Asset: <span className="font-mono" title={policy.asset}>{shortAddress(policy.asset)}</span></span>
          <span>Threshold: {formatPrice(policy.threshold)}</span>
          <span>Amount: {formatTokenAmount(policy.protectedAmount)} tokens</span>
          <span>Dest chain: {policy.destinationChainId.toString()}</span>
        </div>
        {expanded && (
          <div className="mt-4 grid gap-x-8 gap-y-2 border-t border-border/50 pt-4 text-xs sm:grid-cols-2">
            <div className="flex justify-between gap-4"><span className="text-foreground/50">Owner</span><span className="font-mono" title={policy.owner}>{shortAddress(policy.owner)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-foreground/50">Recipient</span><span className="font-mono" title={policy.recipient}>{shortAddress(policy.recipient)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-foreground/50">Monitored asset</span><span className="font-mono" title={policy.monitoredAsset}>{shortAddress(policy.monitoredAsset)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-foreground/50">Reference price</span><span>{policy.referencePrice > 0n ? formatPrice(policy.referencePrice) : "—"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-foreground/50">Max drawdown</span><span>{policy.maxDrawdownBps > 0n ? `${Number(policy.maxDrawdownBps) / 100}%` : "—"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-foreground/50">Action</span><span>{policy.action === 0 ? "Protected exit" : `#${policy.action}`}</span></div>
            <div className="flex justify-between gap-4"><span className="text-foreground/50">Created</span><span>{fmtTs(policy.createdAt)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-foreground/50">Expires</span><span>{fmtTs(policy.expiresAt)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-foreground/50">Executed</span><span>{fmtTs(policy.executedAt)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-foreground/50">Unichain attestation</span><span>{attested === true ? "Recorded — use Settle to execute on Base" : "—"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-foreground/50">Policy hash</span><span>{policy.hash}</span></div>
          </div>
        )}
      </div>
      {status === 1 && (
        <div className="flex gap-2">
          {isOwner && (
            <button
              onClick={() => onSettle(id)}
              disabled={isPending}
              title="Settle on Base via SettlementRelay (re-validates trigger on-chain)"
              className="rounded-lg border border-accent/50 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              Settle
            </button>
          )}
          {isOwner && (
            <button onClick={() => onDeactivate(id)} disabled={isPending} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-card disabled:opacity-50">
              Deactivate
            </button>
          )}
          {isOwner && (
            <button onClick={() => onCancel(id)} disabled={isPending} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50">
              Cancel
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
