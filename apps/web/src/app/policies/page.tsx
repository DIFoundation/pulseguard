"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge, Skeleton } from "@/components/ui";
import { usePolicies } from "@/hooks/useContracts";
import { deployments, isConfigured, baseSepolia, unichainSepolia } from "@pulseguard/config";
import { CrossChainExecutorAbi, ProtectionManagerAbi } from "@pulseguard/abi";
import { useReadContracts, useAccount } from "wagmi";
import { formatPrice, formatTokenAmount, shortAddress } from "@/lib/format";
import Link from "next/link";
import { Plus } from "lucide-react";

const STATUS_LABELS = ["Created", "Active", "Triggered", "Executed", "Cancelled", "Expired", "Failed"];
const STATUS_TONES: Record<number, "default" | "success" | "warning" | "danger" | "accent"> = {
  0: "default", 1: "success", 2: "warning", 3: "accent", 4: "default", 5: "warning", 6: "danger",
};
const TRIGGER_LABELS = ["Stop-Loss", "Take-Profit", "Max Drawdown", "Emergency"];
// Status codes: 0=Created(deactivated), 1=Active, 2=Triggered, 3=Executed,
// 4=Cancelled, 5=Expired, 6=Failed. "attested" is a cross-chain flag, not a status.
const FILTER_STATUS: Record<string, number> = { active: 1, deactivated: 0, executed: 3, cancelled: 4, expired: 5 };

const PAGE_SIZE = 10;

interface Policy {
  id: bigint; owner: `0x${string}`; asset: `0x${string}`; monitoredAsset: `0x${string}`;
  destinationChainId: bigint; triggerType: number; threshold: bigint; referencePrice: bigint;
  maxDrawdownBps: bigint; protectedAmount: bigint; recipient: `0x${string}`; action: number;
  status: number; createdAt: bigint; expiresAt: bigint; executedAt: bigint;
}

export default function PoliciesPage() {
  const { address } = useAccount();
  const { nextId, deactivate, cancel, expire, settle, isPending, error } = usePolicies();
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const count = nextId.data ? Number(nextId.data) : 0;
  // Newest first — policy ids are sequential, so iterate descending.
  const ids = Array.from({ length: Math.min(count - 1, 50) }, (_, i) => BigInt(count - 1 - i));

  // One multicall for every policy read on Base (replaces ~50 individual hooks).
  const policyCalls = ids.map((id) => ({
    abi: ProtectionManagerAbi,
    address: deployments.protectionManager.address as `0x${string}`,
    functionName: "getPolicy" as const,
    args: [id] as const,
    chainId: baseSepolia.id,
  }));
  const { data: policyResults, isLoading: policiesLoading } = useReadContracts({
    contracts: policyCalls,
    query: { enabled: isConfigured("protectionManager") && ids.length > 0, refetchInterval: 8000 },
  });

  // One multicall for Unichain attestation flags.
  const attestationCalls = isConfigured("crossChainExecutor")
    ? ids.map((id) => ({
        abi: CrossChainExecutorAbi,
        address: deployments.crossChainExecutor.address as `0x${string}`,
        functionName: "executedPolicies" as const,
        args: [id] as const,
        chainId: unichainSepolia.id,
      }))
    : [];
  const { data: attestationResults } = useReadContracts({
    contracts: attestationCalls,
    query: { enabled: attestationCalls.length > 0, refetchInterval: 10000 },
  });

  const policiesById = new Map<string, Policy>();
  const statuses: Record<string, number> = {};
  policyResults?.forEach((r, i) => {
    if (r.status === "success" && r.result) {
      const p = r.result as Policy;
      policiesById.set(ids[i].toString(), p);
      statuses[ids[i].toString()] = Number(p.status);
    }
  });
  const attested: Record<string, boolean> = {};
  attestationResults?.forEach((r, i) => {
    if (r.status === "success" && typeof r.result === "boolean") {
      attested[ids[i].toString()] = r.result;
    }
  });

  const countFor = (f: string) => {
    if (f === "all") return ids.length;
    if (f === "attested") return ids.filter((id) => attested[id.toString()] === true).length;
    const target = FILTER_STATUS[f];
    return ids.filter((id) => statuses[id.toString()] === target).length;
  };

  const matchesFilter = (id: bigint) => {
    if (filter === "all") return true;
    if (filter === "attested") return attested[id.toString()] === true;
    const target = FILTER_STATUS[filter];
    return statuses[id.toString()] === target;
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

        <div className="mb-4 flex flex-wrap gap-2">
          {["all", "active", "deactivated", "attested", "executed", "cancelled", "expired"].map((f) => (
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
            {policiesLoading ? "Loading policies…" : `No ${filter} policies.`}
          </Card>
        ) : (
          <>
          {error && <p className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger">{error.message.slice(0, 160)}</p>}
          <div className="space-y-3">
            {pageIds.map((id) => (
              <PolicyRow
                key={id.toString()}
                id={id}
                policy={policiesById.get(id.toString())}
                attested={attested[id.toString()]}
                loading={policiesLoading}
                onDeactivate={deactivate}
                onCancel={cancel}
                onExpire={expire}
                onSettle={settle}
                isPending={isPending}
                owner={address}
              />
            ))}
          </div>
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

function PolicyRow({ id, policy, attested, loading, onDeactivate, onCancel, onExpire, onSettle, isPending, owner }: {
  id: bigint;
  policy?: Policy;
  attested?: boolean;
  loading: boolean;
  onDeactivate: (id: bigint) => void; onCancel: (id: bigint) => void; onExpire: (id: bigint) => void; onSettle: (id: bigint) => void;
  isPending: boolean; owner?: `0x${string}`;
}) {
  const [expanded, setExpanded] = useState(false);
  // Snapshot of "now" for expiry checks — computed once per row mount.
  const [nowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  if (loading && !policy) {
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
          </div>
        )}
      </div>
      {(status === 0 || status === 1) && (
        <div className="flex gap-2">
          {isOwner && isConfigured("settlementRelay") && policy.destinationChainId === 1301n && attested === true && (
            <button
              onClick={() => onSettle(id)}
              disabled={isPending}
              title="Settle on Base via SettlementRelay (re-validates trigger on-chain). Requires a recorded Unichain attestation."
              className="rounded-lg border border-accent/50 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              Settle
            </button>
          )}
          {isOwner && status === 1 && (
            <button onClick={() => onDeactivate(id)} disabled={isPending} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-card disabled:opacity-50">
              Deactivate
            </button>
          )}
          {isOwner && status === 1 && (
            <button onClick={() => onCancel(id)} disabled={isPending} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50">
              Cancel
            </button>
          )}
          {policy.expiresAt > 0n && nowSec > policy.expiresAt && (status === 0 || status === 1) && (
            <button
              onClick={() => onExpire(id)}
              disabled={isPending}
              title="Policy expired — reclaim the reserved vault balance (permissionless on-chain)"
              className="rounded-lg border border-warning/50 px-3 py-1.5 text-xs text-warning hover:bg-warning/10 disabled:opacity-50"
            >
              Expire
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
