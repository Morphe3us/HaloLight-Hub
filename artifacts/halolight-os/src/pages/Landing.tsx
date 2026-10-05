import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  Monitor,
  Sparkles,
  Users,
} from "lucide-react";

/** Aperçu statique du tableau de bord : illustre le produit sans appel réseau. */
function ProductPreview() {
  const { t } = useTranslation();
  const nav = [
    { icon: LayoutDashboard, label: t("nav.dashboard"), active: true },
    { icon: GraduationCap, label: t("nav.academy") },
    { icon: CalendarDays, label: t("nav.events") },
    { icon: Monitor, label: t("nav.equipment") },
    { icon: LifeBuoy, label: t("nav.support") },
    { icon: Sparkles, label: t("nav.ai_assistant") },
  ];
  const stats = [
    { label: t("dashboard.kpi_lessons"), value: "18", suffix: "/ 24", progress: 75 },
    { label: t("dashboard.kpi_events"), value: "6" },
    { label: t("dashboard.kpi_equipment_alerts"), value: "0", hint: t("dashboard.equipment_ok"), dot: true },
  ];
  const pipeline = [
    { label: t("nav.leads"), value: "32", width: 92 },
    { label: t("nav.quotes"), value: "14", width: 58 },
    { label: t("nav.contracts"), value: "9", width: 40 },
    { label: t("nav.invoices"), value: "7", width: 30 },
  ];

  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-border bg-card overflow-hidden select-none pointer-events-none"
    >
      <div className="flex items-center gap-1.5 border-b border-border px-4 h-10">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="ml-3 text-[11px] text-muted-foreground font-mono">hub.halolightbooth.com</span>
      </div>
      <div className="flex">
        <div className="hidden sm:flex w-44 shrink-0 flex-col gap-0.5 border-r border-border bg-background/60 p-3">
          {nav.map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] " +
                (active ? "bg-muted text-foreground font-medium" : "text-muted-foreground")
              }
            >
              <Icon className="h-3.5 w-3.5 stroke-[1.75]" />
              <span className="truncate">{label}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 min-w-0 p-5 md:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold tracking-tight text-foreground">{t("nav.dashboard")}</p>
            <Bell className="h-3.5 w-3.5 text-muted-foreground stroke-[1.75]" />
          </div>
          <div className="grid grid-cols-3 rounded-xl border border-border overflow-hidden">
            {stats.map((s) => (
              <div key={s.label} className="p-3 md:p-4 min-h-[92px] flex flex-col justify-between gap-3 shadow-[1px_1px_0_0_hsl(var(--border))]">
                <div className="flex items-start justify-between gap-1">
                  <span className="text-[11px] leading-snug text-muted-foreground line-clamp-2">{s.label}</span>
                  {s.dot && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />}
                </div>
                <div>
                  <p className="text-lg md:text-xl font-semibold tracking-tight tabular-nums text-foreground">
                    {s.value}
                    {s.suffix && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{s.suffix}</span>}
                  </p>
                  {s.hint && <p className="text-[10px] text-muted-foreground">{s.hint}</p>}
                  {s.progress !== undefined && (
                    <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-foreground/80" style={{ width: `${s.progress}%` }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[12px] font-medium text-foreground mb-2">{t("dashboard.sales_overview")}</p>
            <div className="space-y-2">
              {pipeline.map((p, i) => (
                <div key={p.label} className="flex items-center gap-3 text-[11px]">
                  <span className="w-5 font-mono text-muted-foreground">0{i + 1}</span>
                  <span className="w-20 truncate text-muted-foreground">{p.label}</span>
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-foreground/70" style={{ width: `${p.width}%` }} />
                  </div>
                  <span className="w-6 text-right tabular-nums text-foreground">{p.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { t } = useTranslation();
  const signupHref = "/sign-in";

  const features = [
    { icon: BarChart3, title: t("landing.f1_title"), desc: t("landing.f1_desc") },
    { icon: GraduationCap, title: t("landing.f2_title"), desc: t("landing.f2_desc") },
    { icon: Users, title: t("landing.f3_title"), desc: t("landing.f3_desc") },
    { icon: Monitor, title: t("landing.f4_title"), desc: t("landing.f4_desc") },
    { icon: Sparkles, title: t("landing.f5_title"), desc: t("landing.f5_desc") },
    { icon: CheckCircle2, title: t("landing.f6_title"), desc: t("landing.f6_desc") },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="page-landing">
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center" aria-label="HaloLight Hub">
            <img src="/hub-logo-light.webp" alt="HaloLight Hub" width={480} height={270} className="w-[96px] h-auto dark:hidden" style={{ mixBlendMode: "multiply" }} />
            <img src="/hub-logo-dark.webp" alt="HaloLight Hub" width={480} height={270} className="w-[96px] h-auto hidden dark:block" style={{ mixBlendMode: "screen" }} />
          </Link>
          <div className="flex items-center gap-1.5">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" data-testid="button-landing-signin">
              <Link href="/sign-in">{t("landing.nav_sign_in")}</Link>
            </Button>
            <Button asChild size="sm" data-testid="button-landing-signup">
              <Link href={signupHref}>{t("landing.nav_get_started")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 md:px-6 pt-16 pb-16 md:pt-24 md:pb-24">
          <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-700 motion-reduce:animate-none">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[13px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {t("landing.hero_badge")}
            </p>
            <h1 className="text-[40px] leading-[1.05] md:text-[64px] font-semibold tracking-[-0.035em] text-foreground text-balance">
              {t("landing.hero_title")}{" "}
              <span className="text-muted-foreground">{t("landing.hero_highlight")}</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
              {t("landing.hero_subtitle")}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button asChild size="lg" className="h-11 px-5 group">
                <Link href={signupHref}>
                  {t("landing.hero_cta")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5">
                <Link href="/sign-in">{t("landing.hero_login")}</Link>
              </Button>
            </div>
          </div>

          <div className="mt-14 md:mt-20 rounded-[22px] bg-accent/30 dark:bg-accent/10 p-2 md:p-3 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-150 fill-mode-both motion-reduce:animate-none">
            <ProductPreview />
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 md:px-6 py-16 md:py-24">
            <div className="max-w-2xl mb-10 md:mb-14">
              <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.03em] text-foreground text-balance">
                {t("landing.features_title")}
              </h2>
              <p className="mt-3 text-lg text-muted-foreground">{t("landing.features_subtitle")}</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 rounded-2xl border border-border bg-card overflow-hidden">
              {features.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="p-6 md:p-8 shadow-[1px_1px_0_0_hsl(var(--border))]">
                  <Icon className="h-5 w-5 text-foreground stroke-[1.5]" />
                  <h3 className="mt-5 text-[15px] font-medium text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 md:px-6 py-16 md:py-24 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
            <div className="max-w-xl">
              <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.03em] text-foreground text-balance">
                {t("landing.cta_title")}
              </h2>
              <p className="mt-3 text-lg text-muted-foreground text-pretty">{t("landing.cta_subtitle")}</p>
            </div>
            <Button asChild size="lg" className="h-11 px-5 shrink-0 group self-start md:self-auto">
              <Link href={signupHref}>
                {t("landing.cta_btn")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 md:px-6 py-8 text-[13px] text-muted-foreground">
          <img src="/hub-logo-light.webp" alt="HaloLight Hub" width={480} height={270} loading="lazy" className="w-[72px] h-auto opacity-80 dark:hidden" style={{ mixBlendMode: "multiply" }} />
          <img src="/hub-logo-dark.webp" alt="HaloLight Hub" width={480} height={270} loading="lazy" className="w-[72px] h-auto opacity-80 hidden dark:block" style={{ mixBlendMode: "screen" }} />
          <p>{t("landing.footer_copy", { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
    </div>
  );
}
