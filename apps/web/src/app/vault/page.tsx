"use client";

import { useState } from "react";
import { Vault as VaultIcon, ArrowDownToLine, ArrowUpFromLine, Coins } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge, Skeleton } from "@/components/ui";
import { useVault, useTestToken } from "@/hooks/useContracts";
import { deployments, isConfigured } from "@pulseguard/config";
import { parseEther } from "viem";
import { formatTokenAmount, shortAddress } from "@/lib/format";
import { useAccount } from "wagmi";

export default function VaultPage() {
  const { isConnected } = useAccount();
  const { balance, availableBalance, totalDeposits, depositWithApproval, withdraw, flowStep, flowHash, flowReceipt, flowError, isPending, txHash, receipt, error, tokenAddr } = useVault();
  const { mint, isPending: mintPending, txHash: mintTx, receipt: mintReceipt, error: mintError } = useTestToken();
  const [amount, setAmount] = useState("");

  // Clear the amount input after a successful deposit or withdraw.
  // (Render-time state adjustment — avoids setState-in-effect.)
  const succeeded = flowReceipt.isSuccess || receipt.isSuccess;
  const [wasSucceeded, setWasSucceeded] = useState(false);
  if (succeeded !== wasSucceeded) {
    setWasSucceeded(succeeded);
    if (succeeded) setAmount("");
  }

  const configured = isConfigured("vault");
  const balLoading = balance.isLoading;
  const totalLoading = totalDeposits.isLoading;
  const bal = balance.data !== undefined && balance.data !== null ? formatTokenAmount(balance.data as bigint) : "0";
  const avail = availableBalance.data !== undefined && availableBalance.data !== null ? formatTokenAmount(availableBalance.data as bigint) : "0";
  const total = totalDeposits.data !== undefined && totalDeposits.data !== null ? formatTokenAmount(totalDeposits.data as bigint) : "0";

  // Reserved = balance - available (amount locked by active policies)
  const balBig = balance.data as bigint | undefined;
  const availBig = availableBalance.data as bigint | undefined;
  const reservedBig = balBig !== undefined && availBig !== undefined ? balBig - availBig : 0n;
  const reservedPct = balBig && balBig > 0n ? Number((reservedBig * 100n) / balBig) : 0;

  const handleDeposit = () => {
    try {
      depositWithApproval(parseEther(amount || "0"));
    } catch { /* invalid input */ }
  };
  const handleWithdraw = () => {
    try {
      withdraw(parseEther(amount || "0"));
    } catch { /* invalid input */ }
  };
  const handleMint = () => {
    try {
      mint(parseEther(amount || "0"));
    } catch { /* invalid input */ }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <PageHeader title="Protection Vault" description="Non-custodial vault for protected assets on Base Sepolia." />

        {!configured && (
          <Card className="mb-6 border-warning/30 bg-warning/5 p-4 text-sm text-warning">
            Vault contract not yet deployed. Set NEXT_PUBLIC_VAULT_ADDRESS after deployment.
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <div className="flex items-center gap-2">
              <VaultIcon className="h-4 w-4 text-accent" />
              <h3 className="font-semibold">Your Balance</h3>
            </div>
            <p className="mt-3 text-3xl font-bold">{isConnected ? (balLoading ? <Skeleton className="h-9 w-32" /> : bal) : "—"}</p>
            <p className="mt-1 text-sm text-foreground/50">protected asset units</p>
            {isConnected && balBig !== undefined && balBig > 0n && (
              <div className="mt-4">
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/10">
                  <div className="bg-success/70" style={{ width: `${100 - reservedPct}%` }} title="Available" />
                  <div className="bg-warning/70" style={{ width: `${reservedPct}%` }} title="Reserved by policies" />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-foreground/50">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success/70" /> Available</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning/70" /> Reserved by policies</span>
                </div>
              </div>
            )}
            <div className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-foreground/60">Available (unreserved)</span><span>{avail}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Reserved by policies</span><span>{formatTokenAmount(reservedBig)}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Total vault deposits</span><span>{totalLoading ? <Skeleton className="h-4 w-16" /> : total}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Vault contract</span><span className="font-mono text-xs" title={deployments.vault.address}>{shortAddress(deployments.vault.address)}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Asset token</span><span className="font-mono text-xs" title={tokenAddr}>{shortAddress(tokenAddr)}</span></div>
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold">Deposit / Withdraw</h3>
            <label className="mt-4 block text-sm text-foreground/60">Amount</label>
            <div className="relative mt-1">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-14 text-sm outline-none focus:border-accent"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground/40">pTST</span>
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={handleDeposit} disabled={!isConnected || isPending || flowStep !== "idle" || !configured} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                <ArrowDownToLine className="h-4 w-4" />
                {flowStep === "checking" && "Checking allowance…"}
                {flowStep === "approving" && "Approving token…"}
                {flowStep === "approval-confirmed" && "Approval confirmed — depositing…"}
                {flowStep === "depositing" && "Depositing…"}
                {flowStep === "deposit-confirmed" && "Deposit confirmed"}
                {flowStep === "idle" && "Deposit"}
              </button>
              <button onClick={handleWithdraw} disabled={!isConnected || isPending || !configured} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50">
                <ArrowUpFromLine className="h-4 w-4" />
                Withdraw
              </button>
            </div>
            {(txHash || flowHash) && <p className="mt-3 break-all font-mono text-xs text-foreground/50">tx: {flowHash ?? txHash}</p>}
            {(receipt.isSuccess || flowReceipt.isSuccess) && <Badge tone="success">Confirmed</Badge>}
            {error && <p className="mt-2 text-sm text-danger">{error.message.slice(0, 120)}</p>}
            {flowError && <p className="mt-2 text-sm text-danger">{flowError}</p>}
            <div className="mt-4 border-t border-border/50 pt-4">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-warning" />
                <h4 className="text-sm font-medium">Test tokens</h4>
                <Badge tone="warning">Testnet only</Badge>
              </div>
              <p className="mt-1 text-xs text-foreground/50">
                Mints pTST to your wallet — the mock token has a permissionless <code>mint()</code> for demos.
              </p>
              <button onClick={handleMint} disabled={!isConnected || mintPending || !configured} className="mt-3 w-full rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-medium text-warning disabled:opacity-50">
                {mintPending ? "Minting…" : `Mint ${amount || "0"} pTST`}
              </button>
              {mintTx && <p className="mt-2 break-all font-mono text-xs text-foreground/50">tx: {mintTx}</p>}
              {mintReceipt.isSuccess && <Badge tone="success">Minted</Badge>}
              {mintError && <p className="mt-2 text-sm text-danger">{mintError.message.slice(0, 120)}</p>}
            </div>
            <p className="mt-4 text-xs text-foreground/40">
              Protected exits can only be triggered by an authenticated Reactive callback per your active policy.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
