"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Vault, FileText, Store, FlaskConical, Activity, Settings, Menu, X } from "lucide-react";
import { useState } from "react";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { shortAddress } from "@/lib/format";
import Image from "next/image";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vault", label: "Vault", icon: Vault },
  { href: "/policies", label: "Policies", icon: FileText },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/simulator", label: "Simulator", icon: FlaskConical },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { open: openAppKit } = useAppKit();
  const { address, isConnected } = useAccount();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="PulseGuard"
            width={200}
            height={200}
            className="w-20 h-12"
          />
          {/* <Shield className="h-6 w-6 text-accent" /> */}
          {/* <span className="text-lg font-semibold tracking-tight">PulseGuard</span> */}
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? "bg-accent/15 text-accent" : "text-foreground/70 hover:bg-card hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={() => openAppKit()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            {isConnected ? shortAddress(address) : "Connect Wallet"}
          </button>
          <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-border/60 px-4 py-3 md:hidden">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-foreground/80 hover:bg-card"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
