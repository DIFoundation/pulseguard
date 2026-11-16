"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge } from "@/components/ui";
import { usePolicies } from "@/hooks/useContracts";
import { deployments, isConfigured, baseSepolia, unichainSepolia } from "@pulseguard/config";
import { useAccount } from "wagmi";
import { parseEther, parseUnits } from "viem";

const TRIGGERS = [
  { value: 0, label: "Stop-Loss", desc: "Triggers when price falls to or below threshold — executes a protected vault exit to your recipient" },
  { value: 1, label: "Take-Profit", desc: "Triggers when price reaches or exceeds threshold" },
  { value: 2, label: "Max Drawdown", desc: "Triggers when loss from reference exceeds max drawdown" },
  { value: 3, label: "Emergency", desc: "Triggers on explicit emergency price condition" },
];

export default function CreatePolicyPage() {
  return (
    <Suspense fallback={null}>
      <CreatePolicyForm />
    </Suspense>
  );
}

function CreatePolicyForm() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const { createPolicy, isPending, txHash, receipt, error } = usePolicies();
  const searchParams = useSearchParams();

  const initialTrigger = (() => {
    const t = searchParams.get("trigger");
    if (t === null) return 0;
    const v = Number(t);
    return v >= 0 && v <= 3 ? v : 0;
  })();

  useEffect(() => {
    if (!receipt.isSuccess) return;
    // Reset all form state before leaving — coming back starts clean.
    setThreshold("");
    setReferencePrice("");
    setMaxDrawdownPct("5");
    setAmount("");
    setDestChain(84532);
    setExpiresInDays("");
    setTriggerType(initialTrigger);
    router.push("/policies");
  }, [receipt.isSuccess, router, initialTrigger]);
  const templateName = searchParams.get("template");

  const [triggerType, setTriggerType] = useState(initialTrigger);
  const [threshold, setThreshold] = useState("");
  const [referencePrice, setReferencePrice] = useState("");
  const [maxDrawdownPct, setMaxDrawdownPct] = useState("5");
  const [amount, setAmount] = useState("");
  const [destChain, setDestChain] = useState<84532 | 1301>(84532);
  const [expiresInDays, setExpiresInDays] = useState("");

  const feedAsset = deployments.testToken.address as `0x${string}`;
  const asset = deployments.testToken.address as `0x${string}`;


  const handleSubmit = () => {
    if (!address || !asset || asset === "0x") return;
    const thresholdWei = threshold ? parseUnits(threshold, 8) : 0n;
    const refWei = referencePrice ? parseUnits(referencePrice, 8) : 0n;
    const drawdownBps = maxDrawdownPct ? BigInt(Math.round(parseFloat(maxDrawdownPct) * 100)) : 0n;
    const amountWei = amount ? parseEther(amount) : 0n;
    const expiresAt = expiresInDays ? BigInt(Math.floor(Date.now() / 1000) + Math.floor(parseFloat(expiresInDays) * 86400)) : 0n;

    createPolicy({
      owner: address,
      asset,
      monitoredAsset: feedAsset,
      destinationChainId: BigInt(destChain),
      triggerType,
      threshold: thresholdWei,
      referencePrice: refWei,
      maxDrawdownBps: drawdownBps,
      protectedAmount: amountWei,
      recipient: address,
      action: 0,
      expiresAt,
    });
  };

  const canSubmit = isConnected && isConfigured("protectionManager") && amount !== "" && (triggerType !== 2 || (referencePrice !== "" && maxDrawdownPct !== ""));

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader
          title="Create Protection Policy"
          description={templateName ? `Template: ${templateName} — customize parameters below.` : "Configure an autonomous protection policy enforced by smart contracts and Reactive Network."}
        />

        {!isConfigured("protectionManager") && (
          <Card className="mb-6 border-warning/30 bg-warning/5 p-4 text-sm text-warning">
            ProtectionManager not deployed. Set NEXT_PUBLIC_MANAGER_ADDRESS after deployment.
          </Card>
        )}

        <div className="space-y-6">
          <Card>
            <h3 className="font-semibold">Trigger Strategy</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {TRIGGERS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTriggerType(t.value)}
                  className={`rounded-lg border p-4 text-left transition-colors ${triggerType === t.value ? "border-accent bg-accent/10" : "border-border hover:bg-card"}`}
                >
                  <p className="font-medium">{t.label}</p>
                  <p className="mt-1 text-xs text-foreground/50">{t.desc}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold">Parameters</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-foreground/60">Threshold price (USD, 8 decimals)</label>
                <input value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="1900.00" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
              {triggerType === 2 && (
                <>
                  <div>
                    <label className="text-sm text-foreground/60">Reference price</label>
                    <input value={referencePrice} onChange={(e) => setReferencePrice(e.target.value)} placeholder="2000.00" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-sm text-foreground/60">Max drawdown (%)</label>
                    <input value={maxDrawdownPct} onChange={(e) => setMaxDrawdownPct(e.target.value)} placeholder="5" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
                  </div>
                </>
              )}
              <div>
                <label className="text-sm text-foreground/60">Protected amount</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.0" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-sm text-foreground/60">Destination chain</label>
                <select value={destChain} onChange={(e) => setDestChain(Number(e.target.value) as 84532 | 1301)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent">
                  <option value={84532}>Base Sepolia (executes vault action)</option>
                  <option value={1301}>Unichain Sepolia (cross-chain attestation)</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-foreground/60">Expires in (days, optional)</label>
                <input value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} placeholder="30" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold">Review</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-foreground/60">Strategy</span><span>{TRIGGERS[triggerType].label}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Threshold</span><span>{threshold || "—"}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Protected amount</span><span>{amount || "—"}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Destination</span><span>{destChain === 84532 ? "Base Sepolia" : "Unichain Sepolia"}</span></div>
            </div>
            <p className="mt-4 text-xs text-foreground/50">
              On trigger, Reactive Network will request an authenticated callback. The destination executor re-validates
              the policy and performs a protected vault exit — funds transfer to your recipient (no swap/sale is executed),
              never to an arbitrary address.
            </p>
            <button onClick={handleSubmit} disabled={!canSubmit || isPending} className="mt-6 w-full rounded-lg bg-accent px-4 py-3 font-medium text-white disabled:opacity-50">
              {isPending ? "Creating…" : "Create Policy"}
            </button>
            {txHash && <p className="mt-3 break-all font-mono text-xs text-foreground/50">tx: {txHash}</p>}
            {receipt.isSuccess && <Badge tone="success">Policy created</Badge>}
            {error && <p className="mt-2 text-sm text-danger">{error.message.slice(0, 140)}</p>}
          </Card>
        </div>
      </main>
    </div>
  );
}
