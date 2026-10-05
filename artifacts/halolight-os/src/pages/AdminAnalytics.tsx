import { useTranslation } from "react-i18next";
import { useState } from "react";
import { formatCurrency, useCurrency } from "@/lib/currency";
import { useRevenueReport } from "@/lib/revenueReport";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useGetAdminAnalytics } from "@workspace/api-client-react";
import { AlertCircle } from "lucide-react";
import { Meter, Notice, PageHeader, Section, Stat, StatGrid, type StatTone } from "@/components/page";

const tierTones: Record<string, StatTone | undefined> = {
  at_risk:    "destructive",
  developing: "warning",
  healthy:    "success",
  champion:   undefined,
};

const toneDot: Record<StatTone, string> = {
  success: "bg-success", info: "bg-info", warning: "bg-warning", destructive: "bg-destructive",
};

/** Petit bloc chiffré dans une carte neutre (valeur + légende). */
function Figure({ value, label, tone }: { value: React.ReactNode; label: string; tone?: StatTone }) {
  return (
    <div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground flex items-center gap-2">
        {tone && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${toneDot[tone]}`} aria-hidden="true" />}
        {value}
      </p>
      <p className="text-[13px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export default function AdminAnalytics() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, refetch } = useGetAdminAnalytics();
  const { currency: defaultCurrency } = useCurrency();
  const [selection, setSelection] = useState<string | null>(null);
  const currency = selection ?? defaultCurrency;
  const revenue = useRevenueReport(currency);
  const format = (value: number | null | undefined) => value == null ? "-" : formatCurrency(value, currency, { locale: i18n.language });

  if (isLoading) {
    return (
      <div className="space-y-10">
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        <div className="h-[116px] bg-muted rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (isError || !data) return <Notice icon={AlertCircle} title={t("common.error")} action={<Button variant="outline" size="sm" onClick={() => void refetch()}>{t("common.retry")}</Button>} />;

  const { users, onboarding, academy, sales, community, support, successScores } = data;
  const tierDist = successScores?.tierDistribution as Record<string, number> ?? {};
  const totalWithScores = Object.values(tierDist).reduce((s, v) => s + (v as number), 0);

  const tierLabels: Record<string, string> = {
    champion:   t("admin_analytics.tier_champion"),
    healthy:    t("admin_analytics.tier_healthy"),
    developing: t("admin_analytics.tier_developing"),
    at_risk:    t("admin_analytics.tier_at_risk"),
  };

  return (
    <div className="space-y-10">
      <PageHeader title={t("admin_analytics.title")} description={t("admin_analytics.subtitle")} />

      <Section title={t("admin_analytics.section_users")}>
        <StatGrid className="md:grid-cols-4">
          <Stat label={t("admin_analytics.stat_total_clients")} value={users?.total ?? 0} />
          <Stat label={t("admin_analytics.stat_active")} value={users?.active ?? 0} hint={t("admin_analytics.stat_active_sub", { rate: users?.activeRate ?? 0 })} tone="success" />
          <Stat label={t("admin_analytics.stat_inactive")} value={users?.inactive ?? 0} tone="warning" />
          <Stat label={t("admin_analytics.stat_avg_score")} value={successScores?.avgScore ?? 0} hint={t("admin_analytics.stat_avg_score_sub")} />
        </StatGrid>
      </Section>

      <Section title={t("admin_analytics.section_score_dist")}>
        <StatGrid className="md:grid-cols-4">
          {(["champion", "healthy", "developing", "at_risk"] as const).map((tier) => {
            const count = tierDist[tier] ?? 0;
            const pct = totalWithScores > 0 ? Math.round((count / totalWithScores) * 100) : 0;
            return (
              <Stat
                key={tier}
                label={tierLabels[tier]}
                value={count}
                tone={tierTones[tier]}
                hint={t("admin_analytics.pct_scored", { pct })}
                progress={Math.min(Math.round((count / (totalWithScores || 1)) * 100), 100)}
              />
            );
          })}
        </StatGrid>
      </Section>

      <Section
        title={t("admin_analytics.section_sales")}
        actions={
          <Select value={currency} onValueChange={setSelection}>
            <SelectTrigger className="w-40" aria-label={t("admin_revenue.currency", { defaultValue: "Currency" })}><SelectValue /></SelectTrigger>
            <SelectContent>{(revenue.data?.availableCurrencies ?? [currency]).map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
          </Select>
        }
      >
        <div className="space-y-4">
          {revenue.isError && <Notice icon={AlertCircle} title={t("common.error")} action={<Button variant="outline" size="sm" onClick={() => void revenue.refetch()}>{t("common.retry")}</Button>} />}
          {!!revenue.data?.excludedCurrencyInvoices && <p role="status" className="text-[13px] text-warning">{t("admin_revenue.excluded_currency", { defaultValue: "{{count}} invoices have a missing or invalid currency and are excluded from the financial totals.", count: revenue.data.excludedCurrencyInvoices })}</p>}
          <StatGrid className="md:grid-cols-3 lg:grid-cols-5">
            <Stat label={t("admin_analytics.stat_revenue")} value={format(revenue.data?.overview.totalRevenue)} hint={t("admin_analytics.stat_revenue_sub")} />
            <Stat label={t("admin_analytics.stat_events")} value={sales?.totalEvents ?? 0} />
            <Stat label={t("admin_analytics.stat_quotes")} value={revenue.data?.quoteFunnel.totalQuotes ?? "-"} />
            <Stat label={t("admin_analytics.stat_invoices")} value={revenue.data?.overview.totalInvoices ?? "-"} hint={revenue.data ? t("admin_analytics.stat_invoices_sub", { paid: revenue.data.overview.paidInvoices ?? 0 }) : undefined} />
            <Stat label={t("admin_revenue.funnel_acceptance")} value={revenue.data?.overview.quoteAcceptanceRate == null ? "-" : `${revenue.data.overview.quoteAcceptanceRate}%`} />
          </StatGrid>
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-10">
        <Section title={t("admin_analytics.onboarding_title")}>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-end gap-2 mb-3">
              <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{onboarding?.avgCompletionPct ?? 0}%</span>
              <span className="text-[13px] text-muted-foreground mb-1">{t("admin_analytics.onboarding_avg")}</span>
            </div>
            <Meter value={onboarding?.avgCompletionPct ?? 0} />
            <p className="text-xs text-muted-foreground mt-2">{t("admin_analytics.onboarding_started", { count: onboarding?.usersWithProgress ?? 0 })}</p>
          </div>
        </Section>

        <Section title={t("admin_analytics.academy_title")}>
          <div className="rounded-xl border border-border bg-card p-5 grid grid-cols-3 gap-4">
            <Figure value={academy?.engagedLearners ?? 0} label={t("admin_analytics.academy_learners")} />
            <Figure value={academy?.totalLessonsCompleted ?? 0} label={t("admin_analytics.academy_lessons")} />
            <Figure value={academy?.avgLessonsPerLearner ?? 0} label={t("admin_analytics.academy_avg")} />
          </div>
        </Section>

        <Section title={t("admin_analytics.community_title")}>
          <div className="rounded-xl border border-border bg-card p-5 grid grid-cols-3 gap-4">
            <Figure value={community?.totalPosts ?? 0} label={t("admin_analytics.community_posts")} />
            <Figure value={community?.totalReplies ?? 0} label={t("admin_analytics.community_replies")} />
            <Figure value={community?.recentPosts ?? 0} label={t("admin_analytics.community_recent")} />
          </div>
        </Section>

        <Section title={t("admin_analytics.support_title")}>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Figure value={support?.totalTickets ?? 0} label={t("admin_analytics.support_total")} />
              <Figure value={support?.openTickets ?? 0} label={t("admin_analytics.support_open")} tone="warning" />
              <Figure value={support?.resolvedTickets ?? 0} label={t("admin_analytics.support_resolved")} tone="success" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[13px] text-muted-foreground">
                <span>{t("admin_analytics.support_resolution_rate")}</span>
                <span className="tabular-nums text-foreground">{support?.resolutionRate ?? 0}%</span>
              </div>
              <Meter value={support?.resolutionRate ?? 0} />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
