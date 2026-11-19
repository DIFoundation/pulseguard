"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TrendingDown, TrendingUp, Activity, Siren, Settings2, ListChecks, Rocket } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge } from "@/components/ui";
import { usePolicies, useVault } from "@/hooks/useContracts";
import { deployments, isConfigured } from "@pulseguard/config";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { formatTokenAmount } from "@/lib/format";

const TRIGGERS = [
  { value: 0, label: "Stop-Loss", desc: "Triggers when price falls to or below threshold — executes a protected vault exit to your recipient", icon: TrendingDown },
  { value: 1, label: "Take-Profit", desc: "Triggers when price reaches or exceeds threshold", icon: TrendingUp },
  { value: 2, label: "Max Drawdown", desc: "Triggers when loss from reference exceeds max drawdown", icon: Activity },
  { value: 3, label: "Emergency", desc: "Triggers on explicit emergency price condition", icon: Siren },
];

const PRICE_DECIMALS = 8;
const TOKEN_DECIMALS = 18;

/// @dev Parse a positive decimal string into wei-like units, enforcing max
///      fractional precision. Returns null for empty/invalid/non-finite input
///      (e.g. "abc" -> NaN must never slip through as a valid value).
function parsePositiveDecimal(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!Number.isFinite(Number(trimmed)) || Number(trimmed) <= 0) return null;
  const frac = trimmed.includes(".") ? trimmed.split(".")[1] : "";
  if (frac.length > decimals) return null;
  try {
    const parsed = parseUnits(trimmed, decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

/// @dev Parse an optional positive number (expiry days). Empty -> 0n (no expiry).
function parseOptionalPositive(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

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
  const { availableBalance } = useVault();
  const searchParams = useSearchParams();

  const initialTrigger = (() => {
    const t = searchParams.get("trigger");
    if (t === null) return 0;
    const v = Number(t);
    return v >= 0 && v <= 3 ? v : 0;
  })();

  const [triggerType, setTriggerType] = useState(initialTrigger);
  const [threshold, setThreshold] = useState("");
  const [referencePrice, setReferencePrice] = useState("");
  const [maxDrawdownPct, setMaxDrawdownPct] = useState("5");
  const [amount, setAmount] = useState("");
  const [destChain, setDestChain] = useState<84532 | 1301>(84532);
  const [expiresInDays, setExpiresInDays] = useState("");

  // Reset form state on success (render-time adjustment), then navigate away.
  const succeeded = receipt.isSuccess;
  const [wasSucceeded, setWasSucceeded] = useState(false);
  if (succeeded && !wasSucceeded) {
    setWasSucceeded(true);
    setThreshold("");
    setReferencePrice("");
    setMaxDrawdownPct("5");
    setAmount("");
    setDestChain(84532);
    setExpiresInDays("");
    setTriggerType(initialTrigger);
  }

  useEffect(() => {
    if (receipt.isSuccess) router.push("/policies");
  }, [receipt.isSuccess, router]);
  const templateName = searchParams.get("template");

  const feedAsset = deployments.testToken.address as `0x${string}`;
  const asset = deployments.testToken.address as `0x${string}`;


  // ---------- Validation (computed every render so errors show live) ----------
  const thresholdVal = parsePositiveDecimal(threshold, PRICE_DECIMALS);
  const refVal = parsePositiveDecimal(referencePrice, PRICE_DECIMALS);
  const amountVal = parsePositiveDecimal(amount, TOKEN_DECIMALS);
  const drawdownPct = parseOptionalPositive(maxDrawdownPct);
  const expiryDays = parseOptionalPositive(expiresInDays);

  const errors: Record<string, string> = {};
  if (triggerType !== 2) {
    if (threshold.trim() === "") errors.threshold = "Threshold price is required for this trigger.";
    else if (thresholdVal === null) errors.threshold = `Enter a positive price with at most ${PRICE_DECIMALS} decimals.`;
  } else {
    if (referencePrice.trim() === "") errors.referencePrice = "Reference price is required for Max Drawdown.";
    else if (refVal === null) errors.referencePrice = `Enter a positive price with at most ${PRICE_DECIMALS} decimals.`;
    if (maxDrawdownPct.trim() === "") errors.maxDrawdownPct = "Max drawdown is required for Max Drawdown.";
    else if (drawdownPct === null || drawdownPct >= 100) errors.maxDrawdownPct = "Enter a drawdown between 0 and 100%.";
  }
  if (amount.trim() === "") errors.amount = "Protected amount is required.";
  else if (amountVal === null) errors.amount = `Enter a positive amount with at most ${TOKEN_DECIMALS} decimals.`;
  if (expiresInDays.trim() !== "" && expiryDays === null) errors.expiresInDays = "Enter a positive number of days.";

  const availData = availableBalance.data;
  const exceedsBalance = availData !== undefined && availData !== null && amountVal !== null && amountVal > (availData as bigint);
  if (exceedsBalance) errors.amount = "Protected amount exceeds your available (unreserved) vault balance.";

  const hasErrors = Object.keys(errors).length > 0;
  const canSubmit =
    isConnected &&
    isConfigured("protectionManager") &&
    !hasErrors;

  const handleSubmit = () => {
    if (!address || !asset || asset === "0x" || hasErrors) return;
    if (thresholdVal === null && triggerType !== 2) return;
    if (triggerType === 2 && (refVal === null || drawdownPct === null || drawdownPct >= 100)) return;
    if (amountVal === null || expiryDays === null) return;

    const drawdownBps = triggerType === 2 && drawdownPct !== null ? BigInt(Math.round(drawdownPct * 100)) : 0n;
    const expiresAt = expiryDays > 0 ? BigInt(Math.floor(Date.now() / 1000) + Math.floor(expiryDays * 86400)) : 0n;

    createPolicy({
      owner: address,
      asset,
      monitoredAsset: feedAsset,
      destinationChainId: BigInt(destChain),
      triggerType,
      threshold: triggerType === 2 ? 0n : (thresholdVal ?? 0n),
      referencePrice: triggerType === 2 ? (refVal ?? 0n) : 0n,
      maxDrawdownBps: drawdownBps,
      protectedAmount: amountVal,
      recipient: address,
      action: 0,
      expiresAt,
    });
  };

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
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-accent" />
              <h3 className="font-semibold">1 · Trigger Strategy</h3>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {TRIGGERS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTriggerType(t.value)}
                  className={`rounded-lg border p-4 text-left transition-colors ${triggerType === t.value ? "border-accent bg-accent/10" : "border-border hover:bg-card"}`}
                >
                  <div className="flex items-center gap-2">
                    <t.icon className={`h-4 w-4 ${triggerType === t.value ? "text-accent" : "text-foreground/50"}`} />
                    <p className="font-medium">{t.label}</p>
                  </div>
                  <p className="mt-1 text-xs text-foreground/50">{t.desc}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-accent" />
              <h3 className="font-semibold">2 · Parameters</h3>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-foreground/60">Threshold price (USD, 8 decimals)</label>
                <input value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="1900.00" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
                {errors.threshold && <p className="mt-1 text-xs text-danger">{errors.threshold}</p>}
              </div>
              {triggerType === 2 && (
                <>
                  <div>
                    <label className="text-sm text-foreground/60">Reference price</label>
                    <input value={referencePrice} onChange={(e) => setReferencePrice(e.target.value)} placeholder="2000.00" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
                    {errors.referencePrice && <p className="mt-1 text-xs text-danger">{errors.referencePrice}</p>}
                  </div>
                  <div>
                    <label className="text-sm text-foreground/60">Max drawdown (%)</label>
                    <input value={maxDrawdownPct} onChange={(e) => setMaxDrawdownPct(e.target.value)} placeholder="5" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
                    {errors.maxDrawdownPct && <p className="mt-1 text-xs text-danger">{errors.maxDrawdownPct}</p>}
                  </div>
                </>
              )}
              <div>
                <label className="text-sm text-foreground/60">Protected amount</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.0" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
                {errors.amount && <p className="mt-1 text-xs text-danger">{errors.amount}</p>}
              </div>
              <div>
                <label className="text-sm text-foreground/60">Destination chain</label>
                <select value={destChain} onChange={(e) => setDestChain(Number(e.target.value) as 84532 | 1301)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent">
                  <option value={84532}>Base Sepolia (automated vault exit)</option>
                  <option value={1301}>Unichain Sepolia (attestation + manual settlement)</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-foreground/60">Expires in (days, optional)</label>
                <input value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} placeholder="30" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
                {errors.expiresInDays && <p className="mt-1 text-xs text-danger">{errors.expiresInDays}</p>}
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-accent" />
              <h3 className="font-semibold">3 · Review &amp; Deploy</h3>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-foreground/60">Strategy</span><span>{TRIGGERS[triggerType].label}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Threshold</span><span>{threshold || "—"}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Protected amount</span><span>{amount || "—"}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Destination</span><span>{destChain === 84532 ? "Base Sepolia (automated)" : "Unichain Sepolia (attestation + manual settle)"}</span></div>
              {availData !== undefined && availData !== null && (
                <div className="flex justify-between"><span className="text-foreground/60">Available balance</span><span>{formatTokenAmount(availData as bigint)}</span></div>
              )}
            </div>
            <p className="mt-4 text-xs text-foreground/50">
              {destChain === 84532
                ? "On trigger, Reactive Network requests an authenticated callback and the Base executor performs a protected vault exit automatically — funds go to your recipient, never to an arbitrary address."
                : "On trigger, Reactive Network records a verifiable attestation on Unichain. Settlement on Base is manual: use the Settle action on the policy page after the attestation lands."}
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
