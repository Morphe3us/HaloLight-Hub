import { useTranslation } from "react-i18next";
import { Link, useParams } from "wouter";
import { useCurrency } from "@/lib/currency";
import { useGetAdminClient } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Meter, StatGrid, Stat } from "@/components/page";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Award, Heart, Activity, AlertTriangle, Calendar, FileText,
  ReceiptText, LifeBuoy, MessageSquare, GraduationCap, CheckCircle2,
  Lightbulb, TrendingUp, DollarSign, Clock, Building,
  Phone, Mail, Loader2,
} from "lucide-react";

const tierConfig: Record<string, { dot: string; icon: React.ComponentType<{ className?: string }> }> = {
  champion:   { dot: "bg-foreground",  icon: Award },
  healthy:    { dot: "bg-success",     icon: Heart },
  developing: { dot: "bg-warning",     icon: Activity },
  at_risk:    { dot: "bg-destructive", icon: AlertTriangle },
};

const confidenceColors: Record<string, string> = {
  low:    "bg-muted-foreground/50",
  medium: "bg-info",
  high:   "bg-success",
};

function StatusLabel({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {children}
    </span>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground tabular-nums">{value}/{max}</span>
      </div>
      <Meter value={pct} />
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
  const { format: fmtCurrency } = useCurrency();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  type ClientData = {
    client: {
      id: string; email: string;
      firstName?: string | null; lastName?: string | null; fullName?: string | null;
      companyName?: string | null; phone?: string | null; country?: string | null;
      city?: string | null; currency?: string | null; birthday?: string | null;
      website?: string | null; instagram?: string | null; facebook?: string | null;
      pinterest?: string | null; tiktok?: string | null; linkedin?: string | null;
      businessType?: string | null; mainMarket?: string | null;
      photobooths?: number | null; businessGoal?: string | null;
      role: string; createdAt: string; updatedAt: string;
    };
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
    <div className="space-y-10">
      <div className="flex items-center gap-2">
        <Link href="/admin/clients">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 stroke-[1.75]" />
            {t("client360.back")}
          </Button>
        </Link>
        <span className="text-muted-foreground/60">/</span>
        <span className="text-[13px] text-muted-foreground">{client.fullName ?? client.email}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full border border-border bg-muted flex items-center justify-center text-base font-medium text-foreground shrink-0">
                {(client.fullName ?? client.email ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{client.fullName ?? "—"}</h1>
                {client.companyName && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Building className="w-3.5 h-3.5 stroke-[1.75]" />
                    {client.companyName}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 stroke-[1.75]" />{client.email}</span>
                  {client.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 stroke-[1.75]" />{client.phone}</span>}
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 stroke-[1.75]" />{t("client360.joined", { date: formatDate(client.createdAt) })}</span>
                </div>
                {(client.country || client.city || client.businessType || client.currency || client.website) && (
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                    {(client.city || client.country) && (
                      <span>📍 {[client.city, client.country].filter(Boolean).join(", ")}</span>
                    )}
                    {client.businessType && <span>🏢 {client.businessType}</span>}
                    {client.currency && <span>💱 {client.currency}</span>}
                    {client.website && (
                      <a href={client.website} target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline underline-offset-4">
                        🌐 {client.website.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground shrink-0">
                <span className={cn("h-1.5 w-1.5 rounded-full", tierCfg.dot)} />
                <TierIcon className="w-3.5 h-3.5 stroke-[1.75] text-muted-foreground" />
                {tierLabels[tier] ?? tier}
              </div>
            </div>
          </CardContent>
          <StatGrid className="md:grid-cols-4 rounded-none border-x-0 border-b-0 bg-transparent">
            {[
              { label: t("client360.stat_events"),   value: events?.length ?? 0,                              icon: Calendar },
              { label: t("client360.stat_quotes"),   value: quotes?.length ?? 0,                              icon: FileText },
              { label: t("client360.stat_invoices"), value: invoices?.length ?? 0,                            icon: ReceiptText },
              { label: t("client360.stat_revenue"),  value: fmtCurrency(Math.round(revenue ?? 0)), icon: DollarSign },
            ].map((s) => (
              <Stat key={s.label} label={s.label} value={s.value} />
            ))}
          </StatGrid>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>{t("client360.success_score")}</span>
              <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{score?.score ?? 0}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-3">
            <ScoreBar label={t("client360.score_login")}      value={score?.loginScore ?? 0}      max={20} />
            <ScoreBar label={t("client360.score_onboarding")} value={score?.onboardingScore ?? 0} max={20} />
            <ScoreBar label={t("client360.score_academy")}    value={score?.academyScore ?? 0}    max={15} />
            <ScoreBar label={t("client360.score_events")}     value={score?.eventsScore ?? 0}     max={15} />
            <ScoreBar label={t("client360.score_quotes")}     value={score?.quotesScore ?? 0}     max={10} />
            <ScoreBar label={t("client360.score_invoices")}   value={score?.invoicesScore ?? 0}   max={5} />
            <ScoreBar label={t("client360.score_community")}  value={score?.communityScore ?? 0}  max={10} />
            <ScoreBar label={t("client360.score_support")}    value={score?.supportScore ?? 0}    max={5} />
            {score?.computedAt && (
              <p className="text-xs text-muted-foreground text-right pt-1">{t("client360.score_updated", { date: formatDate(score.computedAt) })}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {((coaching?.length ?? 0) > 0 || (upsells?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(coaching?.length ?? 0) > 0 && (
            <section>
              <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
                {t("client360.coaching_title", { count: coaching.length })}
              </h2>
              <ul className="rounded-xl border border-border bg-card divide-y divide-border">
                {coaching.map((c) => (
                  <li key={c.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-foreground text-sm">{c.title}</p>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">P{c.priority}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{c.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(upsells?.length ?? 0) > 0 && (
            <section>
              <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
                {t("client360.upsell_title", { count: upsells.length })}
              </h2>
              <ul className="rounded-xl border border-border bg-card divide-y divide-border">
                {upsells.map((u) => (
                  <li key={u.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-foreground text-sm">{u.title}</p>
                      <div className="flex items-center gap-3 shrink-0">
                        {u.estimatedValue && (
                          <span className="text-xs text-foreground font-medium tabular-nums">${u.estimatedValue.toLocaleString()}</span>
                        )}
                        <StatusLabel dot={confidenceColors[u.confidence] ?? "bg-muted-foreground/50"}>
                          {u.confidence}
                        </StatusLabel>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{u.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
              {t("client360.onboarding_title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{onboarding?.pct ?? 0}%</span>
              <span className="text-sm text-muted-foreground">{t("client360.steps_of", { completed: onboarding?.completedSteps ?? 0, total: onboarding?.totalSteps ?? 0 })}</span>
            </div>
            <Meter value={onboarding?.pct ?? 0} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GraduationCap className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
              {t("client360.academy_title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{academy?.lessonsCompleted ?? 0}</span>
              <span className="text-sm text-muted-foreground">{t("client360.lessons_completed")}</span>
            </div>
            {(academy?.lessonsCompleted ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 stroke-[1.75] text-warning" />
                {t("client360.no_academy")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
              {t("client360.events_title", { count: events?.length ?? 0 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {(events?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">{t("client360.no_events")}</p>
            ) : (
              <div className="divide-y divide-border">
                {events.slice(0, 5).map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-foreground truncate flex-1">{e.title}</span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-2">{formatDate(e.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
              {t("client360.quotes_title", { count: quotes?.length ?? 0 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {(quotes?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">{t("client360.no_quotes")}</p>
            ) : (
              <div className="divide-y divide-border">
                {quotes.slice(0, 5).map((q) => (
                  <div key={q.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-foreground truncate flex-1">{q.title}</span>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0 ml-2">${Number(q.total ?? 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ReceiptText className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
              {t("client360.invoices_title", { count: invoices?.length ?? 0 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {(invoices?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">{t("client360.no_invoices")}</p>
            ) : (
              <div className="divide-y divide-border">
                {invoices.slice(0, 5).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-foreground truncate flex-1">{inv.title}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <StatusLabel dot={inv.status === "paid" ? "bg-success" : "bg-muted-foreground/50"}>
                        {inv.status}
                      </StatusLabel>
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
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
              {t("client360.support_title", { count: support?.length ?? 0 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {(support?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">{t("client360.no_tickets")}</p>
            ) : (
              <div className="divide-y divide-border">
                {support.slice(0, 5).map((ticket) => (
                  <div key={ticket.id} className="flex items-center gap-2 py-2">
                    <span className="text-xs font-mono text-muted-foreground">{ticket.ticketNumber}</span>
                    <span className="text-sm text-foreground truncate flex-1">{ticket.title}</span>
                    <span className="shrink-0">
                      <StatusLabel dot={ticket.status === "resolved" || ticket.status === "closed" ? "bg-success" : ticket.status === "open" ? "bg-info" : "bg-muted-foreground/50"}>
                        {ticket.status}
                      </StatusLabel>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
              {t("client360.community_title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="grid grid-cols-2 rounded-lg border border-border divide-x divide-border">
              <div className="p-3">
                <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{community?.postsCount ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("client360.posts_created")}</p>
              </div>
              <div className="p-3">
                <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{community?.repliesCount ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("client360.replies_written")}</p>
              </div>
            </div>
            {(community?.postsCount ?? 0) + (community?.repliesCount ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 stroke-[1.75] text-warning" />
                {t("client360.no_community")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
