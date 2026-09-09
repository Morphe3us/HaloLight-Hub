import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, GraduationCap, Users, CheckCircle2, Monitor, Sparkles } from "lucide-react";

export default function Landing() {
  const { t } = useTranslation();
  const signupHref =
    import.meta.env.DEV || import.meta.env.VITE_ALLOW_PUBLIC_SIGNUPS === "true"
      ? "/sign-up"
      : "/sign-in";

  const features = [
    { icon: BarChart3,    color: "bg-accent/15 text-foreground",   title: t("landing.f1_title"), desc: t("landing.f1_desc") },
    { icon: GraduationCap, color: "bg-info/15 text-foreground",    title: t("landing.f2_title"), desc: t("landing.f2_desc") },
    { icon: Users,        color: "bg-success/15 text-foreground",  title: t("landing.f3_title"), desc: t("landing.f3_desc") },
    { icon: Monitor,      color: "bg-warning/15 text-foreground",  title: t("landing.f4_title"), desc: t("landing.f4_desc") },
    { icon: Sparkles,     color: "bg-accent/15 text-foreground",   title: t("landing.f5_title"), desc: t("landing.f5_desc") },
    { icon: CheckCircle2, color: "bg-success/15 text-foreground",  title: t("landing.f6_title"), desc: t("landing.f6_desc") },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans" data-testid="page-landing">
      <header className="bg-background/80 backdrop-blur-md border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <img src="/logo-hub-light-orig.png" alt="HaloLight Hub" className="w-[120px] h-auto object-contain dark:hidden" style={{ mixBlendMode: "multiply" }} />
          <img src="/logo-hub-dark-orig.png" alt="HaloLight Hub" className="w-[120px] h-auto object-contain hidden dark:block" style={{ mixBlendMode: "screen" }} />
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" className="font-medium text-muted-foreground hover:text-foreground" data-testid="button-landing-signin">
              {t("landing.nav_sign_in")}
            </Button>
          </Link>
          <Link href={signupHref}>
            <Button className="font-medium shadow-sm" data-testid="button-landing-signup">
              {t("landing.nav_get_started")}
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center">
        <section className="w-full max-w-5xl mx-auto px-6 py-24 md:py-32 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/20 text-foreground font-semibold text-sm mb-8 border border-accent/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            {t("landing.hero_badge")}
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6 max-w-4xl leading-[1.1]">
            {t("landing.hero_title")}{" "}
            <span style={{ color: "#DDB398" }}>{t("landing.hero_highlight")}</span>.
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
            {t("landing.hero_subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href={signupHref}>
              <Button size="lg" className="h-14 px-8 text-lg font-medium shadow-md group">
                {t("landing.hero_cta")} <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-medium">
                {t("landing.hero_login")}
              </Button>
            </Link>
          </div>
        </section>

        <section className="w-full bg-card border-y border-border py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-foreground mb-4">{t("landing.features_title")}</h2>
              <p className="text-lg text-muted-foreground">{t("landing.features_subtitle")}</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {features.map(({ icon: Icon, color, title, desc }) => (
                <div key={title} className="p-8 rounded-2xl bg-background border border-border hover:border-accent/40 hover:shadow-md transition-all duration-200 group">
                  <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-200`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-sm">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full max-w-4xl mx-auto px-6 py-24 text-center">
          <div className="bg-foreground rounded-3xl p-12 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-accent rounded-t-3xl"></div>
            <h2 className="text-3xl font-bold text-background mb-4">{t("landing.cta_title")}</h2>
            <p className="text-background/80 text-lg mb-8 max-w-xl mx-auto">{t("landing.cta_subtitle")}</p>
            <Link href={signupHref}>
              <Button size="lg" className="h-12 px-8 text-base font-semibold bg-accent text-foreground hover:bg-accent/90 border-0 shadow-none">
                {t("landing.cta_btn")}
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-card border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>{t("landing.footer_copy", { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}
