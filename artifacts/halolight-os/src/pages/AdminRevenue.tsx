import { Link } from "wouter";
import { useGetAdminRevenue } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DollarSign, TrendingUp, TrendingDown, FileText, Award, BarChart3,
  ArrowLeft, Crown, Star, Medal, Target, Zap, Users, ReceiptText,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; text: string }> = {
  champion:   { label: "Champion",   color: "#9333ea", bg: "bg-purple-100", text: "text-purple-700" },
  healthy:    { label: "Healthy",    color: "#16a34a", bg: "bg-green-100",  text: "text-green-700"  },
  developing: { label: "Developing", color: "#ca8a04", bg: "bg-yellow-100", text: "text-yellow-700" },
  at_risk:    { label: "At Risk",    color: "#dc2626", bg: "bg-red-100",    text: "text-red-700"    },
};

const SEGMENT_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7"];
const TIER_COLORS = ["#9333ea", "#16a34a", "#ca8a04", "#dc2626"];

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n}`;
}

function fmtFull(n: number) {
  return `$${n.toLocaleString()}`;
}

function KPICard({ title, value, sub, icon: Icon, color = "text-primary", trend }: {
  title: string; value: string; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string; trend?: number;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">{title}</p>
            <p className={`text-2xl font-bold ${color} leading-none`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
            {trend !== undefined && (
              <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${trend >= 0 ? "text-green-600" : "text-red-500"}`}>
                {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {trend >= 0 ? "+" : ""}{trend}% vs last month
              </div>
            )}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color.replace("text-", "bg-").replace("-600", "-100").replace("-700", "-100").replace("primary", "primary/10")}`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="w-5 text-center text-sm font-bold text-gray-400">#{rank}</span>;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {fmtFull(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function AdminRevenue() {
  const { data, isLoading } = useGetAdminRevenue();

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-8 w-72 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { overview, monthly, clientLeaderboard, revenueByTier, revenueBySegment, quoteFunnel, topPerformers } = data as any;

  const funnelData = [
    { name: "Quotes Sent", value: (quoteFunnel?.sent?.count ?? 0) + (quoteFunnel?.accepted?.count ?? 0) + (quoteFunnel?.declined?.count ?? 0), fill: "#6366f1" },
    { name: "Accepted", value: quoteFunnel?.accepted?.count ?? 0, fill: "#16a34a" },
    { name: "Declined", value: quoteFunnel?.declined?.count ?? 0, fill: "#dc2626" },
  ].filter(d => d.value > 0);

  const tierPieData = (revenueByTier ?? [])
    .filter((t: any) => t.revenue > 0)
    .map((t: any, i: number) => ({
      name: TIER_CONFIG[t.tier]?.label ?? t.tier,
      value: t.revenue,
      fill: TIER_COLORS[i] ?? "#6366f1",
    }));

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Revenue Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">Financial performance, trends, and client revenue rankings</p>
        </div>
        <Link href="/admin/analytics">
          <Button variant="outline" size="sm" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            All Analytics
          </Button>
        </Link>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Total Revenue"
          value={fmtFull(overview?.totalRevenue ?? 0)}
          sub={`${overview?.paidInvoices ?? 0} paid invoices`}
          icon={DollarSign}
          color="text-green-600"
          trend={overview?.revenueGrowth}
        />
        <KPICard
          title="Avg Booking Value"
          value={fmtFull(overview?.avgBookingValue ?? 0)}
          sub="per paid invoice"
          icon={Target}
          color="text-blue-600"
        />
        <KPICard
          title="Quote Acceptance"
          value={`${overview?.quoteAcceptanceRate ?? 0}%`}
          sub={`${quoteFunnel?.accepted?.count ?? 0} of ${quoteFunnel?.totalQuotes ?? 0} quotes`}
          icon={FileText}
          color="text-purple-600"
        />
        <KPICard
          title="Pipeline Revenue"
          value={fmtFull(overview?.pipelineRevenue ?? 0)}
          sub="from open invoices"
          icon={Zap}
          color="text-orange-500"
        />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Revenue Growth"
          value={`${overview?.revenueGrowth >= 0 ? "+" : ""}${overview?.revenueGrowth ?? 0}%`}
          sub="vs previous month"
          icon={TrendingUp}
          color={(overview?.revenueGrowth ?? 0) >= 0 ? "text-green-600" : "text-red-500"}
        />
        <KPICard
          title="Lifetime Estimate"
          value={fmtFull(overview?.lifetimeEstimate ?? 0)}
          sub="12-month projection"
          icon={Award}
          color="text-indigo-600"
        />
        <KPICard
          title="Total Invoices"
          value={String(overview?.totalInvoices ?? 0)}
          sub={`${overview?.paidInvoices ?? 0} paid`}
          icon={ReceiptText}
          color="text-gray-700"
        />
        <KPICard
          title="Conversion Value"
          value={fmtFull(quoteFunnel?.conversionValue ?? 0)}
          sub="from accepted quotes"
          icon={TrendingUp}
          color="text-teal-600"
        />
      </div>

      {/* Revenue Trend Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Monthly Revenue — Last 12 Months
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue by Segment */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Revenue by Booking Size
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(revenueBySegment ?? []).map((seg: any, i: number) => {
                const maxRev = Math.max(...(revenueBySegment ?? []).map((s: any) => s.revenue), 1);
                const pct = Math.round((seg.revenue / maxRev) * 100);
                return (
                  <div key={seg.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 font-medium">{seg.label}</span>
                      <span className="text-gray-500">{fmtFull(seg.revenue)} ({seg.count})</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: SEGMENT_COLORS[i] ?? "#6366f1" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Revenue by Tier Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" />
              Revenue by Client Tier
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tierPieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={tierPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                      {tierPieData.map((entry: any, i: number) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmtFull(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {(revenueByTier ?? []).filter((t: any) => t.revenue > 0).map((t: any) => {
                    const cfg = TIER_CONFIG[t.tier];
                    return (
                      <div key={t.tier} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg?.color ?? "#6b7280" }} />
                          <span className="text-gray-600">{cfg?.label ?? t.tier}</span>
                        </div>
                        <span className="font-medium text-gray-700">{fmtFull(t.revenue)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400">No tier data yet</div>
            )}
          </CardContent>
        </Card>

        {/* Quote Funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Quote Conversion Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mt-1">
              {[
                { key: "draft",    label: "Draft",    color: "bg-gray-200" },
                { key: "sent",     label: "Sent",     color: "bg-blue-400" },
                { key: "accepted", label: "Accepted", color: "bg-green-500" },
                { key: "declined", label: "Declined", color: "bg-red-400" },
                { key: "expired",  label: "Expired",  color: "bg-gray-400" },
              ].map(({ key, label, color }) => {
                const item = (quoteFunnel as any)?.[key];
                if (!item?.count) return null;
                const maxCount = quoteFunnel?.totalQuotes || 1;
                const pct = Math.round((item.count / maxCount) * 100);
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 font-medium">{label}</span>
                      <span className="text-gray-500">{item.count} · {fmtFull(item.value ?? 0)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div className={`h-2 ${color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 border-t text-xs text-gray-500 flex justify-between">
                <span>Acceptance rate</span>
                <span className="font-bold text-green-600">{quoteFunnel?.acceptanceRate ?? 0}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client Revenue Leaderboard */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Client Revenue Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-10">#</th>
                  <th className="text-left pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Client</th>
                  <th className="text-right pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Revenue</th>
                  <th className="text-right pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Invoices</th>
                  <th className="text-right pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Avg Booking</th>
                  <th className="text-center pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden lg:table-cell">Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(clientLeaderboard ?? []).map((client: any, i: number) => {
                  const tier = client.tier ?? "at_risk";
                  const cfg = TIER_CONFIG[tier];
                  return (
                    <tr key={client.userId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 pr-2">
                        <div className="flex items-center justify-center w-6">
                          <RankBadge rank={i + 1} />
                        </div>
                      </td>
                      <td className="py-3">
                        <Link href={`/admin/clients/${client.userId}`}>
                          <div className="cursor-pointer hover:text-primary">
                            <p className="font-semibold text-gray-900">{client.name}</p>
                            <p className="text-xs text-gray-400">{client.company || client.email}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="py-3 text-right">
                        <span className="font-bold text-gray-900">{fmtFull(client.totalRevenue)}</span>
                      </td>
                      <td className="py-3 text-right hidden md:table-cell text-gray-500">{client.invoiceCount}</td>
                      <td className="py-3 text-right hidden md:table-cell text-gray-500">{fmtFull(client.avgBooking)}</td>
                      <td className="py-3 hidden lg:table-cell">
                        <div className="flex justify-center">
                          {cfg ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>
                              {cfg.label}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!clientLeaderboard || clientLeaderboard.length === 0) && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400 text-sm">No revenue data yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Top Performers Spotlight */}
      {(topPerformers ?? []).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Top Performers</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {(topPerformers ?? []).slice(0, 5).map((client: any, i: number) => {
              const tier = client.tier ?? "at_risk";
              const cfg = TIER_CONFIG[tier];
              return (
                <Link key={client.userId} href={`/admin/clients/${client.userId}`}>
                  <Card className="hover:shadow-md transition-all cursor-pointer relative overflow-hidden group">
                    {i === 0 && (
                      <div className="absolute top-2 right-2">
                        <Crown className="w-4 h-4 text-yellow-400" />
                      </div>
                    )}
                    <CardContent className="p-4 text-center">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-lg mx-auto mb-2">
                        {(client.name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <p className="font-semibold text-gray-900 text-sm truncate">{client.name}</p>
                      <p className="text-xs text-gray-400 truncate mb-2">{client.company || ""}</p>
                      <p className="text-lg font-bold text-primary">{fmtFull(client.totalRevenue)}</p>
                      {cfg && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium mt-1 inline-block ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
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
