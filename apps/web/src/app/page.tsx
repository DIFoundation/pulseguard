"use client";

import Link from "next/link";
import {
  Shield, Zap, Globe, Lock, ArrowRight, Activity, FileText,
  Radio, Timer, ChevronRight, ExternalLink,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Card, Badge } from "@/components/ui";
import { useProtocolAnalytics } from "@/hooks/useAnalytics";

const CHAIN_BADGE: Record<string, { label: string; tone: "success" | "accent" | "warning" }> = {
  "Base Sepolia": { label: "Base", tone: "success" },
  "Unichain Sepolia": { label: "Unichain", tone: "accent" },
  "Reactive Lasna": { label: "Lasna", tone: "warning" },
};

export default function LandingPage() {
  const analytics = useProtocolAnalytics();

  const stats = [
    { label: "On-chain events", value: analytics.loading ? "…" : analytics.events.length.toLocaleString(), sub: "indexed live" },
    { label: "Executions", value: analytics.loading ? "…" : analytics.executionCount.toLocaleString(), sub: "protection actions" },
    { label: "Networks", value: "3", sub: "Base · Unichain · Lasna" },
    { label: "Avg latency", value: analytics.latency ? `${analytics.latency.avg}s` : "—", sub: analytics.latency ? `${analytics.latency.count} samples` : "measured on-chain" },
  ];

  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden">
          {/* animated orbs */}
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl animate-float" />
          <div className="pointer-events-none absolute top-32 -left-24 h-80 w-80 rounded-full bg-accent-2/15 blur-3xl animate-float" style={{ animationDelay: "1.2s" }} />
          <div className="pointer-events-none absolute top-32 -right-24 h-80 w-80 rounded-full bg-accent/15 blur-3xl animate-float" style={{ animationDelay: "2.4s" }} />
          <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />

          <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-28 text-center">
            <div className="animate-fade-up mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-medium text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
              Reactive Omni Buildathon — Every Second Counts
            </div>
            <h1 className="animate-fade-up mx-auto max-w-4xl text-5xl font-bold tracking-tight md:text-7xl" style={{ animationDelay: "0.1s" }}>
              Protect your positions.
              <span className="block bg-linear-to-r from-accent via-accent-2 to-accent bg-clip-text text-transparent">
                React in milliseconds.
              </span>
            </h1>
            <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg text-foreground/60" style={{ animationDelay: "0.2s" }}>
              PulseGuard is autonomous DeFi protection infrastructure. Configure a policy once —
              Reactive Network monitors on-chain events and executes your protection automatically,
              cross-chain, without bots.
            </p>
            <div className="animate-fade-up mt-10 flex items-center justify-center gap-4" style={{ animationDelay: "0.3s" }}>
              <Link href="/dashboard" className="group flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-medium text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent/90 hover:shadow-accent/40">
                Launch App <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/marketplace" className="rounded-lg border border-border px-6 py-3 font-medium text-foreground/80 transition-colors hover:bg-card hover:border-accent/40">
                Browse Templates
              </Link>
            </div>

            {/* live stats strip */}
            <div className="animate-fade-up mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-4" style={{ animationDelay: "0.45s" }}>
              {stats.map((s) => (
                <Card key={s.label} className="px-4 py-4 text-center">
                  <p className="text-2xl font-bold text-accent">{s.value}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wider text-foreground/50">{s.label}</p>
                  <p className="text-[11px] text-foreground/40">{s.sub}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="border-t border-border/50 bg-card/30 py-24">
          <div className="mx-auto max-w-7xl px-4">
            <div className="animate-fade-up text-center">
              <h2 className="text-3xl font-semibold md:text-4xl">How PulseGuard works</h2>
              <p className="mx-auto mt-3 max-w-xl text-foreground/60">
                Event-driven protection orchestrated by Reactive Network — no keepers, no polling, no trusted backend.
              </p>
            </div>
            <div className="relative mt-14 grid gap-6 md:grid-cols-3">
              {/* connector line */}
              <div className="pointer-events-none absolute left-[16%] right-[16%] top-10 hidden border-t border-dashed border-accent/30 md:block" />
              {[
                { icon: FileText, step: "01", title: "Configure", desc: "Create a protection policy: asset, trigger (stop-loss, take-profit, drawdown, emergency), threshold, and destination chain." },
                { icon: Radio, step: "02", title: "Reactive monitors", desc: "Reactive Network subscribes to origin-chain events and evaluates your conditions the moment they occur." },
                { icon: Shield, step: "03", title: "Execute", desc: "An authenticated callback hits the destination executor, which re-validates and performs the protection action on-chain." },
              ].map(({ icon: Icon, step, title, desc }, i) => (
                <Card key={title} className="animate-fade-up group relative p-6 transition-all hover:-translate-y-1 hover:border-accent/40" style={{ animationDelay: `${0.1 + i * 0.12}s` }}>
                  <div className="flex items-center justify-between">
                    <div className="rounded-xl bg-accent/10 p-3 transition-colors group-hover:bg-accent/20">
                      <Icon className="h-6 w-6 text-accent" />
                    </div>
                    <span className="font-mono text-sm text-foreground/25">{step}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/60">{desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ============ ARCHITECTURE ============ */}
        <section className="py-24">
          <div className="mx-auto max-w-7xl px-4">
            <div className="animate-fade-up text-center">
              <h2 className="text-3xl font-semibold md:text-4xl">Cross-chain architecture</h2>
              <p className="mx-auto mt-3 max-w-xl text-foreground/60">
                Three networks, one protection pipeline — Reactive Network is the trustless brain in the middle.
              </p>
            </div>
            <Card className="animate-fade-up mx-auto mt-12 max-w-5xl overflow-hidden p-0" style={{ animationDelay: "0.15s" }}>
              <div className="flex items-center gap-2 border-b border-border/60 bg-foreground/5 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-danger/60" />
                <span className="h-3 w-3 rounded-full bg-warning/60" />
                <span className="h-3 w-3 rounded-full bg-success/60" />
                <span className="ml-3 font-mono text-xs text-foreground/40">pulseguard-network — live topology</span>
                <span className="ml-auto flex items-center gap-1.5 text-[11px] text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" /> LIVE
                </span>
              </div>
              <div className="terminal-scroll overflow-x-auto p-6">
                <pre className="text-xs leading-relaxed text-foreground/70 md:text-sm">{`Base Sepolia (origin)          Reactive Lasna              Destinations
+-----------------+   events   +------------------+  cb    +---------------------+
| MockPriceFeed   | ---------> | PulseGuardReactive| -----> | Base Sepolia Executor|
| ProtectionVault |  PriceUpd |  - subscribe     |        |  - execute action    |
| ProtectionMgr   |           |  - evaluate      |        +---------------------+
+-----------------+           |  - request cb    |  cb    +---------------------+
                              +------------------+ -----> | Unichain Executor    |
                                                          |  - attestation record  |
                                                          +---------------------+`}</pre>
              </div>
              <div className="border-t border-border/60 px-6 py-4 text-sm text-foreground/50">
                The same-chain callback executes real vault actions; the Unichain callback records a verifiable
                on-chain attestation of the protection event. <span className="text-foreground/80">No backend decides triggers.</span>
              </div>
            </Card>
          </div>
        </section>

        {/* ============ LIVE ACTIVITY ============ */}
        <section className="border-t border-border/50 bg-card/30 py-24">
          <div className="mx-auto max-w-7xl px-4">
            <div className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold md:text-4xl">Live on-chain activity</h2>
                <p className="mt-3 max-w-xl text-foreground/60">
                  Real events indexed across all three networks — refreshing every 60 seconds.
                </p>
              </div>
              <Link href="/activity" className="group flex items-center gap-1 text-sm text-accent hover:underline">
                View full activity <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <Card className="animate-fade-up mt-10 overflow-hidden p-0" style={{ animationDelay: "0.15s" }}>
              {analytics.loading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-foreground/10" />
                  ))}
                </div>
              ) : analytics.recentEvents.length === 0 ? (
                <div className="p-10 text-center text-foreground/50">
                  <Activity className="mx-auto h-8 w-8 text-foreground/30" />
                  <p className="mt-3 text-sm">No events indexed yet — deposit, create a policy, or publish a price to see activity here.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {analytics.recentEvents.slice(0, 6).map((e) => {
                    const badge = CHAIN_BADGE[e.chain] ?? { label: e.chain, tone: "accent" as const };
                    return (
                      <li key={e.key} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-foreground/5">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.summary}</p>
                          <p className="font-mono text-[11px] text-foreground/40">{e.eventName} · {e.txHash.slice(0, 10)}…</p>
                        </div>
                        {e.timestamp !== undefined && (
                          <span className="shrink-0 text-xs text-foreground/40">
                            {new Date(e.timestamp * 1000).toLocaleTimeString()}
                          </span>
                        )}
                        <a
                          href={`https://${e.chain.includes("Base") ? "sepolia.basescan.org" : e.chain.includes("Unichain") ? "unichain-sepolia.blockscout.com" : "lasna-testnet.socialscan.io"}/tx/${e.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-foreground/30 transition-colors hover:text-accent"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <section className="py-24">
          <div className="mx-auto max-w-7xl px-4">
            <div className="animate-fade-up text-center">
              <h2 className="text-3xl font-semibold md:text-4xl">Why PulseGuard</h2>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Zap, title: "Event-driven", desc: "Fast reaction to on-chain events via Reactive Network." },
                { icon: Globe, title: "Cross-chain", desc: "Origin and destination chains are independent — Base to Unichain and beyond." },
                { icon: Lock, title: "Non-custodial", desc: "Funds stay in your vault position; executors act only per your policy." },
                { icon: Shield, title: "Authenticated", desc: "Callbacks verified through Reactive's proxy + sender authentication." },
              ].map(({ icon: Icon, title, desc }, i) => (
                <Card key={title} className="animate-fade-up p-5 transition-all hover:-translate-y-1 hover:border-accent-2/40" style={{ animationDelay: `${i * 0.08}s` }}>
                  <div className="rounded-lg bg-accent-2/10 p-2.5 w-fit">
                    <Icon className="h-5 w-5 text-accent-2" />
                  </div>
                  <h3 className="mt-3 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-foreground/60">{desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ============ CTA ============ */}
        <section className="pb-28">
          <div className="mx-auto max-w-7xl px-4">
            <Card className="animate-fade-up relative overflow-hidden p-10 text-center md:p-16">
              <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
              <div className="relative">
                <h2 className="text-3xl font-semibold md:text-4xl">Ready to protect your position?</h2>
                <p className="mx-auto mt-3 max-w-md text-foreground/60">
                  Testnet hackathon prototype. Connect a wallet and create your first policy.
                </p>
                <div className="mt-8 flex items-center justify-center gap-4">
                  <Link href="/policies/create" className="group flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-medium text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent/90">
                    Create Protection Policy <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Link href="/simulator" className="flex items-center gap-2 rounded-lg border border-border px-6 py-3 font-medium text-foreground/80 transition-colors hover:bg-card">
                    <Timer className="h-4 w-4" /> Try the Simulator
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-foreground/40">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-accent" />
            <span className="font-medium text-foreground/60">PulseGuard</span>
            <span>· Reactive Omni Buildathon</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="hover:text-foreground/70">Dashboard</Link>
            <Link href="/activity" className="hover:text-foreground/70">Activity</Link>
            <Link href="/settings" className="hover:text-foreground/70">Settings</Link>
          </div>
          <p className="text-xs">Testnet prototype — not audited, no real funds.</p>
        </div>
      </footer>
    </div>
  );
}
