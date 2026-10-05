import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ArrowRight, Headset, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import HubHero, { HubGlyph, HubLogo } from "@/components/landing/HubHero";
import ProductTour from "@/components/landing/ProductTour";
import FeatureBento from "@/components/landing/FeatureBento";
import AiAssistantSection from "@/components/landing/AiAssistantSection";

/*
 * Public landing page. Sections adapted from Aceternity Pro blocks (hero with hub,
 * tabbed product tour, illustrated bento, accordion with image), re-skinned to the
 * Hub brand. The page keeps its own light palette regardless of the app theme.
 */

const SIGN_IN = "/sign-in";

const TOKENS = cn(
  "[--hub-paper:#f9f8f6] [--hub-card:#ffffff] [--hub-panel:#f2efea] [--hub-chip:#ebe7e1]",
  "[--hub-ink:#121212] [--hub-muted:#6b6b6b] [--hub-line:#d6d0c7] [--hub-line-soft:oklch(0_0_0/0.07)]",
  "[--hub-accent:#ddb398] [--hub-accent-strong:#a8714d]",
  "[--hub-win:#ffffff] [--hub-win-side:#faf9f7] [--hub-win-line:oklch(0_0_0/0.08)]",
);

export default function Landing() {
  const { t } = useTranslation();
  const values = [
    { icon: Zap, title: t("landing.v2.value1_title"), body: t("landing.v2.value1_body") },
    { icon: Headset, title: t("landing.v2.value2_title"), body: t("landing.v2.value2_body") },
    { icon: ShieldCheck, title: t("landing.v2.value3_title"), body: t("landing.v2.value3_body") },
  ];
  const steps = [1, 2, 3, 4].map((n) => ({ title: t(`landing.v2.ob_step${n}_title`), body: t(`landing.v2.ob_step${n}_body`) }));

  return (
    <div
      className={cn(TOKENS, "min-h-screen scroll-smooth bg-(--hub-paper) font-sans text-(--hub-ink) antialiased [color-scheme:light]")}
      data-testid="page-landing"
    >
      <HubHero signInHref={SIGN_IN} />

      <section aria-label={t("landing.v2.values_label")} className="border-y border-black/5 bg-(--hub-card)">
        <ul className="mx-auto grid max-w-6xl gap-px bg-black/5 sm:grid-cols-3">
          {values.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-start gap-3 bg-(--hub-card) px-5 py-5 sm:px-6">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-(--hub-accent)/25 text-(--hub-accent-strong)">
                <Icon className="size-5 stroke-[1.75]" />
              </span>
              <span>
                <span className="block text-sm font-bold">{title}</span>
                <span className="block text-sm text-(--hub-muted)">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <ProductTour />
      <FeatureBento />
      <AiAssistantSection ctaHref={SIGN_IN} />

      <section id="onboarding" className="scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-(--hub-ink) px-6 py-14 text-white sm:px-12 sm:py-16">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-(--hub-accent)/20 blur-3xl" />
          <p className="text-sm font-semibold text-(--hub-accent)">{t("landing.f6_title")}</p>
          <h2 className="mt-3 max-w-xl text-[2rem] leading-[1.08] font-extrabold tracking-[-0.035em] text-balance sm:text-5xl">{t("landing.v2.ob_title")}</h2>
          <p className="mt-4 max-w-lg text-white/65">{t("landing.v2.ob_desc")}</p>
          <ol className="relative mt-12 grid gap-8 md:grid-cols-4 md:gap-6">
            <span aria-hidden className="absolute top-5 right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-(--hub-accent) via-white/25 to-white/10 md:block" />
            {steps.map((s, i) => (
              <li key={s.title} className="relative">
                <span
                  className={cn(
                    "relative z-10 grid size-10 place-items-center rounded-full text-sm font-bold ring-4 ring-(--hub-ink)",
                    i === 0 ? "bg-(--hub-accent) text-(--hub-ink)" : "bg-white/10 text-white",
                  )}
                >
                  {i + 1}
                </span>
                <h3 className="mt-4 font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-white/60">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 sm:pb-28">
        <div className="relative mx-auto flex max-w-4xl flex-col items-center overflow-hidden rounded-[2rem] bg-(--hub-card) px-6 py-14 text-center ring-1 ring-black/5 sm:py-20">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(50%_50%_at_50%_100%,rgba(221,179,152,0.45),transparent)]" />
          <span className="relative grid size-16 place-items-center rounded-2xl bg-(--hub-ink) text-(--hub-accent) shadow-[0_20px_40px_-16px_rgba(0,0,0,0.6)]">
            <HubGlyph className="size-10" />
          </span>
          <h2 className="relative mt-8 max-w-2xl text-[2.1rem] leading-[1.05] font-extrabold tracking-[-0.035em] text-balance sm:text-5xl">{t("landing.cta_title")}</h2>
          <p className="relative mt-4 max-w-lg text-(--hub-muted) sm:text-lg">{t("landing.cta_subtitle")}</p>
          <div className="relative mt-8 flex w-full flex-col justify-center gap-2.5 sm:w-auto sm:flex-row">
            <Link
              href={SIGN_IN}
              className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-(--hub-ink) px-6 text-[0.9375rem] font-semibold text-white hover:bg-black"
            >
              {t("landing.cta_btn")}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href={SIGN_IN} className="inline-flex min-h-11 items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold ring-1 ring-black/10 hover:ring-black/20">
              {t("landing.hero_login")}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/5 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-(--hub-muted) sm:flex-row">
          <HubLogo className="w-[84px] opacity-80" />
          <nav aria-label="Footer" className="flex gap-6">
            <a href="#tour" className="hover:text-(--hub-ink)">
              {t("landing.v2.nav_product")}
            </a>
            <a href="#features" className="hover:text-(--hub-ink)">
              {t("landing.v2.nav_features")}
            </a>
            <Link href={SIGN_IN} className="hover:text-(--hub-ink)">
              {t("landing.nav_sign_in")}
            </Link>
          </nav>
          <p>{t("landing.footer_copy", { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
    </div>
  );
}
