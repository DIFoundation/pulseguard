"use client";

import { Navbar } from "@/components/Navbar";
import { PageHeader, StatCard, Card, Badge, Skeleton } from "@/components/ui";
import { useAccount } from "wagmi";
import { useVault, usePolicies } from "@/hooks/useContracts";
import { isConfigured } from "@pulseguard/config";
import { formatTokenAmount } from "@/lib/format";
import Link from "next/link";

export default function DashboardPage() {
  const { isConnected } = useAccount();
  const { balance, totalDeposits } = useVault();
  const { nextId } = usePolicies();

  const protectedValue = balance.data ? formatTokenAmount(balance.data as bigint) : "—";
  const totalValue = totalDeposits.data ? formatTokenAmount(totalDeposits.data as bigint) : "—";
  const policyCount = nextId.data ? Number(nextId.data) - 1 : null;
  const statsLoading = balance.isLoading || totalDeposits.isLoading || nextId.isLoading;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <PageHeader
          title="Dashboard"
          description="Real-time protection overview across supported networks."
          action={
            <Link href="/policies/create" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
              New Policy
            </Link>
          }
        />

        {!isConnected && (
          <Card className="mb-6 border-warning/30 bg-warning/5 p-4 text-sm text-warning">
            Connect your wallet to view account-specific data.
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Your Protected Balance" value={isConnected ? (statsLoading ? <Skeleton className="h-8 w-24" /> : protectedValue) : "—"} sub="vault shares (asset units)" />
          <StatCard label="Total Vault Deposits" value={statsLoading ? <Skeleton className="h-8 w-24" /> : totalValue} sub="all users, Base Sepolia" />
          <StatCard label="Policies Created" value={statsLoading ? <Skeleton className="h-8 w-16" /> : (policyCount ?? "—")} sub="on-chain policy count" />
          <StatCard label="Networks" value="2" sub="Base Sepolia · Unichain Sepolia" />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="font-semibold">Contract Status</h3>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                { name: "Protection Vault", key: "vault" as const, chain: "Base Sepolia" },
                { name: "Protection Manager", key: "protectionManager" as const, chain: "Base Sepolia" },
                { name: "Price Feed (mock)", key: "priceFeed" as const, chain: "Base Sepolia" },
                { name: "Base Executor", key: "protectionExecutor" as const, chain: "Base Sepolia" },
                { name: "Unichain Executor", key: "crossChainExecutor" as const, chain: "Unichain Sepolia" },
                { name: "Reactive Contract", key: "reactive" as const, chain: "Reactive Lasna" },
              ].map(({ name, key, chain }) => (
                <li key={key} className="flex items-center justify-between">
                  <span className="text-foreground/70">{name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-foreground/40">{chain}</span>
                    {isConfigured(key) ? <Badge tone="success">Deployed</Badge> : <Badge tone="warning">Pending</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h3 className="font-semibold">Execution Pipeline</h3>
            <ol className="mt-4 space-y-3 text-sm text-foreground/70">
              <li className="flex gap-3"><span className="text-accent">1.</span> Price event emitted on Base Sepolia</li>
              <li className="flex gap-3"><span className="text-accent">2.</span> Reactive Network (Lasna) evaluates policy</li>
              <li className="flex gap-3"><span className="text-accent">3.</span> Authenticated callback to destination executor</li>
              <li className="flex gap-3"><span className="text-accent">4.</span> Protection action executed on-chain</li>
            </ol>
            <p className="mt-4 text-xs text-foreground/40">
              Latency metrics appear here once live testnet execution data is indexed. No values are fabricated.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
