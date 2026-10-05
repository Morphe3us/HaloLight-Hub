import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConsentForm } from "@/components/ConsentGate";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { consentKey, dashboardPreferencesKey, DEFAULT_DASHBOARD_WIDGETS, getConsent, getDashboardPreferences, saveDashboardPreference } from "@/lib/userCompliance";
import {
  useGetCurrentUser,
  useListNotifications,
  useGetDashboardSummary,
  useListEvents,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  ArrowRight, Play, Clock, MapPin, Settings2, ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { EmptyState, Meter, PageHeader, Section, Stat, StatGrid } from "@/components/page";
const THUMB_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='450' viewBox='0 0 800 450'%3E%3Crect width='800' height='450' fill='%23DDB398' opacity='0.25'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%23DDB398'%3E%E2%96%B6%3C/text%3E%3C/svg%3E";

const DEFAULT_WIDGETS = DEFAULT_DASHBOARD_WIDGETS;
type WidgetKey = keyof typeof DEFAULT_WIDGETS;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const WIDGET_LABELS: Record<WidgetKey, string> = {
  next_lesson: "dashboard.widget_next_lesson",
  onboarding: "dashboard.widget_onboarding",
  notifications: "dashboard.widget_notifications",
  upcoming_events: "dashboard.widget_upcoming_events",
  academy_stats: "dashboard.widget_academy_stats",
  sales_overview: "dashboard.widget_sales_overview",
};

export default function Dashboard() {
  const { t } = useTranslation();
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t("dashboard.greeting_morning")
      : hour < 18
      ? t("dashboard.greeting_afternoon")
      : t("dashboard.greeting_evening");

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const { data: user, isLoading: loadingUser } = useGetCurrentUser();
  const client = useQueryClient();
  const preferences = useQuery({
    queryKey: dashboardPreferencesKey(user?.id ?? ""),
    queryFn: ({ signal }) => getDashboardPreferences(signal), enabled: !!user,
    staleTime: 0, refetchOnWindowFocus: true,
  });
  const widgets = preferences.data ?? DEFAULT_WIDGETS;
  const savePreference = useMutation({
    mutationFn: ({ key, enabled }: { key: WidgetKey; enabled: boolean }) => saveDashboardPreference(key, enabled),
    onSuccess: (saved) => client.setQueryData(dashboardPreferencesKey(user!.id), saved),
  });
  const consent = useQuery({
    queryKey: consentKey(user?.id ?? ""), queryFn: ({ signal }) => getConsent(signal),
    enabled: privacyOpen && !!user, staleTime: 0,
  });
  const { i18n } = useTranslation();
  const dashLang = i18n.language?.split("-")[0] ?? "en";
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    lang: dashLang,
  });
  const { data: notifications, isLoading: loadingNotifs } = useListNotifications({ limit: 3 });
  const { data: eventsData, isLoading: loadingEvents } = useListEvents({ status: "upcoming", limit: 4 });

  const isLoading = loadingUser || loadingSummary || (!!user && preferences.isPending);

  const toggleWidget = (key: WidgetKey) => {
    if (!preferences.data || savePreference.isPending) return;
    savePreference.mutate({ key, enabled: !widgets[key] });
  };

  if (isLoading) {
    return (
      <div className="space-y-10">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-72" />
        </div>
        <Skeleton className="h-[124px] rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-48 col-span-2 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  const firstName = user?.fullName?.split(" ")[0] || "Partner";

  const equipmentAlerts = (summary as Record<string, unknown> | undefined)?.equipmentAlerts as number ?? 0;
  const lowStockCount = (summary as Record<string, unknown> | undefined)?.lowStockCount as number ?? 0;
  const openTicketsCount = (summary as Record<string, unknown> | undefined)?.openTicketsCount as number ?? 0;

  const leadsTotal = summary?.leadsCount ?? 0;
  const quotesTotal = summary?.quotesCount ?? 0;
  const contractsTotal = summary?.contractsCount ?? 0;
  const invoicesTotal = summary?.invoicesCount ?? 0;

  const pipeline = [
    { key: "leads", label: t("nav.leads"), value: leadsTotal, href: "/crm/leads" },
    { key: "quotes", label: t("nav.quotes"), value: quotesTotal, href: "/quotes" },
    { key: "contracts", label: t("nav.contracts"), value: contractsTotal, href: "/contracts" },
    { key: "invoices", label: t("nav.invoices"), value: invoicesTotal, href: "/invoices" },
  ];
  const academyPercent = summary && summary.academyTotalLessons > 0
    ? Math.round((summary.academyLessonsCompleted / summary.academyTotalLessons) * 100)
    : 0;

  const attention = [
    equipmentAlerts > 0 && { key: "equipment", count: equipmentAlerts, label: t("dashboard.kpi_equipment_alerts"), href: "/equipment" },
    lowStockCount > 0 && { key: "stock", count: lowStockCount, label: t("dashboard.kpi_low_stock"), href: "/consumables" },
  ].filter(Boolean) as { key: string; count: number; label: string; href: string }[];
  const widgetKeys = (Object.keys(widgets) as WidgetKey[]).filter((key) => key !== "academy_stats");

  return (
    <div className="space-y-10" data-testid="page-dashboard">
      <PageHeader
        eyebrow={new Intl.DateTimeFormat(dashLang, { weekday: "long", day: "numeric", month: "long" }).format(new Date())}
        title={<>{greeting}, {firstName}</>}
        actions={
          <Sheet open={customizeOpen} onOpenChange={setCustomizeOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 shrink-0 text-muted-foreground hover:text-foreground">
                <Settings2 className="w-4 h-4 stroke-[1.75]" />
                {t("dashboard.customize", { defaultValue: "Customize" })}
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{t("dashboard.customize_title", { defaultValue: "Customize Dashboard" })}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                <p className="text-sm text-muted-foreground">{t("dashboard.customize_desc", { defaultValue: "Show or hide widgets to personalise your dashboard." })}</p>
                {(preferences.isError || savePreference.isError) && <div role="alert" className="text-sm text-destructive space-y-2">
                  <p>{t("dashboard.preferences_error", { defaultValue: "Dashboard preferences could not be loaded or saved. Your previous choices have been kept." })}</p>
                  <Button variant="outline" onClick={() => { savePreference.reset(); void preferences.refetch(); }}>{t("common.retry")}</Button>
                </div>}
                {savePreference.isPending && <p role="status" className="text-sm">{t("common.loading")}</p>}
                {widgetKeys.map((key) => (
                  <div key={key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <Label htmlFor={`widget-${key}`} className="text-sm font-medium cursor-pointer">
                      {t(WIDGET_LABELS[key], { defaultValue: key.replace(/_/g, " ") })}
                    </Label>
                    <Switch
                      id={`widget-${key}`}
                      checked={widgets[key]}
                      disabled={!preferences.data || preferences.isError || savePreference.isPending}
                      onCheckedChange={() => toggleWidget(key)}
                    />
                  </div>
                ))}
                <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
                      <ShieldCheck className="w-4 h-4 stroke-[1.75]" />
                      {t("consent.manage", { defaultValue: "Privacy choices" })}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90dvh] overflow-y-auto">
                    <DialogHeader><DialogTitle>{t("consent.title", { defaultValue: "Terms and privacy" })}</DialogTitle></DialogHeader>
                    {consent.isError ? <div role="alert"><p>{t("common.error")}</p><Button onClick={() => void consent.refetch()}>{t("common.retry")}</Button></div> :
                      consent.data ? <ConsentForm key={JSON.stringify(consent.data.documents)} status={consent.data} userId={user!.id} onSaved={() => setPrivacyOpen(false)} /> : <p>{t("common.loading")}</p>}
                  </DialogContent>
                </Dialog>
              </div>
            </SheetContent>
          </Sheet>
        }
      />

      {/* Account setup — compact banner while incomplete */}
      {widgets.onboarding && summary && summary.onboardingPercent < 100 && (
        <Link href="/onboarding" className="group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 rounded-xl border border-border bg-card px-5 py-4 hover:bg-muted/40 transition-colors">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t("dashboard.onboarding_card")}</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">{t("dashboard.onboarding_desc")}</p>
          </div>
          <div className="flex items-center gap-3 sm:w-64 shrink-0">
            <Meter value={summary.onboardingPercent} className="flex-1" />
            <span className="text-sm font-medium tabular-nums text-foreground">{summary.onboardingPercent}%</span>
            <ArrowRight className="w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      )}

      {/* Key figures */}
      {summary && (
        <StatGrid className="grid-cols-1 sm:grid-cols-3 md:grid-cols-3">
          <Stat label={t("dashboard.kpi_events")} value={summary.upcomingEventsCount} href="/events" />
          <Stat label={t("dashboard.kpi_lessons")} value={summary.academyLessonsCompleted} suffix={`/ ${summary.academyTotalLessons}`} href="/academy" progress={academyPercent} />
          <Stat label={t("dashboard.kpi_open_tickets")} value={openTicketsCount} href="/support" tone={openTicketsCount > 0 ? "info" : undefined} />
        </StatGrid>
      )}

      {/* Only surfaced when something needs attention */}
      {attention.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attention.map((item) => (
            <Link key={item.key} href={item.href} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/50 transition-colors">
              <span className={cn("h-1.5 w-1.5 rounded-full", item.key === "stock" ? "bg-destructive" : "bg-warning")} />
              <span className="tabular-nums font-medium">{item.count}</span>
              <span className="text-muted-foreground">{item.label}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-10">
        <div className="lg:col-span-2 space-y-10">
          {/* Next lesson */}
          {widgets.next_lesson && (
            <Section title={t("dashboard.next_lesson")} href="/academy" linkLabel={t("academy.all_courses")}>
              {summary?.nextLesson ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-5 rounded-xl border border-border bg-card p-4">
                  <div className="aspect-video w-full sm:w-40 rounded-lg overflow-hidden bg-muted shrink-0">
                    <img
                      src={summary.nextLesson.courseThumbnailUrl || THUMB_FALLBACK}
                      alt={summary.nextLesson.courseTitle}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = THUMB_FALLBACK; }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-muted-foreground truncate">{summary.nextLesson.courseTitle}</p>
                    <h3 className="text-base font-medium text-foreground leading-snug truncate mt-0.5">
                      {summary.nextLesson.lessonTitle}
                    </h3>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 stroke-[1.75]" />
                        {formatDuration(summary.nextLesson.durationSeconds)}
                      </span>
                      {summary.nextLesson.watchPercent > 0 && (
                        <span className="tabular-nums">{summary.nextLesson.watchPercent}% {t("dashboard.watched")}</span>
                      )}
                    </div>
                    {summary.nextLesson.watchPercent > 0 && (
                      <Meter value={summary.nextLesson.watchPercent} className="mt-3" />
                    )}
                  </div>
                  <Button asChild size="sm" className="shrink-0 gap-1.5 self-start sm:self-center">
                    <Link href={`/academy/${summary.nextLesson.courseId}/${summary.nextLesson.lessonId}`}>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      {summary.nextLesson.watchPercent > 0 ? t("dashboard.resume") : t("dashboard.start")}
                    </Link>
                  </Button>
                </div>
              ) : (
                <EmptyState text={t("dashboard.no_lessons")}>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/academy">{t("academy.all_courses")} <ArrowRight className="w-3.5 h-3.5" /></Link>
                  </Button>
                </EmptyState>
              )}
            </Section>
          )}

          {/* Sales pipeline — one quiet row */}
          {widgets.sales_overview && (
            <Section title={t("dashboard.sales_overview", { defaultValue: "Sales Pipeline" })} href="/crm/leads" linkLabel={t("dashboard.view_all")}>
              <div className="grid grid-cols-2 sm:grid-cols-4 rounded-xl border border-border bg-card overflow-hidden">
                {pipeline.map((stage) => (
                  <Link key={stage.key} href={stage.href} className="px-5 py-4 shadow-[1px_1px_0_0_hsl(var(--border))] hover:bg-muted/50 transition-colors">
                    <p className="text-[13px] text-muted-foreground">{stage.label}</p>
                    <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums text-foreground">{stage.value}</p>
                  </Link>
                ))}
              </div>
            </Section>
          )}

        </div>

        <div className="space-y-10">
          {/* Upcoming events */}
          {widgets.upcoming_events && (
            <Section title={t("dashboard.upcoming_events")} href="/events" linkLabel={t("dashboard.view_all")}>
              {loadingEvents ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
              ) : eventsData?.items.length === 0 ? (
                <EmptyState text={t("dashboard.no_events")} className="py-8">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/events">{t("dashboard.add_event")}</Link>
                  </Button>
                </EmptyState>
              ) : (
                <ul className="rounded-xl border border-border bg-card divide-y divide-border">
                  {eventsData?.items.map((ev) => (
                    <li key={ev.id} className="flex gap-3 items-center px-4 py-3">
                      <div className="w-10 text-center shrink-0">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase leading-none">
                          {format(parseISO(ev.eventDate), "MMM")}
                        </p>
                        <p className="text-lg font-semibold text-foreground leading-tight tabular-nums">
                          {format(parseISO(ev.eventDate), "d")}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{ev.title}</p>
                        {ev.location && (
                          <p className="text-[13px] text-muted-foreground flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 stroke-[1.75] shrink-0" /> {ev.location}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {/* Recent notifications — only when there is something to read */}
          {widgets.notifications && !loadingNotifs && (notifications?.items.length ?? 0) > 0 && (
            <Section title={t("dashboard.recent_notifications")} href="/notifications" linkLabel={t("dashboard.view_all")}>
              <ul className="rounded-xl border border-border bg-card divide-y divide-border">
                {notifications?.items.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                    <span className={cn("h-1.5 w-1.5 rounded-full mt-2 shrink-0", n.isRead ? "bg-transparent" : "bg-foreground")} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm truncate", n.isRead ? "text-muted-foreground" : "text-foreground font-medium")}>{n.title}</p>
                      <p className="text-[13px] text-muted-foreground truncate">{n.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
