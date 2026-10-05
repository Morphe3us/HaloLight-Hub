import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Link } from "wouter";
import { formatCurrency, useCurrency } from "@/lib/currency";
import { useRevenueReport } from "@/lib/revenueReport";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AlertCircle, Crown } from "lucide-react";
import { Meter, Notice, PageHeader, Section, Stat, StatGrid, type StatTone } from "@/components/page";

const TIER_CONFIG: Record<string, { color: string; dot: string }> = {
  champion: { color: "hsl(var(--foreground))", dot: "bg-foreground" },
  healthy: { color: "hsl(var(--success))", dot: "bg-success" },
  developing: { color: "hsl(var(--warning))", dot: "bg-warning" },
  at_risk: { color: "hsl(var(--destructive))", dot: "bg-destructive" },
};

const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

function TierBadge({ tier, label }: { tier: string; label: string }) {
  const cfg = TIER_CONFIG[tier];
  if (!cfg) return null;
  return (
    <Badge variant="outline" className="gap-1.5 font-normal text-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {label}
    </Badge>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-4 h-4 stroke-[1.75] text-accent" />;
  return <span className="text-[13px] tabular-nums text-muted-foreground">#{rank}</span>;
}

export default function AdminRevenue() {
  const { t, i18n } = useTranslation();
  const { currency: defaultCurrency } = useCurrency();
  const [selection, setSelection] = useState<string | null>(null);
  const currency = selection ?? defaultCurrency;
  const format = (value: number) => formatCurrency(value, currency, { locale: i18n.language });
  const { data, isLoading, isError, refetch } = useRevenueReport(currency);

  const tierLabels: Record<string, string> = {
    champion: t("admin_clients.tier_champion"),
    healthy: t("admin_clients.tier_healthy"),
    developing: t("admin_clients.tier_developing"),
    at_risk: t("admin_clients.tier_at_risk"),
  };

  if (isLoading) {
    return (
      <div className="space-y-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[232px] rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError || !data) return <Notice icon={AlertCircle} title={t("common.error")} action={<Button variant="outline" size="sm" onClick={() => void refetch()}>{t("common.retry")}</Button>} />;
  const revenue = data as unknown as Record<string, any>;
  const overview = revenue.overview ?? {};
  const monthlyData = (revenue.monthly ?? []).map((m: any) => ({
    month: new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString(i18n.language, { month: "short", year: "numeric", timeZone: "UTC" }),
    revenue: Number(m.revenue ?? 0),
  }));
  const sizeData = (revenue.revenueBySegment ?? []).map((s: any) => ({
    range: s.label,
    count: Number(s.count ?? 0),
    revenue: Number(s.revenue ?? 0),
  }));
  const revenueByTier = revenue.revenueByTier ?? [];
  const quoteFunnel = revenue.quoteFunnel ?? {};
  const clientLeaderboard = revenue.clientLeaderboard ?? [];
  const topPerformers = revenue.topPerformers ?? [];
  const tierPieData = revenueByTier
    .filter((t: any) => t.revenue > 0)
    .map((t: any) => ({
      name: tierLabels[t.tier] ?? t.tier,
      value: Number(t.revenue ?? 0),
      fill: TIER_CONFIG[t.tier]?.color ?? "hsl(var(--muted-foreground))",
    }));

  const statTones: Record<string, StatTone | undefined> = {
    "admin_revenue.stat_unpaid": "warning",
    "admin_revenue.stat_outstanding": "warning",
    "admin_revenue.stat_overdue": "destructive",
  };

  return (
    <div className="space-y-10">
      <PageHeader
        title={t("admin_revenue.title")}
        description={t("admin_revenue.subtitle")}
        actions={
          <Select value={currency} onValueChange={setSelection}>
            <SelectTrigger className="w-40" aria-label={t("admin_revenue.currency", { defaultValue: "Currency" })}><SelectValue /></SelectTrigger>
            <SelectContent>{data.availableCurrencies.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
          </Select>
        }
      />

      {(data.undatedPaidInvoices > 0 || data.excludedCurrencyInvoices > 0) && (
        <div className="space-y-1">
          {data.undatedPaidInvoices > 0 && <p role="status" className="text-[13px] text-warning">{t("admin_revenue.undated_paid", { defaultValue: "{{count}} paid invoices have no payment date and are excluded from the monthly chart.", count: data.undatedPaidInvoices })}</p>}
          {data.excludedCurrencyInvoices > 0 && <p role="status" className="text-[13px] text-warning">{t("admin_revenue.excluded_currency", { defaultValue: "{{count}} invoices have a missing or invalid currency and are excluded from the financial totals.", count: data.excludedCurrencyInvoices })}</p>}
        </div>
      )}

      <StatGrid className="md:grid-cols-4">
        {[
          { labelKey: "admin_revenue.stat_invoiced", value: format(overview.totalInvoiced ?? 0) },
          { labelKey: "admin_revenue.stat_unpaid", value: format(overview.totalUnpaid ?? 0) },
          { labelKey: "admin_revenue.stat_total", value: format(overview.totalRevenue ?? 0) },
          { labelKey: "admin_revenue.stat_paid", value: String(overview.paidInvoices ?? 0) },
          { labelKey: "admin_revenue.stat_outstanding", value: format(overview.outstandingRevenue ?? 0) },
          { labelKey: "admin_revenue.stat_overdue", value: format(overview.overdueRevenue ?? 0) },
          { labelKey: "admin_revenue.stat_avg", value: format(overview.avgBookingValue ?? 0) },
        ].map((s) => (
          <Stat
            key={s.labelKey}
            label={t(s.labelKey as Parameters<typeof t>[0], { defaultValue: s.labelKey === "admin_revenue.stat_invoiced" ? "Invoiced" : s.labelKey === "admin_revenue.stat_unpaid" ? "Unpaid" : s.labelKey })}
            value={<span className="break-words">{s.value}</span>}
            tone={statTones[s.labelKey]}
          />
        ))}
      </StatGrid>

      <Section title={t("admin_revenue.chart_monthly")}>
        <div className="rounded-xl border border-border bg-card p-5">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v) => format(Number(v))}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: any) => [
                  format(Number(v)),
                  t("admin_revenue.stat_total"),
                ]}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--foreground))"
                strokeWidth={1.75}
                dot={{ r: 2.5, fill: "hsl(var(--foreground))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-10">
        <Section title={t("admin_revenue.chart_by_size")}>
          <div className="rounded-xl border border-border bg-card p-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sizeData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis dataKey="range" tick={{ ...AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ ...AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: "hsl(var(--muted))" }}
                  formatter={(v: any) => [
                    String(v),
                    t("admin_revenue.col_invoices"),
                  ]}
                />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--foreground))"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title={t("admin_revenue.chart_by_tier")}>
          <div className="rounded-xl border border-border bg-card p-5">
            {tierPieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={tierPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={70}
                      paddingAngle={2}
                      stroke="hsl(var(--card))"
                      dataKey="value"
                    >
                      {tierPieData.map((_: any, i: number) => (
                        <Cell key={i} fill={tierPieData[i].fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [format(Number(v))]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-3">
                  {(revenueByTier ?? [])
                    .filter((r: any) => r.revenue > 0)
                    .map((r: any) => {
                      const cfg = TIER_CONFIG[r.tier];
                      return (
                        <div
                          key={r.tier}
                          className="flex items-center justify-between text-[13px]"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{
                                backgroundColor: cfg?.color ?? "hsl(var(--muted-foreground))",
                              }}
                            />
                            <span className="text-muted-foreground">
                              {tierLabels[r.tier] ?? r.tier}
                            </span>
                          </div>
                          <span className="tabular-nums text-foreground">
                            {format(r.revenue)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                {t("admin_revenue.no_tier_data")}
              </div>
            )}
          </div>
        </Section>

        <Section title={t("admin_revenue.funnel_title")}>
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            {(
              [
                { key: "draft", labelKey: "admin_revenue.funnel_draft" },
                { key: "sent", labelKey: "admin_revenue.funnel_sent" },
                { key: "accepted", labelKey: "admin_revenue.funnel_accepted" },
                { key: "declined", labelKey: "admin_revenue.funnel_declined" },
                { key: "expired", labelKey: "admin_revenue.funnel_expired" },
              ] as { key: string; labelKey: string }[]
            ).map(({ key, labelKey }) => {
              const item = quoteFunnel?.[key];
              if (!item?.count) return null;
              const maxCount = quoteFunnel?.totalQuotes || 1;
              const pct = Math.round((item.count / maxCount) * 100);
              return (
                <div key={key}>
                  <div className="flex justify-between text-[13px] mb-1.5">
                    <span className="text-muted-foreground">
                      {t(labelKey as Parameters<typeof t>[0])}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {item.count} · {format(item.value ?? 0)}
                    </span>
                  </div>
                  <Meter value={pct} />
                </div>
              );
            })}
            <div className="pt-3 border-t border-border text-[13px] text-muted-foreground flex justify-between">
              <span>{t("admin_revenue.funnel_acceptance")}</span>
              <span className="font-medium tabular-nums text-foreground">
                {quoteFunnel?.acceptanceRate == null ? "-" : `${quoteFunnel.acceptanceRate}%`}
              </span>
            </div>
          </div>
        </Section>
      </div>

      <Section title={t("admin_revenue.leaderboard_title")}>
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-[13px] font-normal text-muted-foreground w-10">
                  #
                </th>
                <th className="text-left px-4 py-2.5 text-[13px] font-normal text-muted-foreground">
                  {t("admin_revenue.col_client")}
                </th>
                <th className="text-right px-4 py-2.5 text-[13px] font-normal text-muted-foreground">
                  {t("admin_revenue.col_total_revenue")}
                </th>
                <th className="text-right px-4 py-2.5 text-[13px] font-normal text-muted-foreground hidden md:table-cell">
                  {t("admin_revenue.col_invoices")}
                </th>
                <th className="text-right px-4 py-2.5 text-[13px] font-normal text-muted-foreground hidden md:table-cell">
                  {t("admin_revenue.col_avg_booking")}
                </th>
                <th className="text-center px-4 py-2.5 text-[13px] font-normal text-muted-foreground hidden lg:table-cell">
                  {t("admin_revenue.col_tier")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(clientLeaderboard ?? []).map((client: any, i: number) => {
                const tier = client.tier ?? "";
                return (
                  <tr
                    key={client.userId}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center w-6">
                        <RankBadge rank={i + 1} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/clients/${client.userId}`}>
                        <div className="cursor-pointer group">
                          <p className="font-medium text-foreground group-hover:underline underline-offset-4">
                            {client.name}
                          </p>
                          <p className="text-[13px] text-muted-foreground">
                            {client.company || client.email}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-medium tabular-nums text-foreground">
                        {format(client.totalRevenue)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums text-muted-foreground">
                      {client.invoiceCount}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums text-muted-foreground">
                      {format(client.avgBooking)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex justify-center">
                        <TierBadge tier={tier} label={tierLabels[tier] ?? tier} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!clientLeaderboard || clientLeaderboard.length === 0) && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground text-sm"
                  >
                    {t("admin_revenue.no_revenue")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {(topPerformers ?? []).length > 0 && (
        <Section title={t("admin_revenue.top_performers")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {(topPerformers ?? []).slice(0, 5).map((client: any, i: number) => {
              const tier = client.tier ?? "";
              return (
                <Link
                  key={client.userId}
                  href={`/admin/clients/${client.userId}`}
                >
                  <div className="rounded-xl border border-border bg-card hover:border-foreground/20 transition-colors cursor-pointer relative overflow-hidden p-5 text-center">
                    {i === 0 && (
                      <div className="absolute top-3 right-3">
                        <Crown className="w-4 h-4 stroke-[1.75] text-accent" />
                      </div>
                    )}
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-foreground text-sm font-medium mx-auto mb-3">
                      {(client.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <p className="font-medium text-foreground text-sm truncate">
                      {client.name}
                    </p>
                    <p className="text-[13px] text-muted-foreground truncate mb-2">
                      {client.company || ""}
                    </p>
                    <p className="text-lg font-semibold tracking-tight tabular-nums text-foreground">
                      {format(client.totalRevenue)}
                    </p>
                    {TIER_CONFIG[tier] && (
                      <div className="mt-2">
                        <TierBadge tier={tier} label={tierLabels[tier] ?? tier} />
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
