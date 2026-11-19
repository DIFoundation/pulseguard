import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-xl p-5 ${className}`}>{children}</div>;
}

export function StatCard({ label, value, sub, tone = "default", icon: Icon }: { label: string; value: ReactNode; sub?: string; tone?: "default" | "success" | "warning" | "danger"; icon?: LucideIcon }) {
  const tones = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  };
  const iconTones = {
    default: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  };
  return (
    <Card className="relative overflow-hidden">
      {Icon && (
        <div className="absolute right-4 top-4 rounded-lg bg-accent/10 p-2">
          <Icon className={`h-4 w-4 ${iconTones[tone]}`} />
        </div>
      )}
      <p className="text-xs uppercase tracking-wider text-foreground/50">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-foreground/50">{sub}</p>}
    </Card>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "warning" | "danger" | "accent" }) {
  const tones = {
    default: "bg-card text-foreground/70 border-border",
    success: "bg-success/10 text-success border-success/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    danger: "bg-danger/10 text-danger border-danger/30",
    accent: "bg-accent/10 text-accent border-accent/30",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-foreground/10 ${className}`} />;
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-foreground/60">{description}</p>}
      </div>
      {action}
    </div>
  );
}
