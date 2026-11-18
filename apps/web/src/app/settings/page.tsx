"use client";

import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge } from "@/components/ui";
import { useAccount } from "wagmi";
import { deployments } from "@pulseguard/config";

export default function SettingsPage() {
  const { address, chainId, isConnected } = useAccount();

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader title="Settings" description="Wallet, network, and protocol configuration." />

        <div className="space-y-6">
          <Card>
            <h3 className="font-semibold">Wallet</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-foreground/60">Connected</span><span>{isConnected ? "Yes" : "No"}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Address</span><span className="font-mono text-xs">{address ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Chain ID</span><span>{chainId ?? "—"}</span></div>
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold">Networks</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between"><span>Base Sepolia (origin + primary destination)</span><Badge tone="success">84532</Badge></li>
              <li className="flex justify-between"><span>Unichain Sepolia (cross-chain destination)</span><Badge tone="success">1301</Badge></li>
              <li className="flex justify-between"><span>Reactive Lasna (monitoring only)</span><Badge tone="accent">5318007</Badge></li>
            </ul>
          </Card>

          <Card>
            <h3 className="font-semibold">Protocol</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-foreground/60">Reactive library</span><span>reactive-lib-omni (Omni architecture)</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Solidity</span><span>0.8.29</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Oracle mode</span><span>Mock (testnet)</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Deployment status</span><span>{Object.values(deployments).some(d => d.address) ? "Configured" : "Pending"}</span></div>
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold">Disclaimer</h3>
            <p className="mt-2 text-sm text-foreground/60">
              PulseGuard is a testnet hackathon prototype. It is not audited and must not be used with real funds.
              Mock oracle prices are operator-published, not market data.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
