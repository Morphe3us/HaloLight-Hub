import { useGetAdminAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, TrendingUp, GraduationCap, Calendar, FileText, ReceiptText,
  MessageSquare, LifeBuoy, DollarSign, CheckCircle2, Activity, Award,
  AlertTriangle, Heart, Star, Zap,
} from "lucide-react";

const tierColors: Record<string, { bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  at_risk: { bg: "bg-destructive/15", text: "text-destructive", icon: AlertTriangle },
  developing: { bg: "bg-warning/15", text: "text-yellow-700", icon: Activity },
  healthy: { bg: "bg-success/15", text: "text-success", icon: Heart },
  champion: { bg: "bg-muted", text: "text-foreground", icon: Award },
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
  const { data, isLoading } = useGetAdminAnalytics();

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

  if (!data) return null;

  const { users, onboarding, academy, sales, community, support, successScores } = data;
  const tierDist = successScores?.tierDistribution as Record<string, number> ?? {};
  const totalWithScores = Object.values(tierDist).reduce((s, v) => s + (v as number), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Platform-wide metrics and insights</p>
      </div>

      {/* Users */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Users</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Clients" value={users?.total ?? 0} icon={Users} />
          <StatCard title="Active (30 days)" value={users?.active ?? 0} sub={`${users?.activeRate ?? 0}% of total`} icon={Activity} color="text-success" />
          <StatCard title="Inactive" value={users?.inactive ?? 0} icon={AlertTriangle} color="text-warning" />
          <StatCard title="Avg Success Score" value={successScores?.avgScore ?? 0} sub="/ 100" icon={Award} color="text-muted-foreground" />
        </div>
      </section>

      {/* Score Distribution */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Success Score Distribution</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(["champion", "healthy", "developing", "at_risk"] as const).map((tier) => {
            const { bg, text, icon: TierIcon } = tierColors[tier]!;
            const count = tierDist[tier] ?? 0;
            const pct = totalWithScores > 0 ? Math.round((count / totalWithScores) * 100) : 0;
            const labels: Record<string, string> = { champion: "Champion (80-100)", healthy: "Healthy (55-79)", developing: "Developing (30-54)", at_risk: "At Risk (0-29)" };
            return (
              <Card key={tier} className={`${bg.replace("100", "50")} border-0`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TierIcon className={`w-4 h-4 ${text}`} />
                    <span className={`text-xs font-medium ${text}`}>{labels[tier]}</span>
                  </div>
                  <div className={`text-3xl font-bold ${text} mb-1`}>{count}</div>
                  <div className="text-xs text-muted-foreground">{pct}% of scored users</div>
                  <ProgressBar value={count} max={totalWithScores || 1} color={text.replace("text-", "bg-")} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Sales & Revenue */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Sales & Revenue</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard title="Total Revenue" value={`$${((sales?.totalRevenue ?? 0) / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}` } sub="from paid invoices" icon={DollarSign} color="text-success" />
          <StatCard title="Events" value={sales?.totalEvents ?? 0} icon={Calendar} />
          <StatCard title="Quotes" value={sales?.totalQuotes ?? 0} icon={FileText} />
          <StatCard title="Invoices" value={sales?.totalInvoices ?? 0} sub={`${sales?.paidInvoices ?? 0} paid`} icon={ReceiptText} />
          <StatCard title="Quote→Invoice Rate" value={`${sales?.conversionRate ?? 0}%`} icon={TrendingUp} color="text-info" />
        </div>
      </section>

      {/* Platform Engagement */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Onboarding */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Onboarding Completion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 mb-3">
              <span className="text-3xl font-bold text-foreground">{onboarding?.avgCompletionPct ?? 0}%</span>
              <span className="text-sm text-muted-foreground mb-1">average completion</span>
            </div>
            <ProgressBar value={onboarding?.avgCompletionPct ?? 0} color="bg-primary" />
            <p className="text-xs text-muted-foreground mt-2">{onboarding?.usersWithProgress ?? 0} users have started onboarding</p>
          </CardContent>
        </Card>

        {/* Academy */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-primary" />
              Academy Engagement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{academy?.engagedLearners ?? 0}</p>
                <p className="text-xs text-muted-foreground">Active learners</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{academy?.totalLessonsCompleted ?? 0}</p>
                <p className="text-xs text-muted-foreground">Lessons completed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{academy?.avgLessonsPerLearner ?? 0}</p>
                <p className="text-xs text-muted-foreground">Avg per learner</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Community */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Community Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{community?.totalPosts ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total posts</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{community?.totalReplies ?? 0}</p>
                <p className="text-xs text-muted-foreground">Replies</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{community?.recentPosts ?? 0}</p>
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Support */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-primary" />
              Support Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center mb-3">
              <div>
                <p className="text-2xl font-bold text-foreground">{support?.totalTickets ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total tickets</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-warning">{support?.openTickets ?? 0}</p>
                <p className="text-xs text-muted-foreground">Open</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-success">{support?.resolvedTickets ?? 0}</p>
                <p className="text-xs text-muted-foreground">Resolved</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Resolution rate</span>
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
