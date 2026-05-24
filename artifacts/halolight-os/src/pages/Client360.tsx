import { useTranslation } from "react-i18next";
import { Link, useParams } from "wouter";
import { useGetAdminClient } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, Award, Heart, Activity, AlertTriangle, Calendar, FileText,
  ReceiptText, LifeBuoy, MessageSquare, GraduationCap, CheckCircle2,
  Lightbulb, TrendingUp, DollarSign, Clock, Building,
  Phone, Mail, Loader2,
} from "lucide-react";

const tierConfig: Record<string, { bg: string; text: string; border: string; icon: React.ComponentType<{ className?: string }> }> = {
  champion:   { bg: "bg-muted",          text: "text-foreground",  border: "border-border",          icon: Award },
  healthy:    { bg: "bg-success/10",     text: "text-success",     border: "border-green-200",       icon: Heart },
  developing: { bg: "bg-warning/10",     text: "text-yellow-700",  border: "border-yellow-200",      icon: Activity },
  at_risk:    { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30",  icon: AlertTriangle },
};

const confidenceColors: Record<string, string> = {
  low:    "bg-muted text-muted-foreground",
  medium: "bg-info/15 text-info",
  high:   "bg-success/15 text-success",
};

function ScoreBar({ label, value, max, color = "bg-primary" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value}/{max}</span>
      </div>
      <div className="h-2 bg-muted rounded-full">
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
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useGetAdminClient(id!);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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

  const tierLabels: Record<string, string> = {
    champion:   t("admin_clients.tier_champion"),
    healthy:    t("admin_clients.tier_healthy"),
    developing: t("admin_clients.tier_developing"),
    at_risk:    t("admin_clients.tier_at_risk"),
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/clients">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t("client360.back")}
          </Button>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium text-muted-foreground">{client.fullName ?? client.email}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
                {(client.fullName ?? client.email ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-foreground">{client.fullName ?? "—"}</h1>
                {client.companyName && (
                  <p className="text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Building className="w-3.5 h-3.5" />
                    {client.companyName}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{client.email}</span>
                  {client.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{client.phone}</span>}
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{t("client360.joined", { date: formatDate(client.createdAt) })}</span>
                </div>
              </div>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold ${tierCfg.bg} ${tierCfg.text} border ${tierCfg.border}`}>
                <TierIcon className="w-4 h-4" />
                {tierLabels[tier] ?? tier}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 mt-6 pt-6 border-t">
              {[
                { label: t("client360.stat_events"),   value: events?.length ?? 0,                              icon: Calendar },
                { label: t("client360.stat_quotes"),   value: quotes?.length ?? 0,                              icon: FileText },
                { label: t("client360.stat_invoices"), value: invoices?.length ?? 0,                            icon: ReceiptText },
                { label: t("client360.stat_revenue"),  value: `$${Math.round(revenue ?? 0).toLocaleString()}`, icon: DollarSign },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                    <s.icon className="w-3 h-3" />{s.label}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>{t("client360.success_score")}</span>
              <span className={`text-2xl font-bold ${tierCfg.text}`}>{score?.score ?? 0}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScoreBar label={t("client360.score_login")}      value={score?.loginScore ?? 0}      max={20} color="bg-info" />
            <ScoreBar label={t("client360.score_onboarding")} value={score?.onboardingScore ?? 0} max={20} color="bg-accent" />
            <ScoreBar label={t("client360.score_academy")}    value={score?.academyScore ?? 0}    max={15} color="bg-info" />
            <ScoreBar label={t("client360.score_events")}     value={score?.eventsScore ?? 0}     max={15} color="bg-success" />
            <ScoreBar label={t("client360.score_quotes")}     value={score?.quotesScore ?? 0}     max={10} color="bg-teal-400" />
            <ScoreBar label={t("client360.score_invoices")}   value={score?.invoicesScore ?? 0}   max={5}  color="bg-success" />
            <ScoreBar label={t("client360.score_community")}  value={score?.communityScore ?? 0}  max={10} color="bg-warning" />
            <ScoreBar label={t("client360.score_support")}    value={score?.supportScore ?? 0}    max={5}  color="bg-rose-400" />
            {score?.computedAt && (
              <p className="text-xs text-muted-foreground text-right pt-1">{t("client360.score_updated", { date: formatDate(score.computedAt) })}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {((coaching?.length ?? 0) > 0 || (upsells?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(coaching?.length ?? 0) > 0 && (
            <Card className="border-warning/20 bg-warning/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-warning">
                  <Lightbulb className="w-4 h-4" />
                  {t("client360.coaching_title", { count: coaching.length })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {coaching.map((c) => (
                  <div key={c.id} className="bg-card rounded-lg p-3 border border-amber-100">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-foreground text-sm">{c.title}</p>
                      <Badge className="text-xs bg-warning/15 text-warning border-0 shrink-0">P{c.priority}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{c.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(upsells?.length ?? 0) > 0 && (
            <Card className="border-info/30 bg-info/10/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-info">
                  <TrendingUp className="w-4 h-4" />
                  {t("client360.upsell_title", { count: upsells.length })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upsells.map((u) => (
                  <div key={u.id} className="bg-card rounded-lg p-3 border border-blue-100">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-foreground text-sm">{u.title}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {u.estimatedValue && (
                          <span className="text-xs text-success font-medium">${u.estimatedValue.toLocaleString()}</span>
                        )}
                        <Badge className={`text-xs border-0 ${confidenceColors[u.confidence] ?? ""}`}>
                          {u.confidence}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{u.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              {t("client360.onboarding_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl font-bold text-foreground">{onboarding?.pct ?? 0}%</span>
              <span className="text-sm text-muted-foreground">{t("client360.steps_of", { completed: onboarding?.completedSteps ?? 0, total: onboarding?.totalSteps ?? 0 })}</span>
            </div>
            <div className="h-3 bg-muted rounded-full">
              <div className="h-3 bg-primary rounded-full transition-all" style={{ width: `${onboarding?.pct ?? 0}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-primary" />
              {t("client360.academy_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-foreground">{academy?.lessonsCompleted ?? 0}</span>
              <span className="text-sm text-muted-foreground">{t("client360.lessons_completed")}</span>
            </div>
            {(academy?.lessonsCompleted ?? 0) === 0 && (
              <p className="text-xs text-warning mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t("client360.no_academy")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              {t("client360.events_title", { count: events?.length ?? 0 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(events?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">{t("client360.no_events")}</p>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 5).map((e) => (
                  <div key={e.id} className="flex items-center justify-between">
                    <span className="text-sm text-foreground truncate flex-1">{e.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{formatDate(e.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              {t("client360.quotes_title", { count: quotes?.length ?? 0 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(quotes?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">{t("client360.no_quotes")}</p>
            ) : (
              <div className="space-y-2">
                {quotes.slice(0, 5).map((q) => (
                  <div key={q.id} className="flex items-center justify-between">
                    <span className="text-sm text-foreground truncate flex-1">{q.title}</span>
                    <span className="text-xs font-medium text-muted-foreground shrink-0 ml-2">${Number(q.total ?? 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-primary" />
              {t("client360.invoices_title", { count: invoices?.length ?? 0 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(invoices?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">{t("client360.no_invoices")}</p>
            ) : (
              <div className="space-y-2">
                {invoices.slice(0, 5).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between">
                    <span className="text-sm text-foreground truncate flex-1">{inv.title}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <Badge className={`text-xs px-1.5 py-0 border-0 ${inv.status === "paid" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-primary" />
              {t("client360.support_title", { count: support?.length ?? 0 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(support?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">{t("client360.no_tickets")}</p>
            ) : (
              <div className="space-y-2">
                {support.slice(0, 5).map((ticket) => (
                  <div key={ticket.id} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{ticket.ticketNumber}</span>
                    <span className="text-sm text-foreground truncate flex-1">{ticket.title}</span>
                    <Badge className={`text-xs px-1.5 py-0 border-0 shrink-0 ${ticket.status === "resolved" || ticket.status === "closed" ? "bg-success/15 text-success" : ticket.status === "open" ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"}`}>
                      {ticket.status}
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
              {t("client360.community_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-2xl font-bold text-foreground">{community?.postsCount ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("client360.posts_created")}</p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-2xl font-bold text-foreground">{community?.repliesCount ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("client360.replies_written")}</p>
              </div>
            </div>
            {(community?.postsCount ?? 0) + (community?.repliesCount ?? 0) === 0 && (
              <p className="text-xs text-warning mt-3 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t("client360.no_community")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
