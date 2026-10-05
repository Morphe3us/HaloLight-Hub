import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ArrowUpRight, ChartColumn, ListChecks, Plus, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AI assistant section, adapted from the Aceternity Pro block "Features With
 * Accordion And Image": use-case accordion on the left, the matching prompt
 * shown over an event photo on the right.
 */

type Item = { title: string; description: string; chip: string; prompt: string; icon: ReactNode };

function FeatureAccordion({ items, active, onChange }: { items: Item[]; active: number; onChange: (i: number) => void }) {
  return (
    <div className="flex w-full flex-col">
      {items.map((feature, index) => {
        const isOpen = active === index;
        return (
          <div key={feature.title}>
            <div className="h-px w-full bg-black/10" />
            <button type="button" aria-expanded={isOpen} onClick={() => onChange(index)} className="flex w-full cursor-pointer flex-col py-5 text-left">
              <div className="flex w-full items-center justify-between gap-4">
                <span className={cn("text-lg font-bold tracking-tight", isOpen ? "text-(--hub-ink)" : "text-(--hub-ink)/55")}>{feature.title}</span>
                <Sparkles className={cn("size-4 shrink-0", isOpen ? "text-(--hub-accent-strong)" : "text-(--hub-ink)/30")} />
              </div>
              <motion.div
                initial={false}
                animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                transition={{ height: { type: "spring", stiffness: 420, damping: 36, mass: 0.8 }, opacity: { duration: 0.2 } }}
                className="overflow-hidden"
              >
                <p className="pt-2 text-sm leading-6 text-(--hub-muted)">{feature.description}</p>
              </motion.div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AssistantPreview({ items, active }: { items: Item[]; active: number }) {
  const { t } = useTranslation();
  const item = items[active];
  return (
    <div className="relative h-[30rem] w-full overflow-hidden rounded-3xl md:h-[40rem]">
      <img
        src="/landing/event-guests.jpg"
        alt={t("landing.v2.ai_image_alt")}
        width={1200}
        height={1200}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-black/20" />
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-10">
        <div className="flex w-full flex-col gap-6 overflow-hidden rounded-2xl border-4 border-white/25 bg-white p-4 shadow-xl">
          <motion.div
            key={active}
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.3 }}
            className="px-1 text-sm leading-6 text-(--hub-ink)"
          >
            <span className="mr-1.5 inline-flex translate-y-0.5 items-center gap-1 rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 shadow-xs">
              {item.icon}
              <span className="text-xs font-medium text-neutral-600">{item.chip}</span>
            </span>
            {item.prompt}
          </motion.div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700">
              <Sparkles className="size-4 text-(--hub-accent-strong)" /> HaloLight AI
            </span>
            <span className="grid size-10 place-items-center rounded-full bg-(--hub-ink) text-white" aria-hidden>
              <ArrowUpRight className="size-4" />
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
          {items.map((it, i) => (
            <span
              key={it.chip}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-medium whitespace-nowrap shadow-xs transition",
                i === active ? "border-white bg-white text-neutral-800" : "border-white/40 bg-white/70 text-neutral-600",
              )}
            >
              {it.icon}
              {it.chip}
            </span>
          ))}
          <span className="flex h-8 min-w-10 flex-1 items-center justify-center rounded-lg border border-dashed border-white/50 bg-white/20 text-white">
            <Plus className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AiAssistantSection({ ctaHref }: { ctaHref: string }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const items: Item[] = [1, 2, 3].map((n) => ({
    title: t(`landing.v2.ai_item${n}_title`),
    description: t(`landing.v2.ai_item${n}_desc`),
    chip: t(`landing.v2.ai_item${n}_chip`),
    prompt: t(`landing.v2.ai_item${n}_prompt`),
    icon: [
      <Wrench key="w" className="size-3.5 text-sky-600" />,
      <ListChecks key="l" className="size-3.5 text-emerald-600" />,
      <ChartColumn key="c" className="size-3.5 text-(--hub-accent-strong)" />,
    ][n - 1],
  }));

  return (
    <section id="assistant" className="w-full scroll-mt-20">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-10 px-4 py-16 sm:px-6 md:flex-row md:gap-14 md:py-24">
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-12 self-stretch md:gap-0 md:pb-6">
          <div className="flex max-w-xl flex-col gap-4">
            <p className="text-sm font-semibold text-(--hub-accent-strong)">{t("landing.v2.ai_eyebrow")}</p>
            <h2 className="max-w-md text-[2.1rem] leading-[1.05] font-extrabold tracking-[-0.035em] text-balance md:text-5xl">{t("landing.v2.ai_title")}</h2>
            <p className="max-w-md text-base leading-7 text-(--hub-muted)">{t("landing.v2.ai_desc")}</p>
            <div>
              <Link
                href={ctaHref}
                className="inline-flex h-11 items-center gap-2.5 rounded-full bg-(--hub-ink) py-2 pr-2 pl-5 text-sm font-semibold text-white transition active:scale-[0.98]"
              >
                {t("landing.v2.ai_cta")}
                <span className="grid size-7 place-items-center rounded-full bg-(--hub-accent) text-(--hub-ink)">
                  <ArrowUpRight className="size-4" />
                </span>
              </Link>
            </div>
          </div>
          <FeatureAccordion items={items} active={active} onChange={setActive} />
        </div>
        <div className="w-full shrink-0 md:w-1/2">
          <AssistantPreview items={items} active={active} />
        </div>
      </div>
    </section>
  );
}
