import { useTranslation } from "react-i18next";
import { useState } from "react";
import { formatCurrency, useCurrency } from "@/lib/currency";
import { useRevenueReport } from "@/lib/revenueReport";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useGetAdminAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, TrendingUp, GraduationCap, Calendar, FileText, ReceiptText,
  MessageSquare, LifeBuoy, DollarSign, CheckCircle2, Activity, Award,
  AlertTriangle, Heart,
} from "lucide-react";

const tierColors: Record<string, { bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  at_risk:    { bg: "bg-destructive/15", text: "text-destructive", icon: AlertTriangle },
  developing: { bg: "bg-warning/15",    text: "text-yellow-700",  icon: Activity },
  healthy:    { bg: "bg-success/15",    text: "text-success",     icon: Heart },
  champion:   { bg: "bg-muted",         text: "text-foreground",  icon: Award },
};

function StatCard({ title, value, sub, icon: Icon, color = "text-primary" }: {
  title: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressBar({ value, max = 100, color = "bg-primary" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
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
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="h-8 w-64 bg-border rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (isError || !data) return <div role="alert" className="space-y-4"><p>{t("common.error")}</p><Button onClick={() => void refetch()}>{t("common.retry")}</Button></div>;

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
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("admin_analytics.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("admin_analytics.subtitle")}</p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t("admin_analytics.section_users")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title={t("admin_analytics.stat_total_clients")} value={users?.total ?? 0} icon={Users} />
          <StatCard title={t("admin_analytics.stat_active")} value={users?.active ?? 0} sub={t("admin_analytics.stat_active_sub", { rate: users?.activeRate ?? 0 })} icon={Activity} color="text-success" />
          <StatCard title={t("admin_analytics.stat_inactive")} value={users?.inactive ?? 0} icon={AlertTriangle} color="text-warning" />
          <StatCard title={t("admin_analytics.stat_avg_score")} value={successScores?.avgScore ?? 0} sub={t("admin_analytics.stat_avg_score_sub")} icon={Award} color="text-muted-foreground" />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t("admin_analytics.section_score_dist")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(["champion", "healthy", "developing", "at_risk"] as const).map((tier) => {
            const { bg, text, icon: TierIcon } = tierColors[tier]!;
            const count = tierDist[tier] ?? 0;
            const pct = totalWithScores > 0 ? Math.round((count / totalWithScores) * 100) : 0;
            return (
              <Card key={tier} className={`${bg.replace("100", "50")} border-0`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TierIcon className={`w-4 h-4 ${text}`} />
                    <span className={`text-xs font-medium ${text}`}>{tierLabels[tier]}</span>
                  </div>
                  <div className={`text-3xl font-bold ${text} mb-1`}>{count}</div>
                  <div className="text-xs text-muted-foreground">{t("admin_analytics.pct_scored", { pct })}</div>
                  <ProgressBar value={count} max={totalWithScores || 1} color={text.replace("text-", "bg-")} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t("admin_analytics.section_sales")}</h2>
        <Select value={currency} onValueChange={setSelection}>
          <SelectTrigger className="w-40 mb-4" aria-label={t("admin_revenue.currency", { defaultValue: "Currency" })}><SelectValue /></SelectTrigger>
          <SelectContent>{(revenue.data?.availableCurrencies ?? [currency]).map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
        </Select>
        {revenue.isError && <div role="alert"><p>{t("common.error")}</p><Button onClick={() => void revenue.refetch()}>{t("common.retry")}</Button></div>}
        {!!revenue.data?.excludedCurrencyInvoices && <p role="status" className="mb-4 text-sm text-warning">{t("admin_revenue.excluded_currency", { defaultValue: "{{count}} invoices have a missing or invalid currency and are excluded from the financial totals.", count: revenue.data.excludedCurrencyInvoices })}</p>}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard title={t("admin_analytics.stat_revenue")} value={format(revenue.data?.overview.totalRevenue)} sub={t("admin_analytics.stat_revenue_sub")} icon={DollarSign} color="text-success" />
          <StatCard title={t("admin_analytics.stat_events")} value={sales?.totalEvents ?? 0} icon={Calendar} />
          <StatCard title={t("admin_analytics.stat_quotes")} value={revenue.data?.quoteFunnel.totalQuotes ?? "-"} icon={FileText} />
          <StatCard title={t("admin_analytics.stat_invoices")} value={revenue.data?.overview.totalInvoices ?? "-"} sub={revenue.data ? t("admin_analytics.stat_invoices_sub", { paid: revenue.data.overview.paidInvoices ?? 0 }) : undefined} icon={ReceiptText} />
          <StatCard title={t("admin_revenue.funnel_acceptance")} value={revenue.data?.overview.quoteAcceptanceRate == null ? "-" : `${revenue.data.overview.quoteAcceptanceRate}%`} icon={TrendingUp} color="text-info" />
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              {t("admin_analytics.onboarding_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 mb-3">
              <span className="text-3xl font-bold text-foreground">{onboarding?.avgCompletionPct ?? 0}%</span>
              <span className="text-sm text-muted-foreground mb-1">{t("admin_analytics.onboarding_avg")}</span>
            </div>
            <ProgressBar value={onboarding?.avgCompletionPct ?? 0} color="bg-primary" />
            <p className="text-xs text-muted-foreground mt-2">{t("admin_analytics.onboarding_started", { count: onboarding?.usersWithProgress ?? 0 })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-primary" />
              {t("admin_analytics.academy_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{academy?.engagedLearners ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("admin_analytics.academy_learners")}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{academy?.totalLessonsCompleted ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("admin_analytics.academy_lessons")}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{academy?.avgLessonsPerLearner ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("admin_analytics.academy_avg")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              {t("admin_analytics.community_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{community?.totalPosts ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("admin_analytics.community_posts")}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{community?.totalReplies ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("admin_analytics.community_replies")}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{community?.recentPosts ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("admin_analytics.community_recent")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-primary" />
              {t("admin_analytics.support_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center mb-3">
              <div>
                <p className="text-2xl font-bold text-foreground">{support?.totalTickets ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("admin_analytics.support_total")}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-warning">{support?.openTickets ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("admin_analytics.support_open")}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-success">{support?.resolvedTickets ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("admin_analytics.support_resolved")}</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t("admin_analytics.support_resolution_rate")}</span>
                <span className="font-medium">{support?.resolutionRate ?? 0}%</span>
              </div>
              <ProgressBar value={support?.resolutionRate ?? 0} color="bg-success" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
