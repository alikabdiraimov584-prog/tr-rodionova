import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";

export function Logo({ className = "", href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={`serif text-2xl leading-none tracking-tight ${className}`}>
      T.Rodionova
    </Link>
  );
}

export function Monogram({ className = "text-4xl" }: { className?: string }) {
  return (
    <span className={`monogram ${className}`} aria-hidden>
      TR
    </span>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

export function Star({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block text-taupe ${className}`} aria-hidden>
      ✦
    </span>
  );
}

const toneClass: Record<Tone, string> = {
  neutral: "border-line bg-ivory text-muted",
  info: "border-taupe/40 bg-taupe/10 text-taupe-dark",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  gold: "border-champagne-dark/50 bg-champagne/30 text-champagne-dark",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`badge ${toneClass[tone]} ${className}`}>{children}</span>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="card p-5">
      <div className="eyebrow">{label}</div>
      <div className={`serif mt-2 text-2xl ${tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : ""}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <Monogram className="text-5xl opacity-40" />
      <h3 className="serif mt-4 text-xl">{title}</h3>
      {children && <p className="mt-2 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "danger", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`border px-4 py-3 text-sm ${toneClass[tone]}`}>{children}</div>;
}

export function PageTitle({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-1 text-3xl md:text-4xl">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-sm text-muted">{children}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
