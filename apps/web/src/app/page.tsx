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
          <div className="pointer-events-none absolute -top-40 left-1/2 h-112 w-md -translate-x-1/2 rounded-full bg-accent/20 blur-3xl animate-float" />
          <div className="pointer-events-none absolute top-32 -left-24 h-80 w-80 rounded-full bg-accent-2/15 blur-3xl animate-float" style={{ animationDelay: "1.2s" }} />
          <div className="pointer-events-none absolute top-32 -right-24 h-80 w-80 rounded-full bg-accent/15 blur-3xl animate-float" style={{ animationDelay: "2.4s" }} />
          <div className="grid-bg pointer-events-none absolute inset-0 mask-[radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />

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
        <section className="relative overflow-hidden py-24">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(99,102,241,0.07),transparent_65%)]" />

          <div className="relative mx-auto max-w-7xl px-4">
            <div className="animate-fade-up text-center">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Cross-chain architecture
              </h2>

              <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-foreground/55 md:text-base">
                An event-driven protection pipeline connecting Base Sepolia,
                Reactive Lasna and Unichain Sepolia.
              </p>
            </div>

            <Card
              className="animate-fade-up mx-auto mt-12 max-w-7xl overflow-hidden border border-border/70 bg-card/80 p-0 shadow-2xl shadow-black/10"
              style={{ animationDelay: "0.15s" }}
            >
              {/* Diagram toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-foreground/[0.025] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <span className="font-mono text-xs text-foreground/45">
                    pulseguard / network-topology
                  </span>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-success/20 bg-success/5 px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-success">
                    Testnet architecture
                  </span>
                </div>
              </div>

              {/* Network zones */}
              <div className="p-4 md:p-6 lg:p-8">
                <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_104px_minmax(0,1fr)_104px_minmax(0,1fr)]">

                  {/* BASE */}
                  <div className="relative flex flex-col overflow-hidden rounded-2xl border border-blue-500/25 bg-gradient-to-b from-blue-500/[0.09] to-transparent">
                    <div className="border-b border-blue-500/15 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10">
                            <Shield className="h-5 w-5 text-blue-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold">Base Sepolia</h3>
                            <p className="mt-0.5 text-[11px] text-foreground/45">
                              Origin & execution chain
                            </p>
                          </div>
                        </div>
                        <span className="rounded-md border border-blue-400/20 bg-blue-400/10 px-2 py-1 font-mono text-[10px] text-blue-400">
                          84532
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/40">
                        Origin contracts
                      </p>

                      {[
                        {
                          name: "Mock Price Feed",
                          role: "Publishes asset price updates",
                          icon: Activity,
                        },
                        {
                          name: "Protection Manager",
                          role: "Stores and evaluates policy rules",
                          icon: FileText,
                        },
                        {
                          name: "PulseGuard Vault",
                          role: "Holds protected assets",
                          icon: Lock,
                        },
                      ].map(({ name, role, icon: Icon }) => (
                        <div
                          key={name}
                          className="flex items-center gap-3 rounded-xl border border-blue-500/15 bg-background/50 p-3"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                            <Icon className="h-4 w-4 text-blue-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold">{name}</p>
                            <p className="mt-0.5 text-[10px] leading-relaxed text-foreground/45">
                              {role}
                            </p>
                          </div>
                        </div>
                      ))}

                      <div className="my-1 flex items-center gap-2 px-1">
                        <div className="h-px flex-1 bg-blue-500/20" />
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-blue-400/70">
                          Callback destination
                        </span>
                        <div className="h-px flex-1 bg-blue-500/20" />
                      </div>

                      <div className="rounded-xl border border-blue-400/25 bg-blue-500/[0.08] p-3">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-blue-400" />
                          <p className="text-xs font-semibold">Protection Executor</p>
                        </div>
                        <p className="mt-1.5 text-[10px] leading-relaxed text-foreground/50">
                          Receives the Reactive callback and executes the protection action on Base.
                        </p>
                        <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-blue-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                          Executes vault protection
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-blue-500/15 px-4 py-3">
                      <p className="text-[10px] text-foreground/40">
                        <span className="font-semibold text-blue-400">Base</span>
                        {" "}is where the protected position and actual execution live.
                      </p>
                    </div>
                  </div>

                  {/* BASE <-> REACTIVE CONNECTION */}
                  <div className="flex flex-col items-center justify-center gap-3 py-2 lg:py-0">
                    <div className="flex w-full items-center justify-center gap-2 lg:flex-col">
                      <div className="flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-2.5 py-2">
                        <span className="text-[9px] font-medium text-blue-400">
                          Events
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-blue-400" />
                      </div>
                      <div className="hidden h-8 w-px bg-gradient-to-b from-blue-400/50 to-violet-400/50 lg:block" />
                      <div className="flex items-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/[0.06] px-2.5 py-2">
                        <ArrowRight className="h-3.5 w-3.5 rotate-180 text-violet-400" />
                        <span className="text-[9px] font-medium text-violet-400">
                          Callback
                        </span>
                      </div>
                    </div>
                    <p className="text-center text-[9px] leading-relaxed text-foreground/35">
                      PriceUpdated
                      <br className="hidden lg:block" />
                      {" "} / execution
                    </p>
                  </div>

                  {/* REACTIVE */}
                  <div className="relative flex flex-col overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-b from-violet-500/[0.12] via-violet-500/[0.04] to-transparent">
                    <div className="border-b border-violet-500/20 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/10">
                            <Radio className="h-5 w-5 text-violet-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold">Reactive Lasna</h3>
                            <p className="mt-0.5 text-[11px] text-foreground/45">
                              Automation network
                            </p>
                          </div>
                        </div>
                        <span className="rounded-md border border-violet-400/20 bg-violet-400/10 px-2 py-1 font-mono text-[10px] text-violet-400">
                          5318007
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col justify-center p-4">
                      <div className="rounded-xl border border-violet-400/25 bg-violet-500/[0.08] p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15">
                            <Zap className="h-4 w-4 text-violet-400" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold">
                              PulseGuard Reactive
                            </p>
                            <p className="text-[10px] text-violet-400/70">
                              Reactive contract
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 space-y-3">
                          {[
                            ["01", "Monitor", "Subscribe to origin events"],
                            ["02", "Evaluate", "Check price against policy"],
                            ["03", "Request callback", "Dispatch destination calls"],
                          ].map(([number, title, description], index) => (
                            <div key={number} className="relative flex gap-3">
                              <div className="flex flex-col items-center">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/15 font-mono text-[9px] text-violet-300">
                                  {number}
                                </span>
                                {index !== 2 && (
                                  <div className="mt-1 h-5 w-px bg-violet-400/25" />
                                )}
                              </div>
                              <div className="pb-2">
                                <p className="text-xs font-semibold">{title}</p>
                                <p className="mt-0.5 text-[10px] leading-relaxed text-foreground/45">
                                  {description}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 rounded-lg border border-violet-500/15 bg-background/40 px-3 py-2.5">
                        <p className="text-[10px] leading-relaxed text-foreground/50">
                          <span className="font-semibold text-violet-400">
                            Event-driven logic.
                          </span>{" "}
                          Trigger evaluation and callback requests are handled
                          on-chain by Reactive.
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-violet-500/15 px-4 py-3">
                      <p className="text-[10px] text-foreground/40">
                        <span className="font-semibold text-violet-400">Reactive</span>
                        {" "}coordinates monitoring and callback delivery.
                      </p>
                    </div>
                  </div>

                  {/* REACTIVE -> UNICHAIN CONNECTION */}
                  <div className="flex flex-col items-center justify-center gap-2 py-2 lg:py-0">
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
                      <ArrowRight className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-[9px] font-medium text-emerald-400">
                        Callback
                      </span>
                    </div>
                    <p className="text-center text-[9px] text-foreground/35">
                      Cross-chain
                      <br className="hidden lg:block" />
                      {" "}attestation
                    </p>
                  </div>

                  {/* UNICHAIN */}
                  <div className="relative flex flex-col overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.09] to-transparent">
                    <div className="border-b border-emerald-500/15 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10">
                            <Globe className="h-5 w-5 text-emerald-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold">Unichain Sepolia</h3>
                            <p className="mt-0.5 text-[11px] text-foreground/45">
                              Attestation destination
                            </p>
                          </div>
                        </div>
                        <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 font-mono text-[10px] text-emerald-400">
                          1301
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col justify-center p-4">
                      <div className="rounded-xl border border-emerald-500/20 bg-background/50 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                          <FileText className="h-5 w-5 text-emerald-400" />
                        </div>
                        <h4 className="mt-3 text-sm font-semibold">
                          CrossChainExecutor
                        </h4>
                        <p className="mt-1 text-[10px] leading-relaxed text-foreground/45">
                          Receives the Reactive callback and records a verifiable
                          protection attestation on Unichain.
                        </p>

                        <div className="mt-4 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] p-3">
                          <p className="text-[10px] font-semibold text-emerald-400">
                            CrossChainProtectionRecorded
                          </p>
                          <p className="mt-1 text-[10px] leading-relaxed text-foreground/45">
                            On-chain record of the protection event.
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] px-3 py-2.5">
                        <Shield className="h-4 w-4 shrink-0 text-emerald-400" />
                        <p className="text-[10px] leading-relaxed text-foreground/50">
                          Records an attestation — does not move Base assets.
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-emerald-500/15 px-4 py-3">
                      <p className="text-[10px] text-foreground/40">
                        <span className="font-semibold text-emerald-400">Unichain</span>
                        {" "}provides a separate on-chain record.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Flow legend */}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 border-t border-border/50 pt-5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-400" />
                    <span className="text-[10px] text-foreground/45">
                      Base origin & execution
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-violet-400" />
                    <span className="text-[10px] text-foreground/45">
                      Reactive automation
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-[10px] text-foreground/45">
                      Cross-chain attestation
                    </span>
                  </div>
                </div>
              </div>

              {/* Architecture explanation */}
              <div className="grid gap-4 border-t border-border/60 bg-foreground/[0.025] p-5 md:grid-cols-2 md:p-6">
                <div>
                  <p className="text-xs font-semibold">How protection flows</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/50">
                    Base emits price and policy events. Reactive monitors those events,
                    evaluates the configured condition and requests callbacks to the
                    destination contracts.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold">Two distinct outcomes</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/50">
                    The Base callback can execute the actual protection action.
                    The Unichain callback independently records an on-chain
                    attestation. No backend decides when a trigger fires.
                  </p>
                </div>
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
              <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-160 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
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
