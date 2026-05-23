import { Link, useParams } from "wouter";
import { useGetAdminClient } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, Award, Heart, Activity, AlertTriangle, Calendar, FileText,
  ReceiptText, LifeBuoy, MessageSquare, GraduationCap, CheckCircle2,
  Lightbulb, TrendingUp, DollarSign, Star, Clock, User, Building,
  Phone, Mail, Loader2,
} from "lucide-react";

const tierConfig: Record<string, { label: string; bg: string; text: string; border: string; icon: React.ComponentType<{ className?: string }>; score: string }> = {
  champion:   { label: "Champion",   bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200", icon: Award,          score: "80–100" },
  healthy:    { label: "Healthy",    bg: "bg-green-50",   text: "text-green-700",   border: "border-green-200",  icon: Heart,          score: "55–79" },
  developing: { label: "Developing", bg: "bg-yellow-50",  text: "text-yellow-700",  border: "border-yellow-200", icon: Activity,       score: "30–54" },
  at_risk:    { label: "At Risk",    bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",    icon: AlertTriangle,  score: "0–29" },
};

const confidenceColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-green-100 text-green-700",
};

function ScoreBar({ label, value, max, color = "bg-primary" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium text-gray-700">{value}/{max}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full">
        <div className={`h-2 ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Client360() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useGetAdminClient(id!);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) return null;

  type ClientData = {
    client: { id: string; email: string; fullName?: string | null; companyName?: string | null; phone?: string | null; role: string; createdAt: string; updatedAt: string };
    score: { score: number; tier: string; loginScore: number; onboardingScore: number; academyScore: number; eventsScore: number; quotesScore: number; invoicesScore: number; communityScore: number; supportScore: number; computedAt: string } | null;
    coaching: Array<{ id: string; type: string; title: string; description: string; priority: number }>;
    upsells: Array<{ id: string; type: string; title: string; description: string; confidence: string; estimatedValue?: number | null }>;
    onboarding: { completedSteps: number; totalSteps: number; pct: number };
    academy: { lessonsCompleted: number };
    events: Array<{ id: string; title: string; date: string; status: string }>;
    quotes: Array<{ id: string; quoteNumber?: string; title: string; status: string; total: string; createdAt: string }>;
    invoices: Array<{ id: string; invoiceNumber?: string; title: string; status: string; total: string; createdAt: string }>;
    revenue: number;
    support: Array<{ id: string; ticketNumber: string; title: string; status: string; priority: string; createdAt: string }>;
    community: { postsCount: number; repliesCount: number };
  };

  const { client, score, coaching, upsells, onboarding, academy, events, quotes, invoices, revenue, support, community } = data as unknown as ClientData;

  const tier = score?.tier ?? "at_risk";
  const tierCfg = tierConfig[tier] ?? tierConfig.at_risk!;
  const TierIcon = tierCfg.icon;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/clients">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Clients
          </Button>
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-sm font-medium text-gray-600">{client.fullName ?? client.email}</span>
      </div>

      {/* Profile + Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
                {(client.fullName ?? client.email ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-900">{client.fullName ?? "—"}</h1>
                {client.companyName && (
                  <p className="text-gray-500 flex items-center gap-1.5 mt-0.5">
                    <Building className="w-3.5 h-3.5" />
                    {client.companyName}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-400">
                  <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{client.email}</span>
                  {client.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{client.phone}</span>}
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Joined {formatDate(client.createdAt)}</span>
                </div>
              </div>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold ${tierCfg.bg} ${tierCfg.text} border ${tierCfg.border}`}>
                <TierIcon className="w-4 h-4" />
                {tierCfg.label}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 mt-6 pt-6 border-t">
              {[
                { label: "Events", value: events?.length ?? 0, icon: Calendar },
                { label: "Quotes", value: quotes?.length ?? 0, icon: FileText },
                { label: "Invoices", value: invoices?.length ?? 0, icon: ReceiptText },
                { label: "Revenue", value: `$${Math.round(revenue ?? 0).toLocaleString()}`, icon: DollarSign },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-400 flex items-center justify-center gap-1 mt-0.5">
                    <s.icon className="w-3 h-3" />{s.label}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Success Score */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Success Score</span>
              <span className={`text-2xl font-bold ${tierCfg.text}`}>{score?.score ?? 0}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScoreBar label="Login Activity" value={score?.loginScore ?? 0} max={20} color="bg-blue-400" />
            <ScoreBar label="Onboarding" value={score?.onboardingScore ?? 0} max={20} color="bg-purple-400" />
            <ScoreBar label="Academy" value={score?.academyScore ?? 0} max={15} color="bg-indigo-400" />
            <ScoreBar label="Events" value={score?.eventsScore ?? 0} max={15} color="bg-green-400" />
            <ScoreBar label="Quotes" value={score?.quotesScore ?? 0} max={10} color="bg-teal-400" />
            <ScoreBar label="Invoices" value={score?.invoicesScore ?? 0} max={5} color="bg-emerald-400" />
            <ScoreBar label="Community" value={score?.communityScore ?? 0} max={10} color="bg-orange-400" />
            <ScoreBar label="Support" value={score?.supportScore ?? 0} max={5} color="bg-rose-400" />
            {score?.computedAt && (
              <p className="text-xs text-gray-400 text-right pt-1">Updated {formatDate(score.computedAt)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coaching + Upsell */}
      {((coaching?.length ?? 0) > 0 || (upsells?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(coaching?.length ?? 0) > 0 && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                  <Lightbulb className="w-4 h-4" />
                  Coaching Recommendations ({coaching.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {coaching.map((c) => (
                  <div key={c.id} className="bg-white rounded-lg p-3 border border-amber-100">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-gray-900 text-sm">{c.title}</p>
                      <Badge className="text-xs bg-amber-100 text-amber-700 border-0 shrink-0">P{c.priority}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{c.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(upsells?.length ?? 0) > 0 && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-blue-800">
                  <TrendingUp className="w-4 h-4" />
                  Upsell Opportunities ({upsells.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upsells.map((u) => (
                  <div key={u.id} className="bg-white rounded-lg p-3 border border-blue-100">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-gray-900 text-sm">{u.title}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {u.estimatedValue && (
                          <span className="text-xs text-green-600 font-medium">${u.estimatedValue.toLocaleString()}</span>
                        )}
                        <Badge className={`text-xs border-0 ${confidenceColors[u.confidence] ?? ""}`}>
                          {u.confidence}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{u.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Onboarding + Academy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Onboarding Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl font-bold text-gray-900">{onboarding?.pct ?? 0}%</span>
              <span className="text-sm text-gray-400">{onboarding?.completedSteps ?? 0} of {onboarding?.totalSteps ?? 0} steps</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full">
              <div className="h-3 bg-primary rounded-full transition-all" style={{ width: `${onboarding?.pct ?? 0}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-primary" />
              Academy Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-gray-900">{academy?.lessonsCompleted ?? 0}</span>
              <span className="text-sm text-gray-400">lessons completed</span>
            </div>
            {(academy?.lessonsCompleted ?? 0) === 0 && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                No academy activity yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Events, Quotes, Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Events */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Events ({events?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(events?.length ?? 0) === 0 ? (
              <p className="text-xs text-gray-400">No events created</p>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 5).map((e) => (
                  <div key={e.id} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 truncate flex-1">{e.title}</span>
                    <span className="text-xs text-gray-400 shrink-0 ml-2">{formatDate(e.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quotes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Quotes ({quotes?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(quotes?.length ?? 0) === 0 ? (
              <p className="text-xs text-gray-400">No quotes created</p>
            ) : (
              <div className="space-y-2">
                {quotes.slice(0, 5).map((q) => (
                  <div key={q.id} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 truncate flex-1">{q.title}</span>
                    <span className="text-xs font-medium text-gray-600 shrink-0 ml-2">${Number(q.total ?? 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invoices */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-primary" />
              Invoices ({invoices?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(invoices?.length ?? 0) === 0 ? (
              <p className="text-xs text-gray-400">No invoices created</p>
            ) : (
              <div className="space-y-2">
                {invoices.slice(0, 5).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 truncate flex-1">{inv.title}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <Badge className={`text-xs px-1.5 py-0 border-0 ${inv.status === "paid" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {inv.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Support + Community */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-primary" />
              Support History ({support?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(support?.length ?? 0) === 0 ? (
              <p className="text-xs text-gray-400">No support tickets</p>
            ) : (
              <div className="space-y-2">
                {support.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400">{t.ticketNumber}</span>
                    <span className="text-sm text-gray-700 truncate flex-1">{t.title}</span>
                    <Badge className={`text-xs px-1.5 py-0 border-0 shrink-0 ${t.status === "resolved" || t.status === "closed" ? "bg-green-100 text-green-700" : t.status === "open" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                      {t.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Community Participation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-gray-900">{community?.postsCount ?? 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">Posts created</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-gray-900">{community?.repliesCount ?? 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">Replies written</p>
              </div>
            </div>
            {(community?.postsCount ?? 0) + (community?.repliesCount ?? 0) === 0 && (
              <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                No community participation
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
