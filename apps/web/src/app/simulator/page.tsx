"use client";

import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { PageHeader, Card, Badge } from "@/components/ui";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface Scenario {
  id: number;
  reference: number;
  hypothetical: number;
  stopLossPct: number;
  takeProfitPct: number;
  outcome: string;
  timestamp: number;
}

export default function SimulatorPage() {
  const [reference, setReference] = useState("2000");
  const [hypothetical, setHypothetical] = useState("1800");
  const [stopLossPct, setStopLossPct] = useState("5");
  const [takeProfitPct, setTakeProfitPct] = useState("10");
  const [history, setHistory] = useState<Scenario[]>([]);

  const ref = parseFloat(reference) || 0;
  const hypo = parseFloat(hypothetical) || 0;
  const sl = parseFloat(stopLossPct) || 0;
  const tp = parseFloat(takeProfitPct) || 0;

  const stopLossPrice = ref * (1 - sl / 100);
  const takeProfitPrice = ref * (1 + tp / 100);
  const changePct = ref > 0 ? ((hypo - ref) / ref) * 100 : 0;

  let outcome = "No trigger";
  let outcomeTone: "success" | "warning" | "danger" | "default" = "default";
  if (hypo <= stopLossPrice) { outcome = "Stop-Loss would trigger"; outcomeTone = "danger"; }
  else if (hypo >= takeProfitPrice) { outcome = "Take-Profit would trigger"; outcomeTone = "success"; }

  const chartData = [
    { price: ref, label: "Reference" },
    { price: hypo, label: "Hypothetical" },
    { price: stopLossPrice, label: "Stop-Loss" },
    { price: takeProfitPrice, label: "Take-Profit" },
  ];

  const runSimulation = () => {
    setHistory((h) => [
      { id: Date.now(), reference: ref, hypothetical: hypo, stopLossPct: sl, takeProfitPct: tp, outcome, timestamp: Date.now() },
      ...h,
    ].slice(0, 20));
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <PageHeader title="Risk Simulator" description="Simulate protection outcomes. Simulations are off-chain and never presented as real executions." />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="font-semibold">Scenario Inputs</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-foreground/60">Reference price (USD)</label>
                <input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-sm text-foreground/60">Hypothetical price (USD)</label>
                <input value={hypothetical} onChange={(e) => setHypothetical(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-sm text-foreground/60">Stop-loss (%)</label>
                <input value={stopLossPct} onChange={(e) => setStopLossPct(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-sm text-foreground/60">Take-profit (%)</label>
                <input value={takeProfitPct} onChange={(e) => setTakeProfitPct(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
            </div>
            <button onClick={runSimulation} className="mt-6 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
              Run Simulation
            </button>
          </Card>

          <Card>
            <h3 className="font-semibold">Expected Outcome</h3>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-foreground/60">Price change</span><span className={changePct < 0 ? "text-danger" : "text-success"}>{changePct.toFixed(2)}%</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Stop-loss price</span><span>${stopLossPrice.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Take-profit price</span><span>${takeProfitPrice.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-foreground/60">Outcome</span><Badge tone={outcomeTone}>{outcome}</Badge></div>
            </div>
            <div className="mt-6 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData.map((d) => ({ name: d.label, price: d.price }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2740" />
                  <XAxis dataKey="name" stroke="#e6e9f0" fontSize={11} />
                  <YAxis stroke="#e6e9f0" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1c2740", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <Card className="mt-6">
          <h3 className="font-semibold">Simulation History</h3>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-foreground/50">No simulations yet. Run a scenario to see history.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {history.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 px-4 py-2 text-sm">
                  <span className="text-foreground/60">Ref ${s.reference} → Hypo ${s.hypothetical}</span>
                  <span className="text-foreground/40">SL {s.stopLossPct}% / TP {s.takeProfitPct}%</span>
                  <Badge tone={s.outcome.includes("Stop") ? "danger" : s.outcome.includes("Take") ? "success" : "default"}>{s.outcome}</Badge>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-foreground/40">
            Simulations are purely computational and stored locally. They are never submitted on-chain and never
            represent actual protection executions.
          </p>
        </Card>
      </main>
    </div>
  );
}
