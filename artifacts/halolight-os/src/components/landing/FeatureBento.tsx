import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Camera, Check, CircleCheck, Headset, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Six Hub pillars, adapted from the Aceternity Pro block "Feature Grid With
 * Illustrations And Bento". Each tile animates only while it is on screen.
 */

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function useBento() {
  const { t } = useTranslation();
  return (key: string) => t(`landing.v2.bento.${key}`);
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={shouldReduceMotion ? { opacity: 1, y: 0 } : undefined}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.6, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

const TILE =
  "rounded-xl bg-(--hub-card) shadow-[0_0_0_1px_var(--hub-line-soft),0_1px_2px_oklch(0_0_0/0.04),0_8px_20px_-12px_oklch(0_0_0/0.12)]";

function useRunning() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const shouldReduceMotion = useReducedMotion();
  return { ref, run: inView && !shouldReduceMotion, still: Boolean(shouldReduceMotion) };
}

function useStep(count: number, ms: number, run: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!run) return;
    const id = window.setTimeout(() => setStep((current) => (current + 1) % count), ms);
    return () => window.clearTimeout(id);
  }, [run, step, count, ms]);
  return step;
}

const BARS = [38, 52, 45, 64, 58, 76, 70, 88];

function KpiChart() {
  const b = useBento();
  const { ref, run, still } = useRunning();
  // Latch: once the chart has played, keep it filled even off screen.
  const seen = useInView(ref, { once: true, amount: 0.5 });
  const [value, setValue] = useState(still ? 18 : 0);
  useEffect(() => {
    if (!run) return;
    const c = animate(0, 18, { duration: 1.2, ease: EASE_OUT, onUpdate: (v) => setValue(Math.round(v)) });
    return () => c.stop();
  }, [run]);
  const shown = seen || still;
  return (
    <div ref={ref} className={cn(TILE, "w-64 p-3.5")}>
      <div className="flex items-baseline justify-between">
        <span className="text-[0.6875rem] text-(--hub-muted)">{b("events_month")}</span>
        <span className="rounded-full bg-emerald-500/10 px-1.5 text-[0.625rem] font-medium text-emerald-700">+29%</span>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight text-(--hub-ink) tabular-nums">{still ? 18 : value}</p>
      <div className="mt-3 flex h-20 items-end gap-1.5">
        {BARS.map((h, i) => (
          <motion.span
            key={i}
            className={cn("flex-1 rounded-t-[4px]", i === BARS.length - 1 ? "bg-(--hub-ink)" : "bg-(--hub-accent)/70")}
            initial={false}
            animate={{ height: shown ? `${h}%` : "8%" }}
            transition={{ duration: still ? 0 : 0.6, delay: still ? 0 : i * 0.06, ease: EASE_OUT }}
          />
        ))}
      </div>
    </div>
  );
}

function Lessons() {
  const b = useBento();
  const lessons = [b("lesson1"), b("lesson2"), b("lesson3")];
  const { ref, run, still } = useRunning();
  const step = useStep(5, 1000, run);
  const done = still ? 2 : Math.min(step, lessons.length);
  return (
    <div ref={ref} className={cn(TILE, "flex w-64 flex-col p-1.5")}>
      <div className="flex items-center justify-between px-2 pt-1 pb-2 text-[0.6875rem]">
        <span className="font-semibold text-(--hub-ink)">{b("operator_training")}</span>
        <span className="text-(--hub-muted) tabular-nums">
          {done} / {lessons.length}
        </span>
      </div>
      <ul className="flex flex-col">
        {lessons.map((l, i) => {
          const isDone = i < done;
          return (
            <li key={l} className="flex items-center gap-2 rounded-lg px-2 py-2 odd:bg-(--hub-ink)/[0.025]">
              <span className="relative flex size-3.5 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1.5px_var(--hub-line)]">
                <motion.span
                  className="absolute inset-0 rounded-full bg-(--hub-accent-strong)"
                  initial={false}
                  animate={{ opacity: isDone ? 1 : 0, scale: isDone ? 1 : 0.6 }}
                  transition={{ type: "spring", duration: 0.3, bounce: 0.3 }}
                />
                <Check className={cn("relative size-2.5 text-white transition-opacity", isDone ? "opacity-100" : "opacity-0")} strokeWidth={3} />
              </span>
              <motion.span initial={false} animate={{ opacity: isDone ? 0.5 : 1 }} className="text-xs font-medium text-(--hub-ink)">
                {l}
              </motion.span>
            </li>
          );
        })}
      </ul>
      <div className="mx-2 mt-1 mb-1.5 h-1 overflow-hidden rounded-full bg-(--hub-ink)/8">
        <motion.div
          className="h-full bg-(--hub-accent-strong)"
          initial={false}
          animate={{ width: `${(done / lessons.length) * 100}%` }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        />
      </div>
    </div>
  );
}

function SupportPing() {
  const b = useBento();
  const { ref, run, still } = useRunning();
  const step = useStep(4, 1300, run);
  const phase = still ? 3 : step;
  return (
    <div ref={ref} className="flex w-64 flex-col gap-2">
      <div className={cn(TILE, "px-3 py-2.5 text-xs text-(--hub-ink)")}>
        <p className="text-[0.625rem] text-(--hub-muted)">{b("you_booth")}</p>
        {b("issue")}
      </div>
      <AnimatePresence>
        {phase >= 1 ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 self-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-[0.625rem] font-medium text-emerald-700"
          >
            <Headset className="size-3" /> {b("specialist_joined")}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {phase >= 2 ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="self-end rounded-xl bg-(--hub-ink) px-3 py-2.5 text-xs text-white">
            <p className="text-[0.625rem] text-white/60">{b("specialist_name")}</p>
            {b("fix")}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Registry() {
  const b = useBento();
  const units = [
    { id: "#01", status: b("warranty_active"), tone: "ok" },
    { id: "#02", status: b("on_event"), tone: "info" },
    { id: "#03", status: b("service_due"), tone: "warn" },
  ] as const;
  const { ref, run, still } = useRunning();
  const step = useStep(3, 1500, run);
  const focus = still ? 2 : step;
  return (
    <div ref={ref} className={cn(TILE, "flex w-64 flex-col gap-1 p-1.5")}>
      {units.map((u, i) => (
        <motion.div
          key={u.id}
          animate={{ backgroundColor: i === focus ? "rgba(18,18,18,0.04)" : "rgba(18,18,18,0)" }}
          className="flex items-center gap-2 rounded-lg px-2 py-2"
        >
          <span className="grid size-6 place-items-center rounded-md bg-(--hub-ink)/5 text-(--hub-ink)">
            <Camera className="size-3.5 stroke-[1.75]" />
          </span>
          <span className="flex-1 text-xs font-semibold text-(--hub-ink)">
            {b("booth")} {u.id}
          </span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[0.625rem] font-medium",
              u.tone === "ok" && "bg-emerald-500/10 text-emerald-700",
              u.tone === "info" && "bg-sky-500/10 text-sky-700",
              u.tone === "warn" && "bg-amber-500/15 text-amber-700",
            )}
          >
            {u.status}
          </span>
        </motion.div>
      ))}
      <p className="px-2 pt-1 pb-1 text-[0.625rem] text-(--hub-muted)">{b("history")}</p>
    </div>
  );
}

function AskAI() {
  const b = useBento();
  const question = b("question");
  const { ref, run, still } = useRunning();
  const [typed, setTyped] = useState(0);
  const [shown, setShown] = useState(false);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (!run) return;
    let reset = 0;
    const c = animate(0, question.length, {
      duration: 1.1,
      delay: 0.4,
      ease: "linear",
      onUpdate: (v) => setTyped(Math.round(v)),
      onComplete: () => {
        setShown(true);
        reset = window.setTimeout(() => {
          setShown(false);
          setTyped(0);
          setCycle((n) => n + 1);
        }, 3400);
      },
    });
    return () => {
      c.stop();
      window.clearTimeout(reset);
    };
  }, [run, cycle, question]);

  const q = still ? question : question.slice(0, typed);
  const visible = still || shown;
  return (
    <div ref={ref} className={cn(TILE, "flex w-64 flex-col gap-1.5 p-1.5")}>
      <div className="flex items-center gap-2 rounded-lg bg-(--hub-ink)/4 px-2.5 py-2">
        <Sparkles className="size-3.5 shrink-0 text-(--hub-accent-strong)" />
        <span className="flex min-h-4 flex-1 items-center text-xs text-(--hub-ink)">
          {q}
          {!visible ? <span className="ml-px h-3.5 w-px bg-(--hub-ink)" /> : null}
        </span>
      </div>
      <motion.div
        initial={false}
        animate={visible ? { opacity: 1, filter: "blur(0px)" } : { opacity: 0, filter: "blur(3px)" }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        className="px-2 pb-1.5 text-[0.6875rem] leading-4 text-(--hub-ink)/80"
      >
        {b("answer")}
        <span className="mt-1.5 block text-[0.625rem] text-(--hub-muted)">{b("answer_source")}</span>
      </motion.div>
    </div>
  );
}

function Milestones() {
  const b = useBento();
  const milestones = [b("m1"), b("m2"), b("m3"), b("m4")];
  const { ref, run, still } = useRunning();
  const step = useStep(6, 900, run);
  const reached = still ? 3 : Math.min(step, milestones.length);
  return (
    <div ref={ref} className="w-64">
      <div className="relative flex items-center justify-between">
        <span className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 overflow-hidden bg-(--hub-ink)/10">
          <motion.span
            className="absolute inset-y-0 left-0 bg-(--hub-accent-strong)"
            initial={false}
            animate={{ width: `${(Math.max(reached - 1, 0) / (milestones.length - 1)) * 100}%` }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          />
        </span>
        {milestones.map((m, i) => (
          <motion.span
            key={m}
            initial={false}
            animate={{ scale: i < reached ? 1 : 0.85 }}
            className={cn(
              "relative z-10 grid size-6 place-items-center rounded-full ring-2 ring-(--hub-panel)",
              i < reached ? "bg-(--hub-accent-strong) text-white" : "bg-(--hub-card) text-(--hub-muted) shadow-[inset_0_0_0_1.5px_var(--hub-line)]",
            )}
          >
            {i < reached ? <Check className="size-3.5" strokeWidth={3} /> : <span className="text-[0.625rem] font-semibold">{i + 1}</span>}
          </motion.span>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[0.625rem] text-(--hub-muted)">
        {milestones.map((m) => (
          <span key={m} className="w-14 text-center first:text-left last:text-right">
            {m}
          </span>
        ))}
      </div>
      <div className={cn(TILE, "mt-4 flex items-center gap-2 px-3 py-2.5 text-xs")}>
        <CircleCheck className="size-4 text-(--hub-accent-strong)" />
        <span className="text-(--hub-ink)">
          {b("next")} {milestones[Math.min(reached, milestones.length - 1)]}
        </span>
      </div>
    </div>
  );
}

const FEATURES: { visual: ReactNode; title: string; body: string }[] = [
  { visual: <KpiChart />, title: "landing.f1_title", body: "landing.f1_desc" },
  { visual: <Lessons />, title: "landing.f2_title", body: "landing.f2_desc" },
  { visual: <SupportPing />, title: "landing.f3_title", body: "landing.f3_desc" },
  { visual: <Registry />, title: "landing.f4_title", body: "landing.f4_desc" },
  { visual: <AskAI />, title: "landing.f5_title", body: "landing.f5_desc" },
  { visual: <Milestones />, title: "landing.f6_title", body: "landing.f6_desc" },
];

export default function FeatureBento() {
  const { t } = useTranslation();
  return (
    <section id="features" aria-labelledby="bento-heading" className="w-full scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <h2 id="bento-heading" className="text-[2.1rem] leading-[1.08] font-extrabold tracking-[-0.035em] text-balance sm:text-5xl">
            {t("landing.features_title")}
          </h2>
          <p className="max-w-[52ch] text-base text-pretty text-(--hub-muted) sm:text-lg">{t("landing.features_subtitle")}</p>
        </div>
        <ul className="mt-12 grid gap-3 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <li key={feature.title}>
              <Reveal delay={(index % 3) * 0.06} className="h-full">
                <article className="flex h-full min-h-[22rem] flex-col overflow-hidden rounded-2xl bg-(--hub-panel) p-6 ring-1 ring-black/[0.04]">
                  <div aria-hidden="true" className="flex flex-1 items-center justify-center pb-6">
                    {feature.visual}
                  </div>
                  <h3 className="text-base font-bold text-(--hub-ink)">{t(feature.title)}</h3>
                  <p className="mt-1.5 max-w-[36ch] text-sm leading-5 text-pretty text-(--hub-muted)">{t(feature.body)}</p>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
