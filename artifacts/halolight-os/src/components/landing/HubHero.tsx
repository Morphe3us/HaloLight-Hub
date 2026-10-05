import { useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { AnimatePresence, motion, useAnimationFrame, useReducedMotion, wrap } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  CalendarDays,
  Camera,
  ChartColumn,
  GraduationCap,
  Headset,
  Rocket,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Landing hero, adapted from the Aceternity Pro block "Hero Section With Hub":
 * the partner's operation on the left, HaloLight expertise on the right, the
 * Hub in the middle, with light beams running along the traces.
 */

type DiagramNode = {
  key: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
  x: number;
  y: number;
  hideOnNarrow?: boolean;
};

const CANVAS = { w: 1200, h: 400 } as const;
const HUB = { x: 600, y: 200 };

type Trace = { id: string; d: string; hideOnNarrow?: boolean };
type DiagramMark = { x: number; y: number; hideOnNarrow?: boolean };
type Offshoot = DiagramMark & { dx: number; dy: number };

const TRACES: Trace[] = [
  { id: "left-main", d: "M 150 200 H 554" },
  { id: "right-main", d: "M 646 200 H 1050" },
  { id: "upper", d: "M 200 88 H 1000", hideOnNarrow: true },
  { id: "hub-riser", d: "M 600 154 V 88", hideOnNarrow: true },
  { id: "col-left", d: "M 200 88 V 306", hideOnNarrow: true },
  { id: "col-right", d: "M 1000 88 V 306", hideOnNarrow: true },
  { id: "events", d: "M 264 200 V 232" },
  { id: "support", d: "M 936 200 V 232" },
];

const JUNCTIONS: DiagramMark[] = [
  { x: 200, y: 88, hideOnNarrow: true },
  { x: 264, y: 200 },
  { x: 200, y: 200, hideOnNarrow: true },
  { x: 600, y: 88, hideOnNarrow: true },
  { x: 936, y: 200 },
  { x: 1000, y: 200, hideOnNarrow: true },
  { x: 1000, y: 88, hideOnNarrow: true },
];

const OFFSHOOTS: Offshoot[] = [
  { x: 320, y: 88, dx: 0, dy: -12, hideOnNarrow: true },
  { x: 390, y: 88, dx: 0, dy: 12, hideOnNarrow: true },
  { x: 810, y: 88, dx: 0, dy: -12, hideOnNarrow: true },
  { x: 880, y: 88, dx: 0, dy: 12, hideOnNarrow: true },
  { x: 330, y: 200, dx: 0, dy: -12 },
  { x: 410, y: 200, dx: 0, dy: 12 },
  { x: 790, y: 200, dx: 0, dy: -12 },
  { x: 870, y: 200, dx: 0, dy: 12 },
  { x: 200, y: 140, dx: -12, dy: 0, hideOnNarrow: true },
  { x: 200, y: 260, dx: 12, dy: 0, hideOnNarrow: true },
  { x: 1000, y: 140, dx: 12, dy: 0, hideOnNarrow: true },
  { x: 1000, y: 260, dx: -12, dy: 0, hideOnNarrow: true },
];

const NODES: DiagramNode[] = [
  { key: "d_team", icon: Users, href: "#features", x: 200, y: 88, hideOnNarrow: true },
  { key: "d_booths", icon: Camera, href: "#features", x: 120, y: 200 },
  { key: "d_events", icon: CalendarDays, href: "#tour", x: 264, y: 248 },
  { key: "d_kpis", icon: ChartColumn, href: "#tour", x: 200, y: 328, hideOnNarrow: true },
  { key: "d_ai", icon: Sparkles, href: "#assistant", x: 1000, y: 88, hideOnNarrow: true },
  { key: "d_support", icon: Headset, href: "#features", x: 936, y: 248 },
  { key: "d_academy", icon: GraduationCap, href: "#features", x: 1080, y: 200 },
  { key: "d_onboarding", icon: Rocket, href: "#onboarding", x: 1000, y: 328, hideOnNarrow: true },
];

function pct(x: number, y: number) {
  return { left: `${(x / CANVAS.w) * 100}%`, top: `${(y / CANVAS.h) * 100}%` };
}

/** HaloLight "O" with its horizontal bar, as in the Hub logo. */
export function HubGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <path d="M9.2 13.2a7 7 0 0 1 13.6 0" stroke="currentColor" strokeWidth="2.6" />
      <path d="M9.2 18.8a7 7 0 0 0 13.6 0" stroke="currentColor" strokeWidth="2.6" />
      <rect x="5" y="14.6" width="22" height="2.8" rx="0.4" fill="currentColor" opacity="0.65" />
    </svg>
  );
}

export function HubLogo({ className }: { className?: string }) {
  return (
    <img
      src="/logo-hub-light-orig.png"
      alt="HaloLight Hub"
      width={1920}
      height={1080}
      className={cn("h-auto w-[104px] object-contain", className)}
      style={{ mixBlendMode: "multiply" }}
    />
  );
}

/** Pill-shaped link; in-app routes go through wouter, anchors stay plain. */
export function PillLink({
  href,
  children,
  variant,
  className,
}: {
  href: string;
  children: ReactNode;
  variant: "solid" | "outline";
  className?: string;
}) {
  const classes = cn(
    "relative inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2 text-[0.9375rem] font-semibold transition active:scale-[0.97] sm:min-h-10",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--hub-ink)",
    variant === "solid" && "bg-(--hub-ink) text-white shadow-[0_8px_20px_-10px_rgba(0,0,0,0.6)] hover:bg-black",
    variant === "outline" && "bg-(--hub-card) text-(--hub-ink) ring-1 ring-black/10 hover:ring-black/20",
    className,
  );
  return href.startsWith("/") ? (
    <Link href={href} className={classes}>
      {children}
    </Link>
  ) : (
    <a href={href} className={classes}>
      {children}
    </a>
  );
}

function NavBar({ signInHref }: { signInHref: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const links = [
    { href: "#tour", label: t("landing.v2.nav_product") },
    { href: "#features", label: t("landing.v2.nav_features") },
    { href: "#assistant", label: t("landing.v2.nav_ai") },
    { href: "#onboarding", label: t("landing.v2.nav_onboarding") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-(--hub-paper)/85 backdrop-blur">
      <nav
        aria-label="Primary"
        className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:px-6 lg:grid-cols-[1fr_auto_1fr]"
      >
        <Link href="/" aria-label="HaloLight Hub" className="flex items-center">
          <HubLogo />
        </Link>
        <ul role="list" className="hidden items-center gap-7 lg:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a href={link.href} className="text-sm text-(--hub-muted) hover:text-(--hub-ink)">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-4 justify-self-end lg:flex">
          <Link href={signInHref} className="text-sm font-medium text-(--hub-ink) hover:underline" data-testid="button-landing-signin">
            {t("landing.nav_sign_in")}
          </Link>
          <PillLink href={signInHref} variant="solid" className="min-h-9 px-4 text-sm sm:min-h-9">
            {t("landing.nav_get_started")}
          </PillLink>
        </div>
        <button
          type="button"
          className="relative grid size-11 place-items-center justify-self-end rounded-full text-(--hub-ink) ring-1 ring-black/10 lg:hidden"
          aria-expanded={open}
          aria-controls="hub-mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">{open ? t("landing.v2.menu_close") : t("landing.v2.menu_open")}</span>
          <span aria-hidden="true" className="flex w-4 flex-col gap-1">
            <span className={cn("h-px w-full bg-current transition", open && "translate-y-1 rotate-45")} />
            <span className={cn("h-px w-full bg-current transition", open && "opacity-0")} />
            <span className={cn("h-px w-full bg-current transition", open && "-translate-y-1 -rotate-45")} />
          </span>
        </button>
      </nav>
      <AnimatePresence>
        {open ? (
          <motion.div
            id="hub-mobile-nav"
            initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="border-t border-black/6 bg-(--hub-paper) px-4 py-4 lg:hidden"
          >
            <ul role="list" className="flex flex-col gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-xl px-3 text-base text-(--hub-ink)">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <PillLink href={signInHref} variant="outline">
                {t("landing.nav_sign_in")}
              </PillLink>
              <PillLink href={signInHref} variant="solid">
                {t("landing.nav_get_started")}
              </PillLink>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function ConnectionLayer() {
  const uid = useId().replace(/:/g, "");
  const shouldReduceMotion = useReducedMotion();
  const beamRefs = useRef<(SVGPathElement | null)[]>([]);
  const sparkRefs = useRef<(SVGPathElement | null)[]>([]);
  const offsets = useRef<number[]>([]);

  useAnimationFrame((_, delta) => {
    if (shouldReduceMotion) return;
    beamRefs.current.forEach((el, index) => {
      if (!el) return;
      const length = el.getTotalLength();
      if (length === 0) return;
      const current = offsets.current[index] ?? 0;
      const next = wrap(0, length, current - (length * delta) / 3600);
      offsets.current[index] = next;
      el.style.strokeDashoffset = `${next}`;
      const spark = sparkRefs.current[index];
      if (spark) spark.style.strokeDashoffset = `${wrap(0, length, next + length * 0.38)}`;
    });
  });

  return (
    <svg viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`} className="pointer-events-none absolute inset-0 size-full" fill="none" aria-hidden="true">
      <defs>
        <filter id={`${uid}-glow`} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {TRACES.map((trace) => (
        <path key={`${trace.id}-glow`} d={trace.d} className={cn("stroke-(--hub-accent)/25", trace.hideOnNarrow && "max-md:hidden")} strokeWidth={7} strokeLinecap="round" />
      ))}
      {TRACES.map((trace) => (
        <path
          key={`${trace.id}-base`}
          d={trace.d}
          className={cn("stroke-(--hub-line)", trace.hideOnNarrow && "max-md:hidden")}
          strokeWidth={1.25}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {OFFSHOOTS.map((tick, index) => (
        <path
          key={`tick-${index}`}
          d={`M ${tick.x} ${tick.y} l ${tick.dx} ${tick.dy}`}
          className={cn("stroke-(--hub-line)", tick.hideOnNarrow && "max-md:hidden")}
          strokeWidth={1.15}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {JUNCTIONS.map((pad, index) => (
        <circle
          key={`pad-${index}`}
          cx={pad.x}
          cy={pad.y}
          r={3}
          className={cn("fill-(--hub-paper) stroke-(--hub-line)", pad.hideOnNarrow && "max-md:hidden")}
          strokeWidth={1.15}
        />
      ))}
      {shouldReduceMotion
        ? null
        : TRACES.map((trace, index) => (
            <g key={`${trace.id}-beams`}>
              <path
                ref={(node) => {
                  beamRefs.current[index] = node;
                }}
                d={trace.d}
                className={cn("stroke-(--hub-accent-strong)", trace.hideOnNarrow && "max-md:hidden")}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray="22 190"
                filter={`url(#${uid}-glow)`}
              />
              <path
                ref={(node) => {
                  sparkRefs.current[index] = node;
                }}
                d={trace.d}
                className={cn("stroke-(--hub-accent)", trace.hideOnNarrow && "max-md:hidden")}
                strokeWidth={1.35}
                strokeLinecap="round"
                strokeDasharray="7 205"
              />
            </g>
          ))}
    </svg>
  );
}

function Diagram() {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const tag =
    "absolute z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--hub-card) px-2.5 py-1 text-[0.6875rem] font-medium whitespace-nowrap text-(--hub-muted) ring-1 ring-black/8 sm:inline-flex";

  return (
    <figure className="relative mx-auto mt-10 w-full max-w-6xl px-2 sm:mt-14 sm:px-4">
      <div className="relative aspect-[2.4/1] w-full sm:aspect-3/1">
        <ConnectionLayer />
        <span className={tag} style={pct(432, 88)}>
          {t("landing.v2.d_your_operation")}
        </span>
        <span className={tag} style={pct(768, 88)}>
          {t("landing.v2.d_expertise")}
        </span>
        <p className="absolute hidden -translate-x-1/2 -translate-y-1/2 text-[0.6875rem] whitespace-nowrap text-(--hub-muted) md:block" style={pct(408, 248)}>
          {t("landing.v2.d_equipment_events")}
        </p>
        <p className="absolute hidden -translate-x-1/2 -translate-y-1/2 text-[0.6875rem] whitespace-nowrap text-(--hub-muted) md:block" style={pct(792, 248)}>
          {t("landing.v2.d_training_support")}
        </p>

        <div className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={pct(HUB.x, HUB.y)}>
          <motion.div
            animate={shouldReduceMotion ? undefined : { boxShadow: ["0 0 0 0 rgba(221,179,152,0.55)", "0 0 0 18px rgba(221,179,152,0)"] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
            className="grid size-14 place-items-center rounded-2xl bg-(--hub-ink) text-(--hub-accent) sm:size-[4.5rem]"
          >
            <HubGlyph className="size-8 sm:size-10" />
          </motion.div>
        </div>

        {NODES.map((node) => {
          const Icon = node.icon;
          const label = t(`landing.v2.${node.key}`);
          return (
            <a
              key={node.key}
              href={node.href}
              aria-label={label}
              className={cn(
                "group absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--hub-ink)",
                node.hideOnNarrow && "max-md:hidden",
              )}
              style={pct(node.x, node.y)}
            >
              <motion.span
                whileHover={shouldReduceMotion ? undefined : { y: -3 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="grid size-10 place-items-center rounded-xl bg-(--hub-card) text-(--hub-ink) shadow-[0_8px_18px_-10px_oklch(0_0_0/0.28)] ring-1 ring-black/6 group-hover:text-(--hub-accent-strong) sm:size-12"
              >
                <Icon className="size-5 stroke-[1.75] sm:size-[1.4rem]" />
              </motion.span>
              <span className="pointer-events-none absolute top-full mt-1 hidden text-[0.6875rem] font-medium whitespace-nowrap text-(--hub-ink) lg:block">
                {label}
              </span>
            </a>
          );
        })}
      </div>
      <figcaption className="sr-only">{t("landing.v2.d_caption")}</figcaption>
    </figure>
  );
}

export default function HubHero({ signInHref }: { signInHref: string }) {
  const { t } = useTranslation();
  return (
    <div id="top" className="relative isolate w-full overflow-x-clip">
      <NavBar signInHref={signInHref} />
      <section aria-labelledby="hub-hero-heading" className="relative px-4 pt-14 sm:px-6 sm:pt-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(221,179,152,0.28),transparent_70%)]"
        />
        <div className="flex flex-col items-center gap-5 sm:gap-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-(--hub-accent)/25 px-3 py-1 text-xs font-semibold text-(--hub-ink) ring-1 ring-(--hub-accent)/50">
            <span className="size-1.5 rounded-full bg-(--hub-accent-strong)" />
            {t("landing.hero_badge")}
          </span>
          <h1
            id="hub-hero-heading"
            className="max-w-4xl text-center text-[2.6rem] leading-[1.02] font-extrabold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[4.75rem]"
          >
            {t("landing.hero_title")} <span className="text-(--hub-accent-strong)">{t("landing.hero_highlight")}</span>.
          </h1>
          <p className="max-w-[52ch] text-center text-base text-pretty text-(--hub-muted) sm:text-lg">{t("landing.v2.hero_subtitle")}</p>
          <div className="flex w-full flex-col items-stretch justify-center gap-2.5 sm:w-auto sm:flex-row sm:items-center">
            <PillLink href={signInHref} variant="solid">
              <span data-testid="button-landing-signup">{t("landing.cta_btn")}</span>
              <span aria-hidden>→</span>
            </PillLink>
            <PillLink href={signInHref} variant="outline">
              {t("landing.hero_login")}
            </PillLink>
          </div>
        </div>
      </section>
      <section aria-label={t("landing.v2.d_caption")} className="pb-10 sm:pb-16">
        <Diagram />
      </section>
    </div>
  );
}
