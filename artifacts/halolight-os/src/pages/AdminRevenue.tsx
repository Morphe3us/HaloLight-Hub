import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useCurrency } from "@/lib/currency";
import { useGetAdminRevenue } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  DollarSign, TrendingUp, FileText, Users, Award, ReceiptText,
  AlertCircle, Crown,
} from "lucide-react";

const TIER_CONFIG: Record<string, { color: string; bg: string; text: string }> = {
  champion:   { color: "#6b7280", bg: "bg-muted",           text: "text-foreground" },
  healthy:    { color: "#22c55e", bg: "bg-success/15",      text: "text-success" },
  developing: { color: "#f59e0b", bg: "bg-warning/15",      text: "text-yellow-700" },
  at_risk:    { color: "#ef4444", bg: "bg-destructive/15",  text: "text-destructive" },
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400" />;
  return <span className="text-sm text-muted-foreground">#{rank}</span>;
}

export default function AdminRevenue() {
  const { t } = useTranslation();
  const { format, formatCents: fmtFull } = useCurrency();
  const { data, isLoading } = useGetAdminRevenue();

  const tierLabels: Record<string, string> = {
    champion:   t("admin_clients.tier_champion"),
    healthy:    t("admin_clients.tier_healthy"),
    developing: t("admin_clients.tier_developing"),
    at_risk:    t("admin_clients.tier_at_risk"),
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const {
    totalRevenue, paidInvoices, outstandingRevenue, overdueRevenue, avgBookingValue,
    monthlyRevenue, revenueByBookingSize, revenueByTier, quoteFunnel, clientLeaderboard, topPerformers
  } = (data ?? {}) as Record<string, any>;

  const monthlyData = (monthlyRevenue ?? []).map((m: any) => ({ month: m.month, revenue: m.revenue / 100 }));
  const sizeData = (revenueByBookingSize ?? []).map((s: any) => ({ range: s.range, count: s.count, revenue: s.revenue / 100 }));
  const tierPieData = (revenueByTier ?? []).filter((t: any) => t.revenue > 0).map((t: any) => ({
    name: tierLabels[t.tier] ?? t.tier,
    value: t.revenue / 100,
    fill: TIER_CONFIG[t.tier]?.color ?? "#6b7280",
  }));

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("admin_revenue.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("admin_revenue.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { labelKey: "admin_revenue.stat_total",       value: fmtFull(totalRevenue ?? 0),       icon: DollarSign,   color: "text-success" },
          { labelKey: "admin_revenue.stat_paid",        value: String(paidInvoices ?? 0),         icon: ReceiptText,  color: "text-success" },
          { labelKey: "admin_revenue.stat_outstanding", value: fmtFull(outstandingRevenue ?? 0),  icon: FileText,     color: "text-warning" },
          { labelKey: "admin_revenue.stat_overdue",     value: fmtFull(overdueRevenue ?? 0),      icon: AlertCircle,  color: "text-destructive" },
          { labelKey: "admin_revenue.stat_avg",         value: fmtFull(avgBookingValue ?? 0),     icon: TrendingUp,   color: "text-info" },
        ].map(s => (
          <Card key={s.labelKey}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t(s.labelKey as Parameters<typeof t>[0])}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("admin_revenue.chart_monthly")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${(Number(v) / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => [format(Number(v)), t("admin_revenue.stat_total")]} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              {t("admin_revenue.chart_by_size")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sizeData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => [String(v), t("admin_revenue.col_invoices")]} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" />
              {t("admin_revenue.chart_by_tier")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tierPieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={tierPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                      {tierPieData.map((_: any, i: number) => <Cell key={i} fill={tierPieData[i].fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [fmtFull(Number(v) * 100)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {(revenueByTier ?? []).filter((r: any) => r.revenue > 0).map((r: any) => {
                    const cfg = TIER_CONFIG[r.tier];
                    return (
                      <div key={r.tier} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg?.color ?? "#6b7280" }} />
                          <span className="text-muted-foreground">{tierLabels[r.tier] ?? r.tier}</span>
                        </div>
                        <span className="font-medium text-foreground">{fmtFull(r.revenue)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">{t("admin_revenue.no_tier_data")}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              {t("admin_revenue.funnel_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mt-1">
              {([
                { key: "draft",    labelKey: "admin_revenue.funnel_draft",    color: "bg-border" },
                { key: "sent",     labelKey: "admin_revenue.funnel_sent",     color: "bg-info" },
                { key: "accepted", labelKey: "admin_revenue.funnel_accepted", color: "bg-success" },
                { key: "declined", labelKey: "admin_revenue.funnel_declined", color: "bg-destructive" },
                { key: "expired",  labelKey: "admin_revenue.funnel_expired",  color: "bg-muted-foreground" },
              ] as { key: string; labelKey: string; color: string }[]).map(({ key, labelKey, color }) => {
                const item = quoteFunnel?.[key];
                if (!item?.count) return null;
                const maxCount = quoteFunnel?.totalQuotes || 1;
                const pct = Math.round((item.count / maxCount) * 100);
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground font-medium">{t(labelKey as Parameters<typeof t>[0])}</span>
                      <span className="text-muted-foreground">{item.count} · {fmtFull(item.value ?? 0)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full">
                      <div className={`h-2 ${color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 border-t text-xs text-muted-foreground flex justify-between">
                <span>{t("admin_revenue.funnel_acceptance")}</span>
                <span className="font-bold text-success">{quoteFunnel?.acceptanceRate ?? 0}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            {t("admin_revenue.leaderboard_title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-10">#</th>
                  <th className="text-left pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("admin_revenue.col_client")}</th>
                  <th className="text-right pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("admin_revenue.col_total_revenue")}</th>
                  <th className="text-right pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">{t("admin_revenue.col_invoices")}</th>
                  <th className="text-right pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">{t("admin_revenue.col_avg_booking")}</th>
                  <th className="text-center pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">{t("admin_revenue.col_tier")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(clientLeaderboard ?? []).map((client: any, i: number) => {
                  const tier = client.tier ?? "at_risk";
                  const cfg = TIER_CONFIG[tier];
                  return (
                    <tr key={client.userId} className="hover:bg-muted/50 transition-colors">
                      <td className="py-3 pr-2">
                        <div className="flex items-center justify-center w-6"><RankBadge rank={i + 1} /></div>
                      </td>
                      <td className="py-3">
                        <Link href={`/admin/clients/${client.userId}`}>
                          <div className="cursor-pointer hover:text-primary">
                            <p className="font-semibold text-foreground">{client.name}</p>
                            <p className="text-xs text-muted-foreground">{client.company || client.email}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="py-3 text-right"><span className="font-bold text-foreground">{fmtFull(client.totalRevenue)}</span></td>
                      <td className="py-3 text-right hidden md:table-cell text-muted-foreground">{client.invoiceCount}</td>
                      <td className="py-3 text-right hidden md:table-cell text-muted-foreground">{fmtFull(client.avgBooking)}</td>
                      <td className="py-3 hidden lg:table-cell">
                        <div className="flex justify-center">
                          {cfg && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>
                              {tierLabels[tier] ?? tier}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!clientLeaderboard || clientLeaderboard.length === 0) && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">{t("admin_revenue.no_revenue")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {(topPerformers ?? []).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t("admin_revenue.top_performers")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {(topPerformers ?? []).slice(0, 5).map((client: any, i: number) => {
              const tier = client.tier ?? "at_risk";
              const cfg = TIER_CONFIG[tier];
              return (
                <Link key={client.userId} href={`/admin/clients/${client.userId}`}>
                  <Card className="hover:shadow-md transition-all cursor-pointer relative overflow-hidden">
                    {i === 0 && <div className="absolute top-2 right-2"><Crown className="w-4 h-4 text-yellow-400" /></div>}
                    <CardContent className="p-4 text-center">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-lg mx-auto mb-2">
                        {(client.name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <p className="font-semibold text-foreground text-sm truncate">{client.name}</p>
                      <p className="text-xs text-muted-foreground truncate mb-2">{client.company || ""}</p>
                      <p className="text-lg font-bold text-primary">{fmtFull(client.totalRevenue)}</p>
                      {cfg && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium mt-1 inline-block ${cfg.bg} ${cfg.text}`}>
                          {tierLabels[tier] ?? tier}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
