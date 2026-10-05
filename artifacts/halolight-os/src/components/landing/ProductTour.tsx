import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useInView, useReducedMotion, type Variants } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  Camera,
  Check,
  CircleCheck,
  GraduationCap,
  Headset,
  LayoutDashboard,
  Play,
  Printer,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Product tour, adapted from the Aceternity Pro block "Minimal Hero With Huge
 * Interactions": a tabbed app window scaled like a screenshot. Every figure in
 * the window is sample data (labelled under the window).
 */

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function useMock() {
  const { t } = useTranslation();
  return (key: string) => t(`landing.v2.mock.${key}`);
}

/** Renders children at a fixed design size and scales them to the container width. */
function Stage({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setScale(node.clientWidth / width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={ref} className="relative w-full" style={{ aspectRatio: `${width} / ${height}` }}>
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width, height, transform: `scale(${scale ?? 1})`, visibility: scale === null ? "hidden" : undefined }}
      >
        {children}
      </div>
    </div>
  );
}

function TrafficLights() {
  return (
    <div aria-hidden="true" className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-full bg-[#ff5f57]" />
      <span className="size-2.5 rounded-full bg-[#febc2e]" />
      <span className="size-2.5 rounded-full bg-[#28c840]" />
    </div>
  );
}

/** Initials avatar (no external images). */
function Avatar({ initials, tone, size = 22 }: { initials: string; tone: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
      style={{ width: size, height: size, backgroundColor: tone }}
    >
      {initials}
    </span>
  );
}

type Surface = "dashboard" | "equipment" | "academy" | "support" | "ai";

const NAV: { id: Surface; navKey: string; icon: ComponentType<{ className?: string }>; count?: string }[] = [
  { id: "dashboard", navKey: "nav.dashboard", icon: LayoutDashboard },
  { id: "equipment", navKey: "nav.equipment", icon: Camera, count: "4" },
  { id: "academy", navKey: "nav.academy", icon: GraduationCap },
  { id: "support", navKey: "nav.support", icon: Headset, count: "1" },
  { id: "ai", navKey: "nav.ai_assistant", icon: Sparkles },
];

function Sidebar({ surface }: { surface: Surface }) {
  const { t } = useTranslation();
  const m = useMock();
  const highlightId = useId();
  const shouldReduceMotion = useReducedMotion();

  return (
    <aside className="flex w-[212px] shrink-0 flex-col gap-5 border-r border-(--hub-win-line) bg-(--hub-win-side) px-3 pt-4 pb-3">
      <div className="px-1.5">
        <TrafficLights />
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-(--hub-win) px-2 py-2 shadow-[0_0_0_1px_var(--hub-win-line)]">
        <span className="grid size-6 place-items-center rounded-md bg-(--hub-accent) text-[10px] font-bold text-(--hub-ink)">LE</span>
        <div className="leading-tight">
          <p className="text-[12px] font-semibold text-(--hub-ink)">Lumière Events</p>
          <p className="text-[10.5px] text-(--hub-muted)">{m("workspace")}</p>
        </div>
      </div>
      <nav className="flex flex-col gap-px text-[12.5px]">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.id === surface;
          return (
            <div key={item.id} className={cn("relative flex items-center gap-2 rounded-md px-2 py-[6px] text-(--hub-ink)/75", active && "text-(--hub-ink)")}>
              {active ? (
                <motion.span
                  layoutId={highlightId}
                  className="absolute inset-0 rounded-md bg-(--hub-ink)/7"
                  transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", duration: 0.45, bounce: 0.12 }}
                />
              ) : null}
              <Icon className="relative size-3.5 stroke-[1.75] text-(--hub-muted)" />
              <span className="relative flex-1">{t(item.navKey)}</span>
              {item.count ? <span className="relative text-[11px] text-(--hub-muted) tabular-nums">{item.count}</span> : null}
            </div>
          );
        })}
      </nav>
      <div className="mt-auto rounded-lg bg-(--hub-win) p-2.5 shadow-[0_0_0_1px_var(--hub-win-line)]">
        <p className="text-[10.5px] font-medium tracking-wide text-(--hub-muted) uppercase">{m("next_event")}</p>
        <p className="mt-1 text-[12px] font-medium text-(--hub-ink)">{m("event1")}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-(--hub-muted)">
          <Camera className="size-3" /> {m("booth_assigned")}
        </p>
      </div>
    </aside>
  );
}

function Toolbar({ title, meta, right }: { title: string; meta: ReactNode; right?: ReactNode }) {
  const m = useMock();
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-(--hub-win-line) px-5">
      <div className="flex flex-col">
        <p className="text-[13px] font-semibold text-(--hub-ink)">{title}</p>
        <p className="text-[11px] text-(--hub-muted)">{meta}</p>
      </div>
      <div className="ml-auto flex items-center gap-2 text-(--hub-muted)">
        {right ?? (
          <div className="flex h-7 min-w-[180px] items-center gap-1.5 rounded-md bg-(--hub-ink)/5 px-2 text-[11.5px] whitespace-nowrap">
            <Search className="size-3" />
            {m("search")}
            <span className="ml-auto text-[10.5px]">⌘K</span>
          </div>
        )}
      </div>
    </div>
  );
}

const card = "rounded-xl bg-(--hub-win) shadow-[0_0_0_1px_var(--hub-win-line)]";
const WEEKS = [3, 4, 2, 5, 4, 6, 5, 7, 6, 8, 7, 9];

function DashboardScreen() {
  const { t } = useTranslation();
  const m = useMock();
  const shouldReduceMotion = useReducedMotion();
  const max = Math.max(...WEEKS);
  const kpis = [
    { label: m("kpi1"), value: "18", delta: m("kpi1_delta") },
    { label: m("kpi2"), value: "72%", delta: m("kpi2_delta") },
    { label: m("kpi3"), value: m("kpi3_value"), delta: m("kpi3_delta") },
    { label: m("kpi4"), value: "1", delta: m("kpi4_delta") },
  ];
  const upcoming = [
    { name: m("event1"), when: m("event1_when"), booth: "#02", ready: true },
    { name: m("event2"), when: m("event2_when"), booth: "#01", ready: true },
    { name: m("event3"), when: m("event3_when"), booth: "#04", ready: false },
  ];
  return (
    <>
      <Toolbar title={t("nav.dashboard")} meta={m("dashboard_meta")} />
      <div className="flex flex-1 flex-col gap-4 overflow-hidden bg-(--hub-win-side) p-5">
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className={cn(card, "p-3.5")}>
              <p className="text-[11px] text-(--hub-muted)">{k.label}</p>
              <p className="mt-1 text-[22px] font-bold tracking-tight text-(--hub-ink) tabular-nums">{k.value}</p>
              <p className="mt-0.5 text-[10.5px] text-(--hub-accent-strong)">{k.delta}</p>
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-[1.5fr_1fr] gap-3">
          <div className={cn(card, "flex flex-col p-4")}>
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-(--hub-ink)">{m("events_per_week")}</p>
              <span className="rounded-full bg-(--hub-ink)/5 px-2 py-0.5 text-[10.5px] text-(--hub-muted)">{m("last_12_weeks")}</span>
            </div>
            <div className="mt-4 flex flex-1 items-end gap-2">
              {WEEKS.map((v, i) => (
                <motion.div
                  key={i}
                  className={cn("flex-1 rounded-t-md", i === WEEKS.length - 1 ? "bg-(--hub-ink)" : "bg-(--hub-accent)/70")}
                  initial={{ height: shouldReduceMotion ? `${(v / max) * 100}%` : "6%" }}
                  animate={{ height: `${(v / max) * 100}%` }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.7, delay: shouldReduceMotion ? 0 : 0.1 + i * 0.04, ease: EASE_OUT }}
                />
              ))}
            </div>
          </div>
          <div className={cn(card, "flex flex-col p-4")}>
            <p className="text-[12px] font-semibold text-(--hub-ink)">{m("upcoming")}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {upcoming.map((e) => (
                <li key={e.name} className="flex items-center gap-2.5 rounded-lg bg-(--hub-win-side) px-2.5 py-2">
                  <CalendarDays className="size-4 shrink-0 stroke-[1.75] text-(--hub-muted)" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-(--hub-ink)">{e.name}</p>
                    <p className="text-[10.5px] text-(--hub-muted)">
                      {e.when} · {m("booth")} {e.booth}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", e.ready ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/15 text-amber-700")}>
                    {e.ready ? m("status_ready") : m("status_prints_low")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

function EquipmentScreen() {
  const m = useMock();
  const units = [
    { id: "#01", model: "LumiPix · Canon EOS", status: "ready", warranty: `${m("warranty_active")} · 2027`, service: "12/04" },
    { id: "#02", model: "LumiPix · Canon EOS", status: "event", warranty: `${m("warranty_active")} · 2027`, service: "03/05" },
    { id: "#03", model: "LumiPix · DNP DS620", status: "service", warranty: `${m("warranty_active")} · 2026`, service: "28/01" },
    { id: "#04", model: "LumiPix · Canon EOS", status: "ready", warranty: `${m("warranty_active")} · 2027`, service: "21/05" },
  ];
  const label = { ready: m("status_ready"), event: m("status_on_event"), service: m("status_service_due") } as const;
  return (
    <>
      <Toolbar title={m("equipment_title")} meta={m("equipment_meta")} />
      <div className="flex flex-1 flex-col gap-4 overflow-hidden bg-(--hub-win-side) p-5">
        <div className={cn(card, "overflow-hidden")}>
          <div className="grid grid-cols-[1.1fr_1.4fr_1fr_1fr_0.8fr] gap-3 border-b border-(--hub-win-line) px-4 py-2.5 text-[10.5px] font-medium tracking-wide text-(--hub-muted) uppercase">
            <span>{m("col_unit")}</span>
            <span>{m("col_config")}</span>
            <span>{m("col_status")}</span>
            <span>{m("col_warranty")}</span>
            <span>{m("col_service")}</span>
          </div>
          {units.map((u, i) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08 + i * 0.06, ease: EASE_OUT }}
              className="grid grid-cols-[1.1fr_1.4fr_1fr_1fr_0.8fr] items-center gap-3 border-b border-(--hub-win-line) px-4 py-3 text-[12px] last:border-0"
            >
              <span className="flex items-center gap-2 font-semibold text-(--hub-ink)">
                <span className="grid size-6 place-items-center rounded-md bg-(--hub-ink)/5">
                  <Camera className="size-3.5 stroke-[1.75]" />
                </span>
                {m("booth")} {u.id}
              </span>
              <span className="text-(--hub-muted)">{u.model}</span>
              <span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                    u.status === "ready" && "bg-emerald-500/10 text-emerald-700",
                    u.status === "event" && "bg-sky-500/10 text-sky-700",
                    u.status === "service" && "bg-amber-500/15 text-amber-700",
                  )}
                >
                  {label[u.status as keyof typeof label]}
                </span>
              </span>
              <span className="text-(--hub-ink)">{u.warranty}</span>
              <span className="text-(--hub-muted) tabular-nums">{u.service}</span>
            </motion.div>
          ))}
        </div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4, ease: EASE_OUT }}
          className={cn(card, "flex items-center gap-3 p-4")}
        >
          <span className="grid size-9 place-items-center rounded-lg bg-amber-500/15 text-amber-700">
            <Wrench className="size-5 stroke-[1.75]" />
          </span>
          <div className="flex-1">
            <p className="text-[12.5px] font-semibold text-(--hub-ink)">{m("service_title")}</p>
            <p className="text-[11px] text-(--hub-muted)">{m("service_body")}</p>
          </div>
          <span className="rounded-md bg-(--hub-ink) px-3 py-1.5 text-[11.5px] font-medium text-white">{m("book_service")}</span>
        </motion.div>
      </div>
    </>
  );
}

function AcademyScreen() {
  const m = useMock();
  const lessons = [
    { title: m("lesson1"), len: "8 min", done: true },
    { title: m("lesson2"), len: "12 min", done: true },
    { title: m("lesson3"), len: "10 min", done: true },
    { title: m("lesson4"), len: "14 min", done: false },
    { title: m("lesson5"), len: "6 min", done: false },
  ];
  const done = lessons.filter((l) => l.done).length;
  return (
    <>
      <Toolbar title="HaloLight Academy" meta={m("academy_meta")} />
      <div className="grid flex-1 grid-cols-[1.25fr_1fr] gap-4 overflow-hidden bg-(--hub-win-side) p-5">
        <div className={cn(card, "flex flex-col overflow-hidden")}>
          <div className="relative grid h-[230px] place-items-center bg-[radial-gradient(circle_at_30%_30%,#3a2d24,#121212)]">
            <span className="grid size-14 place-items-center rounded-full bg-white/95 text-(--hub-ink) shadow-lg">
              <Play className="size-6 fill-current" />
            </span>
            <span className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-[11px] text-white">{m("lesson4")} · 14:02</span>
          </div>
          <div className="p-4">
            <p className="text-[13px] font-semibold text-(--hub-ink)">{m("lesson4")}</p>
            <p className="mt-1 text-[11.5px] text-(--hub-muted)">{m("lesson4_desc")}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-(--hub-ink)/8">
              <motion.div className="h-full rounded-full bg-(--hub-accent-strong)" initial={{ width: "0%" }} animate={{ width: "38%" }} transition={{ duration: 0.8, ease: EASE_OUT }} />
            </div>
          </div>
        </div>
        <div className={cn(card, "flex flex-col p-4")}>
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-(--hub-ink)">{m("certification")}</p>
            <span className="text-[11px] text-(--hub-muted) tabular-nums">
              {done} / {lessons.length}
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-1">
            {lessons.map((l, i) => (
              <motion.li
                key={l.title}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 odd:bg-(--hub-ink)/[0.025]"
              >
                {l.done ? <CircleCheck className="size-4 shrink-0 text-(--hub-accent-strong)" /> : <span className="size-4 shrink-0 rounded-full ring-1 ring-(--hub-ink)/25" />}
                <span className={cn("flex-1 text-[12px]", l.done ? "text-(--hub-muted)" : "font-medium text-(--hub-ink)")}>{l.title}</span>
                <span className="text-[10.5px] text-(--hub-muted)">{l.len}</span>
              </motion.li>
            ))}
          </ul>
          <div className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-(--hub-muted)">
            <span className="flex -space-x-1.5">
              <Avatar initials="CM" tone="#c4774f" size={20} />
              <Avatar initials="JD" tone="#4f7cc4" size={20} />
              <Avatar initials="SR" tone="#3f9a6b" size={20} />
            </span>
            {m("team_training")}
          </div>
        </div>
      </div>
    </>
  );
}

function SupportScreen() {
  const m = useMock();
  return (
    <>
      <Toolbar
        title={m("ticket_title")}
        meta={m("ticket_meta")}
        right={
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {m("specialist_online")}
          </span>
        }
      />
      <div className="flex flex-1 flex-col gap-3 overflow-hidden bg-(--hub-win-side) p-5">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex max-w-[78%] gap-2.5">
          <Avatar initials="LE" tone="#a8714d" size={26} />
          <div className={cn(card, "p-3 text-[12px] text-(--hub-ink)")}>
            <p className="font-semibold">{m("you")}</p>
            <p className="mt-1 text-(--hub-ink)/85">{m("msg1")}</p>
            <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-(--hub-muted)">
              <Printer className="size-3" /> {m("photo_attached")}
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.45 }} className="ml-auto flex max-w-[80%] flex-row-reverse gap-2.5">
          <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-(--hub-ink) text-[9px] font-bold text-(--hub-accent)">HL</span>
          <div className="rounded-xl bg-(--hub-ink) p-3 text-[12px] text-white">
            <p className="font-semibold">{m("specialist_name")}</p>
            <p className="mt-1 text-white/85">{m("msg2")}</p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-white/85">
              <li>{m("step1")}</li>
              <li>{m("step2")}</li>
              <li>{m("step3")}</li>
            </ol>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.9 }} className="flex max-w-[60%] gap-2.5">
          <Avatar initials="LE" tone="#a8714d" size={26} />
          <div className={cn(card, "p-3 text-[12px] text-(--hub-ink)")}>{m("msg3")}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 1.3 }}
          className="mx-auto mt-auto flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-700"
        >
          <Check className="size-3.5" /> {m("resolved")}
        </motion.div>
      </div>
    </>
  );
}

function AIScreen() {
  const m = useMock();
  const shouldReduceMotion = useReducedMotion();
  const prompt = m("ai_prompt");
  const [typed, setTyped] = useState(shouldReduceMotion ? prompt.length : 0);
  const [answered, setAnswered] = useState(Boolean(shouldReduceMotion));
  const answers = [m("ai_a1"), m("ai_a2"), m("ai_a3"), m("ai_a4"), m("ai_a5")];

  useEffect(() => {
    if (shouldReduceMotion) return;
    const controls = animate(0, prompt.length, {
      duration: 1.4,
      delay: 0.3,
      ease: "linear",
      onUpdate: (v) => setTyped(Math.round(v)),
      onComplete: () => setAnswered(true),
    });
    return () => controls.stop();
  }, [shouldReduceMotion, prompt]);

  return (
    <>
      <Toolbar title={m("ai_title")} meta={m("ai_meta")} />
      <div className="flex flex-1 flex-col gap-4 overflow-hidden bg-(--hub-win-side) p-5">
        <div className={cn(card, "flex items-center gap-2 px-3 py-3 text-[12.5px] text-(--hub-ink)")}>
          <Sparkles className="size-4 shrink-0 text-(--hub-accent-strong)" />
          <span className="flex-1">
            {prompt.slice(0, typed)}
            {!answered ? <span className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-(--hub-ink)" /> : null}
          </span>
          <span className="rounded-md bg-(--hub-ink) px-2 py-1 text-[10.5px] font-medium text-white">{m("ask")}</span>
        </div>
        <AnimatePresence>
          {answered ? (
            <motion.div
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
              className={cn(card, "p-4")}
            >
              <p className="text-[12px] font-semibold text-(--hub-ink)">{m("ai_answer_title")}</p>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {answers.map((a, i) => (
                  <motion.li
                    key={a}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.15 + i * 0.12 }}
                    className="flex items-start gap-2 text-[12px] text-(--hub-ink)/85"
                  >
                    <Check className="mt-0.5 size-3.5 shrink-0 text-(--hub-accent-strong)" />
                    {a}
                  </motion.li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2 text-[10.5px] text-(--hub-muted)">
                <span className="rounded-full bg-(--hub-ink)/5 px-2 py-0.5">{m("ai_source1")}</span>
                <span className="rounded-full bg-(--hub-ink)/5 px-2 py-0.5">{m("ai_source2")}</span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="mt-auto flex gap-2">
          {[m("ai_s1"), m("ai_s2"), m("ai_s3")].map((s) => (
            <span key={s} className="rounded-full bg-(--hub-win) px-3 py-1.5 text-[11px] text-(--hub-muted) shadow-[0_0_0_1px_var(--hub-win-line)]">
              {s}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

const SCREENS: Record<Surface, () => ReactNode> = {
  dashboard: DashboardScreen,
  equipment: EquipmentScreen,
  academy: AcademyScreen,
  support: SupportScreen,
  ai: AIScreen,
};

const BLUR_SCREEN: Variants = {
  enter: { opacity: 0, scale: 0.985, filter: "blur(8px)" },
  center: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.42, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 1.01, filter: "blur(6px)", transition: { duration: 0.22, ease: EASE_OUT } },
};
const FADE_SCREEN: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const WINDOW_WIDTH = 1040;
const WINDOW_HEIGHT = 640;

function AppWindow({ surface }: { surface: Surface }) {
  const shouldReduceMotion = useReducedMotion();
  const Screen = SCREENS[surface];
  return (
    <div
      className="flex overflow-hidden rounded-[14px] bg-(--hub-win) shadow-[0_0_0_1px_var(--hub-win-line),0_1px_2px_oklch(0_0_0/0.04),0_40px_80px_-30px_oklch(0_0_0/0.35)]"
      style={{ width: WINDOW_WIDTH, height: WINDOW_HEIGHT }}
    >
      <Sidebar surface={surface} />
      <div className="relative flex-1">
        <AnimatePresence initial={false}>
          <motion.div
            key={surface}
            className="absolute inset-0 flex origin-top flex-col bg-(--hub-win)"
            variants={shouldReduceMotion ? FADE_SCREEN : BLUR_SCREEN}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <Screen />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const SURFACES: Surface[] = ["dashboard", "equipment", "academy", "support", "ai"];
const AUTO_MS = 6000;

function SurfaceTabs({ active, onChange, baseId }: { active: Surface; onChange: (surface: Surface) => void; baseId: string }) {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = SURFACES.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    onChange(SURFACES[next]);
    tabRefs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={t("landing.v2.tour_tabs")} className="flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-(--hub-chip) p-1 [scrollbar-width:none]">
      {SURFACES.map((surface, index) => {
        const isActive = surface === active;
        return (
          <button
            key={surface}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            id={`${baseId}-tab-${surface}`}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={`${baseId}-panel`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(surface)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "relative min-h-10 shrink-0 rounded-full px-3 text-[0.8125rem] font-semibold sm:min-h-9 sm:px-4",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--hub-ink)",
              isActive ? "text-(--hub-ink)" : "text-(--hub-muted) hover:text-(--hub-ink)",
            )}
          >
            {isActive ? (
              <motion.span
                layoutId={`${baseId}-pill`}
                className="absolute inset-0 rounded-full bg-(--hub-card) shadow-[0_0_0_1px_var(--hub-line-soft),0_1px_2px_oklch(0_0_0/0.06)]"
                transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", duration: 0.5, bounce: 0.18 }}
              />
            ) : null}
            <span className="relative">{t(NAV.find((n) => n.id === surface)!.navKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function ProductTour() {
  const { t } = useTranslation();
  const [active, setActive] = useState<Surface>("dashboard");
  const [paused, setPaused] = useState(false);
  const baseId = useId().replace(/:/g, "");
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { amount: 0.35 });
  const shouldReduceMotion = useReducedMotion();
  const caption = t(`landing.v2.cap_${active}`);
  const cycling = inView && !paused && !shouldReduceMotion;

  // Auto-advance through the views while visible; any interaction stops it.
  useEffect(() => {
    if (!cycling) return;
    const id = window.setTimeout(() => setActive(SURFACES[(SURFACES.indexOf(active) + 1) % SURFACES.length]), AUTO_MS);
    return () => window.clearTimeout(id);
  }, [cycling, active]);

  return (
    <section
      ref={sectionRef}
      id="tour"
      aria-labelledby="tour-heading"
      className="mx-auto flex max-w-6xl scroll-mt-20 flex-col items-center px-4 py-16 sm:px-6 sm:py-24"
      onPointerDown={() => setPaused(true)}
      onKeyDown={() => setPaused(true)}
    >
      <p className="text-sm font-semibold text-(--hub-accent-strong)">{t("landing.v2.tour_eyebrow")}</p>
      <h2 id="tour-heading" className="mt-3 max-w-3xl text-center text-[2.1rem] leading-[1.08] font-extrabold tracking-[-0.035em] text-balance sm:text-5xl">
        {t("landing.v2.tour_title")}
      </h2>
      <p className="mt-4 max-w-[52ch] text-center text-base text-pretty text-(--hub-muted) sm:text-lg">{t("landing.v2.tour_lede")}</p>
      <div className="mt-8 flex max-w-full justify-center sm:mt-10">
        <SurfaceTabs
          active={active}
          onChange={(s) => {
            setPaused(true);
            setActive(s);
          }}
          baseId={baseId}
        />
      </div>

      <figure className="mt-8 w-full max-w-5xl sm:mt-10">
        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`} className="rounded-[14px]">
          <p className="sr-only">{caption}</p>
          {/* On phones the window keeps a readable scale and scrolls sideways. */}
          <div aria-hidden="true" className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
            <div className="min-w-[680px] sm:min-w-0">
              <Stage width={WINDOW_WIDTH} height={WINDOW_HEIGHT}>
                <AppWindow surface={active} />
              </Stage>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-(--hub-muted) sm:hidden">{t("landing.v2.tour_swipe")}</p>
        </div>
        <figcaption aria-hidden="true" className="relative mt-5 flex min-h-12 justify-center text-center text-sm text-pretty text-(--hub-muted) sm:min-h-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={active}
              className="max-w-[56ch]"
              initial={{ opacity: 0, filter: shouldReduceMotion ? "blur(0px)" : "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: shouldReduceMotion ? "blur(0px)" : "blur(4px)" }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            >
              {caption}
            </motion.span>
          </AnimatePresence>
        </figcaption>
        <p className="mt-2 text-center text-xs text-(--hub-muted)/80">{t("landing.v2.tour_sample")}</p>
      </figure>
    </section>
  );
}
