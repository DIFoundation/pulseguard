"use client";

import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge } from "@/components/ui";
import { useVault } from "@/hooks/useContracts";
import { deployments, isConfigured } from "@pulseguard/config";
import { parseEther } from "viem";
import { formatTokenAmount, shortAddress } from "@/lib/format";
import { useAccount } from "wagmi";

export default function VaultPage() {
  const { address, isConnected } = useAccount();
  const { balance, totalDeposits, deposit, withdraw, isPending, txHash, receipt, error, tokenAddr } = useVault();
  const [amount, setAmount] = useState("");

  const configured = isConfigured("vault");
  const bal = balance.data !== undefined && balance.data !== null ? formatTokenAmount(balance.data as bigint) : "0";
  const total = totalDeposits.data !== undefined && totalDeposits.data !== null ? formatTokenAmount(totalDeposits.data as bigint) : "0";

  const handleDeposit = () => {
    try {
      deposit(parseEther(amount || "0"));
    } catch { /* invalid input */ }
  };
  const handleWithdraw = () => {
    try {
      withdraw(parseEther(amount || "0"));
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
            <h3 className="font-semibold">Your Balance</h3>
            <p className="mt-3 text-3xl font-bold">{isConnected ? bal : "—"}</p>
            <p className="mt-1 text-sm text-foreground/50">protected asset units</p>
            <div className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-foreground/60">Total vault deposits</span><span>{total}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Vault contract</span><span className="font-mono text-xs" title={deployments.vault.address}>{shortAddress(deployments.vault.address)}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Asset token</span><span className="font-mono text-xs" title={tokenAddr}>{shortAddress(tokenAddr)}</span></div>
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold">Deposit / Withdraw</h3>
            <label className="mt-4 block text-sm text-foreground/60">Amount</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <div className="mt-4 flex gap-3">
              <button onClick={handleDeposit} disabled={!isConnected || isPending || !configured} className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {isPending ? "Depositing…" : "Deposit"}
              </button>
              <button onClick={handleWithdraw} disabled={!isConnected || isPending || !configured} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50">
                Withdraw
              </button>
            </div>
            {txHash && <p className="mt-3 break-all font-mono text-xs text-foreground/50">tx: {txHash}</p>}
            {receipt.isSuccess && <Badge tone="success">Confirmed</Badge>}
            {error && <p className="mt-2 text-sm text-danger">{error.message.slice(0, 120)}</p>}
            <p className="mt-4 text-xs text-foreground/40">
              Protected exits can only be triggered by an authenticated Reactive callback per your active policy.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
