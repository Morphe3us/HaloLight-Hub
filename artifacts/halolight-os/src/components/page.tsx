import type { ComponentType, ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Briques de mise en page partagées (style 2026 : neutre, bordures fines, sans tuiles d'icônes colorées).
 * Les couleurs de statut ne servent qu'en petites touches (point, texte), jamais en fond de carte.
 */

export function PageHeader({ eyebrow, title, description, actions, className }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-[13px] text-muted-foreground first-letter:uppercase mb-1">{eyebrow}</p>}
        <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight text-foreground break-words">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONE_DOT = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  destructive: "bg-destructive",
} as const;

export type StatTone = keyof typeof TONE_DOT;

/** Bande d'indicateurs : cellules séparées par des lignes fines dans un seul cadre. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-3 rounded-xl border border-border bg-card overflow-hidden", className)}>
      {children}
    </div>
  );
}

export function Stat({ label, value, suffix, hint, href, tone, progress, className }: {
  label: ReactNode;
  value: ReactNode;
  suffix?: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: StatTone;
  progress?: number;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] leading-snug text-muted-foreground">{label}</span>
        {tone && <span className={cn("h-1.5 w-1.5 rounded-full mt-1.5 shrink-0", TONE_DOT[tone])} />}
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
          {value}
          {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
        </p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        {progress !== undefined && <Meter value={progress} className="mt-2" />}
      </div>
    </>
  );
  const classes = cn(
    "relative flex flex-col justify-between gap-4 p-5 min-h-[116px] shadow-[1px_1px_0_0_hsl(var(--border))]",
    href && "hover:bg-muted/50 transition-colors",
    className,
  );
  return href ? <Link href={href} className={classes}>{body}</Link> : <div className={classes}>{body}</div>;
}

/** Barre de progression fine et neutre. */
export function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1 rounded-full bg-muted overflow-hidden", className)}>
      <div className="h-full rounded-full bg-foreground/80 transition-all" style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
    </div>
  );
}

export function Section({ title, description, href, linkLabel, actions, children, className }: {
  title: ReactNode;
  description?: ReactNode;
  href?: string;
  linkLabel?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {description && <p className="text-[13px] text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {actions}
        {href && linkLabel && (
          <Link href={href} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            {linkLabel} <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, text, children, className }: {
  icon?: ComponentType<{ className?: string }>;
  text: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-dashed border-border px-6 py-10 text-center", className)}>
      {Icon && <Icon className="w-5 h-5 mx-auto mb-3 text-muted-foreground/70 stroke-[1.75]" />}
      <p className="text-sm text-muted-foreground">{text}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

const NOTICE_TONE = {
  destructive: "text-destructive",
  warning: "text-warning",
  info: "text-info",
  success: "text-success",
} as const;

/** Message d'erreur / d'information : carte neutre, seule l'icône et le titre portent la couleur. */
export function Notice({ tone = "destructive", icon: Icon, title, children, action, className }: {
  tone?: keyof typeof NOTICE_TONE;
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("rounded-xl border border-border bg-card p-4 break-words", className)}>
      <div className="flex items-start gap-3">
        {Icon && <Icon className={cn("mt-0.5 h-4 w-4 shrink-0 stroke-[1.75]", NOTICE_TONE[tone])} />}
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", NOTICE_TONE[tone])}>{title}</p>
          {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}
