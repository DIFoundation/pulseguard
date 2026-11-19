"use client";

import { Navbar } from "@/components/Navbar";
import { PageHeader, StatCard, Card, Badge, Skeleton } from "@/components/ui";
import { useAccount } from "wagmi";
import { useVault, usePolicies } from "@/hooks/useContracts";
import { useProtocolAnalytics } from "@/hooks/useAnalytics";
import { isConfigured } from "@pulseguard/config";
import { formatTokenAmount, shortHash } from "@/lib/format";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";

const CHAIN_COLORS: Record<string, string> = {
  "Base Sepolia": "#6366f1",
  "Reactive Lasna": "#8b5cf6",
  "Unichain Sepolia": "#10b981",
};

const TYPE_COLORS = ["#6366f1", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

function fmtLatency(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtTime(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function DashboardPage() {
  const { isConnected } = useAccount();
  const { balance, totalDeposits } = useVault();
  const { nextId } = usePolicies();
  const analytics = useProtocolAnalytics();

  const protectedValue = balance.data ? formatTokenAmount(balance.data as bigint) : "—";
  const totalValue = totalDeposits.data ? formatTokenAmount(totalDeposits.data as bigint) : "—";
  const policyCount = nextId.data ? Number(nextId.data) - 1 : null;
  const statsLoading = balance.isLoading || totalDeposits.isLoading || nextId.isLoading;

  const { priceSeries, eventsByChain, eventsByType, policyStats, executionCount, latency, recentEvents, loading: analyticsLoading } = analytics;

  const priceChartData = priceSeries.map((p) => ({
    time: new Date(p.t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    price: p.price,
  }));

  const chainChartData = eventsByChain.map((c) => ({ name: c.chain.replace(" Sepolia", "").replace(" Reactive Lasna", "Lasna"), count: c.count, chain: c.chain }));
  const typeChartData = eventsByType.map((t, i) => ({ name: t.name, value: t.count, color: TYPE_COLORS[i % TYPE_COLORS.length] }));

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <PageHeader
          title="Protocol Overview"
          description="Live analytics across Base Sepolia, Reactive Lasna, and Unichain Sepolia."
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

        {/* Hero stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Vault Deposits" value={statsLoading ? <Skeleton className="h-8 w-24" /> : totalValue} sub="TVL · all users" />
          <StatCard label="Your Protected Balance" value={isConnected ? (statsLoading ? <Skeleton className="h-8 w-24" /> : protectedValue) : "—"} sub="vault shares" />
          <StatCard label="Policies Created" value={statsLoading ? <Skeleton className="h-8 w-16" /> : (policyCount ?? "—")} sub={`${policyStats.created} on-chain events`} />
          <StatCard label="Executions" value={analyticsLoading ? <Skeleton className="h-8 w-16" /> : executionCount} sub={latency ? `avg ${fmtLatency(latency.avg)} latency` : "no executions yet"} tone={executionCount > 0 ? "success" : "default"} />
        </div>

        {/* Price chart */}
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Oracle Price — pTST/USD</h3>
              <p className="mt-1 text-xs text-foreground/50">Live PriceUpdated events from MockPriceFeed on Base Sepolia.</p>
            </div>
            {priceSeries.length > 0 && (
              <Badge tone="accent">${priceSeries[priceSeries.length - 1].price.toFixed(2)}</Badge>
            )}
          </div>
          <div className="mt-4 h-64">
            {analyticsLoading ? (
              <Skeleton className="h-full w-full" />
            ) : priceChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-foreground/40">
                No price events yet — publish a price from the Simulator.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={priceChartData}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2740" />
                  <XAxis dataKey="time" stroke="#e6e9f0" fontSize={11} tickLine={false} />
                  <YAxis stroke="#e6e9f0" fontSize={11} tickLine={false} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "#0b1220", border: "1px solid #1c2740", borderRadius: 8 }}
                    labelStyle={{ color: "#e6e9f0" }}
                  />
                  <Area type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2} fill="url(#priceGrad)" dot={{ r: 3, fill: "#6366f1" }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Charts row */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="font-semibold">Events by Chain</h3>
            <p className="mt-1 text-xs text-foreground/50">Protocol events indexed across all networks.</p>
            <div className="mt-4 h-56">
              {analyticsLoading ? (
                <Skeleton className="h-full w-full" />
              ) : chainChartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-foreground/40">No events yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chainChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c2740" />
                    <XAxis dataKey="name" stroke="#e6e9f0" fontSize={11} tickLine={false} />
                    <YAxis stroke="#e6e9f0" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1c2740", borderRadius: 8 }} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {chainChartData.map((d) => (
                        <Cell key={d.chain} fill={CHAIN_COLORS[d.chain] ?? "#6366f1"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold">Event Mix</h3>
            <p className="mt-1 text-xs text-foreground/50">Distribution across lifecycle categories.</p>
            <div className="mt-4 h-56">
              {analyticsLoading ? (
                <Skeleton className="h-full w-full" />
              ) : typeChartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-foreground/40">No events yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeChartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                      {typeChartData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1c2740", borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>

        {/* Policy stats + latency + recent */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card>
            <h3 className="font-semibold">Policy Lifecycle</h3>
            <div className="mt-4 space-y-3 text-sm">
              {[
                { label: "Created", value: policyStats.created, tone: "text-foreground" },
                { label: "Executed", value: policyStats.executed, tone: "text-success" },
                { label: "Cancelled", value: policyStats.cancelled, tone: "text-warning" },
                { label: "Expired", value: policyStats.expired, tone: "text-danger" },
              ].map(({ label, value, tone }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-foreground/60">{label}</span>
                  <span className={`font-semibold ${tone}`}>{analyticsLoading ? "…" : value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-border/50 pt-3 text-xs text-foreground/40">
              Token volume — deposited: {formatTokenAmount(analytics.totalDeposited)} · withdrawn: {formatTokenAmount(analytics.totalWithdrawn)} · protected out: {formatTokenAmount(analytics.totalProtectedOut)}
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold">Execution Latency</h3>
            {latency ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-foreground/60">Samples</span><span className="font-semibold">{latency.count}</span></div>
                <div className="flex justify-between"><span className="text-foreground/60">Average</span><span className="font-semibold text-accent">{fmtLatency(latency.avg)}</span></div>
                <div className="flex justify-between"><span className="text-foreground/60">Fastest</span><span className="text-success">{fmtLatency(latency.min)}</span></div>
                <div className="flex justify-between"><span className="text-foreground/60">Slowest</span><span className="text-warning">{fmtLatency(latency.max)}</span></div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-foreground/50">No executions measured yet.</p>
            )}
            <p className="mt-4 text-xs text-foreground/40">Price event → execution, end-to-end.</p>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Recent Activity</h3>
              <Link href="/activity" className="text-xs text-accent hover:underline">View all →</Link>
            </div>
            <ul className="mt-3 space-y-2.5">
              {analyticsLoading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)
              ) : recentEvents.length === 0 ? (
                <li className="text-sm text-foreground/40">No events yet.</li>
              ) : (
                recentEvents.slice(0, 6).map((e) => (
                  <li key={e.key} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-foreground/40">{fmtTime(e.timestamp)}</span>
                    <Badge tone={e.chain === "Unichain Sepolia" ? "accent" : e.chain === "Reactive Lasna" ? "default" : "success"}>{e.chain.split(" ")[0]}</Badge>
                    <span className="truncate text-foreground/70">{e.summary}</span>
                    <a href={`https://sepolia.basescan.org/tx/${e.txHash}`} target="_blank" rel="noreferrer" className="ml-auto shrink-0 font-mono text-foreground/30 hover:text-accent">{shortHash(e.txHash)}</a>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>

        {/* Contract status + pipeline */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
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
              Latency metrics are computed from real on-chain timestamps — no values are fabricated.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
