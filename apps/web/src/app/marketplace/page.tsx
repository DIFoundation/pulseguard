"use client";

import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge } from "@/components/ui";
import Link from "next/link";
import { Shield, TrendingUp, Activity, AlertTriangle, Droplets, Siren } from "lucide-react";

const templates = [
  { icon: Shield, name: "Safe Exit", desc: "Automated vault exit: moves your protected funds to your wallet when price drops below threshold (transfer, not a market sell).", trigger: "Stop-Loss", triggerValue: 0, params: "threshold, amount" },
  { icon: TrendingUp, name: "Profit Lock", desc: "Take-profit that secures gains when price reaches your target.", trigger: "Take-Profit", triggerValue: 1, params: "threshold, amount" },
  { icon: Activity, name: "Volatility Shield", desc: "Maximum drawdown guard from a recorded reference price.", trigger: "Max Drawdown", triggerValue: 2, params: "reference, maxDrawdown%" },
  { icon: AlertTriangle, name: "Maximum Drawdown Guard", desc: "Triggers when loss from reference exceeds configured bps.", trigger: "Max Drawdown", triggerValue: 2, params: "reference, maxDrawdownBps" },
  { icon: Droplets, name: "Liquidity Guard", desc: "Emergency protection tied to liquidity-event monitoring.", trigger: "Emergency", triggerValue: 3, params: "threshold" },
  { icon: Siren, name: "Emergency Protection", desc: "Explicit emergency condition for rapid protective action.", trigger: "Emergency", triggerValue: 3, params: "threshold" },
];

export default function MarketplacePage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <PageHeader title="Policy Marketplace" description="Reusable protection templates. Customize parameters and activate on-chain." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(({ icon: Icon, name, desc, trigger, triggerValue, params }) => (
            <Card key={name} className="flex flex-col transition-transform hover:-translate-y-0.5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-accent/10 p-2">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="font-semibold">{name}</h3>
              </div>
              <p className="mt-2 flex-1 text-sm text-foreground/60">{desc}</p>
              <div className="mt-4 flex items-center gap-2">
                <Badge tone="accent">{trigger}</Badge>
                <span className="text-xs text-foreground/40">{params}</span>
              </div>
              <Link href={`/policies/create?trigger=${triggerValue}&template=${encodeURIComponent(name)}`} className="mt-4 rounded-lg border border-border px-4 py-2 text-center text-sm font-medium hover:bg-card">
                Use Template
              </Link>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
