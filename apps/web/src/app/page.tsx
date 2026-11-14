import Link from "next/link";
import { Shield, Zap, Globe, Lock, ArrowRight, Activity, FileText } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <section className="mx-auto max-w-7xl px-4 pb-20 pt-24 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-medium text-accent">
            <Zap className="h-3.5 w-3.5" /> Reactive Omni Buildathon — Every Second Counts
          </div>
          <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight md:text-6xl">
            Protect your positions.
            <span className="block bg-linear-to-r from-accent to-accent-2 bg-clip-text text-transparent">
              React in milliseconds.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-foreground/60">
            PulseGuard is autonomous DeFi protection infrastructure. Configure a policy once — Reactive Network
            monitors on-chain events and executes your protection automatically, cross-chain, without bots.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-medium text-white transition-colors hover:bg-accent/90">
              Launch App <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/marketplace" className="rounded-lg border border-border px-6 py-3 font-medium text-foreground/80 transition-colors hover:bg-card">
              Browse Templates
            </Link>
          </div>
        </section>

        <section className="border-t border-border/50 bg-card/30 py-20">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="text-center text-3xl font-semibold">How PulseGuard works</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-foreground/60">
              Event-driven protection orchestrated by Reactive Network — no keepers, no polling, no trust in a backend.
            </p>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                { icon: FileText, title: "1. Configure", desc: "Create a protection policy: asset, trigger (stop-loss, take-profit, drawdown, emergency), threshold, and destination chain." },
                { icon: Activity, title: "2. Reactive monitors", desc: "Reactive Network subscribes to origin-chain events and evaluates your conditions the moment they occur." },
                { icon: Shield, title: "3. Execute", desc: "An authenticated callback hits the destination executor, which re-validates and performs the protection action on-chain." },
              ].map(({ icon: Icon, title, desc }) => (
                <Card key={title} className="p-6">
                  <Icon className="h-8 w-8 text-accent" />
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm text-foreground/60">{desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="text-center text-3xl font-semibold">Cross-chain architecture</h2>
            <Card className="mx-auto mt-10 max-w-4xl p-8">
              <pre className="overflow-x-auto text-xs leading-relaxed text-foreground/70">{`Base Sepolia (origin)          Reactive Lasna              Destinations
+-----------------+   events   +------------------+  cb    +---------------------+
| MockPriceFeed   | ---------> | PulseGuardReactive| -----> | Base Sepolia Executor|
| ProtectionVault |  PriceUpd |  - subscribe     |        |  - execute action    |
| ProtectionMgr   |           |  - evaluate      |        +---------------------+
+-----------------+           |  - request cb    |  cb    +---------------------+
                              +------------------+ -----> | Unichain Executor    |
                                                          |  - cross-chain state |
                                                          +---------------------+`}</pre>
              <p className="mt-6 text-sm text-foreground/50">
                The same-chain callback executes real vault actions; the Unichain callback demonstrates genuine
                cross-chain event-driven execution. Reactive Network is essential — no backend decides triggers.
              </p>
            </Card>
          </div>
        </section>

        <section className="border-t border-border/50 bg-card/30 py-20">
          <div className="mx-auto max-w-7xl px-4">
            <div className="grid gap-6 md:grid-cols-4">
              {[
                { icon: Zap, title: "Event-driven", desc: "Fast reaction to on-chain events via Reactive Network." },
                { icon: Globe, title: "Cross-chain", desc: "Origin and destination chains are independent — Base to Unichain and beyond." },
                { icon: Lock, title: "Non-custodial", desc: "Funds stay in your vault position; executors act only per your policy." },
                { icon: Shield, title: "Authenticated", desc: "Callbacks verified through Reactive's proxy + sender authentication." },
              ].map(({ icon: Icon, title, desc }) => (
                <Card key={title} className="p-5">
                  <Icon className="h-6 w-6 text-accent-2" />
                  <h3 className="mt-3 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-foreground/60">{desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 text-center">
          <h2 className="text-3xl font-semibold">Ready to protect your position?</h2>
          <p className="mx-auto mt-3 max-w-md text-foreground/60">
            Testnet hackathon prototype. Connect a wallet and create your first policy.
          </p>
          <Link href="/policies/create" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-medium text-white hover:bg-accent/90">
            Create Protection Policy <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
    </div>
  );
}
