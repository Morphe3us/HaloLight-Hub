import { useTranslation } from "react-i18next";
import { useState } from "react";
import {
  useGetCurrentUser,
  useListNotifications,
  useGetDashboardSummary,
  useListEvents,
  useListLeads,
  useListQuotes,
  useListContracts,
  useListInvoices,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Bell, ArrowRight, Trophy, PlayCircle, Calendar, BookOpen, Clock,
  MapPin, GraduationCap, Monitor, Package, LifeBuoy, CheckCircle2,
  Settings2, Users, FileText, FilePen, ReceiptText,
} from "lucide-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const THUMB_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='450' viewBox='0 0 800 450'%3E%3Crect width='800' height='450' fill='%23DDB398' opacity='0.25'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%23DDB398'%3E%E2%96%B6%3C/text%3E%3C/svg%3E";

const DEFAULT_WIDGETS = {
  next_lesson: true,
  onboarding: true,
  notifications: true,
  upcoming_events: true,
  academy_stats: true,
  sales_overview: true,
};
type WidgetKey = keyof typeof DEFAULT_WIDGETS;

function loadWidgetConfig() {
  try {
    const saved = localStorage.getItem("dashboard-widgets");
    return saved ? { ...DEFAULT_WIDGETS, ...JSON.parse(saved) } : { ...DEFAULT_WIDGETS };
  } catch {
    return { ...DEFAULT_WIDGETS };
  }
}

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

  const [widgets, setWidgets] = useState<Record<WidgetKey, boolean>>(loadWidgetConfig);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const { data: user, isLoading: loadingUser } = useGetCurrentUser();
  const { i18n } = useTranslation();
  const dashLang = i18n.language?.split("-")[0] ?? "en";
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: { queryKey: ["/api/dashboard/summary", dashLang] },
  });
  const { data: notifications, isLoading: loadingNotifs } = useListNotifications({ limit: 3 });
  const { data: eventsData, isLoading: loadingEvents } = useListEvents({ status: "upcoming", limit: 4 });

  const { data: leadsData } = useListLeads({ limit: 1 });
  const { data: quotesData } = useListQuotes({ limit: 1 });
  const { data: contractsData } = useListContracts({ limit: 1 });
  const { data: invoicesData } = useListInvoices({ limit: 1 });

  const isLoading = loadingUser || loadingSummary;

  const toggleWidget = (key: WidgetKey) => {
    setWidgets((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("dashboard-widgets", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
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

  const leadsTotal = (leadsData as { total?: number } | undefined)?.total ?? 0;
  const quotesTotal = (quotesData as { total?: number } | undefined)?.total ?? 0;
  const contractsTotal = (contractsData as { total?: number } | undefined)?.total ?? 0;
  const invoicesTotal = (invoicesData as { total?: number } | undefined)?.total ?? 0;

  const salesChartData = [
    { name: t("nav.leads"), value: leadsTotal, fill: "#4B96FF" },
    { name: t("nav.quotes"), value: quotesTotal, fill: "#F59E0B" },
    { name: t("nav.contracts"), value: contractsTotal, fill: "#22C55E" },
    { name: t("nav.invoices"), value: invoicesTotal, fill: "#DDB398" },
  ];

  return (
    <div className="space-y-8" data-testid="page-dashboard">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {greeting}, {firstName}
          </h1>
          <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
        </div>
        <Sheet open={customizeOpen} onOpenChange={setCustomizeOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 shrink-0">
              <Settings2 className="w-4 h-4" />
              {t("dashboard.customize", { defaultValue: "Customize" })}
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{t("dashboard.customize_title", { defaultValue: "Customize Dashboard" })}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <p className="text-sm text-muted-foreground">{t("dashboard.customize_desc", { defaultValue: "Show or hide widgets to personalise your dashboard." })}</p>
              {(Object.keys(widgets) as WidgetKey[]).map((key) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <Label htmlFor={`widget-${key}`} className="text-sm font-medium cursor-pointer">
                    {t(WIDGET_LABELS[key], { defaultValue: key.replace(/_/g, " ") })}
                  </Label>
                  <Switch
                    id={`widget-${key}`}
                    checked={widgets[key]}
                    onCheckedChange={() => toggleWidget(key)}
                  />
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm bg-success/8">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-lg bg-success flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-medium text-success uppercase tracking-wide leading-tight">
                  {t("dashboard.kpi_lessons")}
                </span>
              </div>
              <p className="text-3xl font-bold text-foreground">
                {summary.academyLessonsCompleted}
                <span className="text-base font-normal text-muted-foreground ml-1">/ {summary.academyTotalLessons}</span>
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-primary/8">
            <Link href="/onboarding">
              <CardContent className="p-5 cursor-pointer">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", summary.onboardingPercent >= 100 ? "bg-success" : "bg-primary")}>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs font-medium text-primary uppercase tracking-wide leading-tight">
                    {t("dashboard.kpi_onboarding")}
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">{summary.onboardingPercent}%</p>
              </CardContent>
            </Link>
          </Card>

          <Link href="/notifications">
            <Card className="border-0 shadow-sm bg-info/8">
              <CardContent className="p-5 cursor-pointer">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", summary.unreadNotifications > 0 ? "bg-info" : "bg-muted")}>
                    <Bell className={cn("w-4 h-4", summary.unreadNotifications > 0 ? "text-white" : "text-muted-foreground")} />
                  </div>
                  <span className={cn("text-xs font-medium uppercase tracking-wide leading-tight", summary.unreadNotifications > 0 ? "text-info" : "text-muted-foreground")}>
                    {t("dashboard.kpi_notifications")}
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">{summary.unreadNotifications}</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/events">
            <Card className="border-0 shadow-sm bg-accent/8">
              <CardContent className="p-5 cursor-pointer">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", summary.upcomingEventsCount > 0 ? "bg-accent" : "bg-muted")}>
                    <Calendar className={cn("w-4 h-4", summary.upcomingEventsCount > 0 ? "text-foreground" : "text-muted-foreground")} />
                  </div>
                  <span className={cn("text-xs font-medium uppercase tracking-wide leading-tight", summary.upcomingEventsCount > 0 ? "text-foreground" : "text-muted-foreground")}>
                    {t("dashboard.kpi_events")}
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">{summary.upcomingEventsCount}</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/equipment">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5 cursor-pointer">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", equipmentAlerts > 0 ? "bg-warning" : "bg-muted")}>
                    <Monitor className={cn("w-4 h-4", equipmentAlerts > 0 ? "text-foreground" : "text-muted-foreground")} />
                  </div>
                  <span className={cn("text-xs font-medium uppercase tracking-wide leading-tight", equipmentAlerts > 0 ? "text-warning" : "text-muted-foreground")}>
                    {t("dashboard.kpi_equipment_alerts")}
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">{equipmentAlerts}</p>
                {equipmentAlerts === 0 && <p className="text-xs text-success mt-0.5">{t("dashboard.equipment_ok")}</p>}
              </CardContent>
            </Card>
          </Link>

          <Link href="/consumables">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5 cursor-pointer">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", lowStockCount > 0 ? "bg-destructive" : "bg-muted")}>
                    <Package className={cn("w-4 h-4", lowStockCount > 0 ? "text-white" : "text-muted-foreground")} />
                  </div>
                  <span className={cn("text-xs font-medium uppercase tracking-wide leading-tight", lowStockCount > 0 ? "text-destructive" : "text-muted-foreground")}>
                    {t("dashboard.kpi_low_stock")}
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">{lowStockCount}</p>
                {lowStockCount === 0 && <p className="text-xs text-success mt-0.5">{t("dashboard.stock_ok")}</p>}
              </CardContent>
            </Card>
          </Link>

          {openTicketsCount > 0 && (
            <Link href="/support/tickets">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5 cursor-pointer">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", openTicketsCount > 0 ? "bg-info" : "bg-muted")}>
                      <LifeBuoy className={cn("w-4 h-4", openTicketsCount > 0 ? "text-white" : "text-muted-foreground")} />
                    </div>
                    <span className={cn("text-xs font-medium uppercase tracking-wide leading-tight", openTicketsCount > 0 ? "text-info" : "text-muted-foreground")}>
                      {t("dashboard.kpi_open_tickets")}
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-foreground">{openTicketsCount}</p>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      {/* Sales Overview */}
      {widgets.sales_overview && (
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("dashboard.sales_overview", { defaultValue: "Sales Pipeline" })}</CardTitle>
            <Link href="/crm/leads">
              <button className="text-xs text-primary hover:underline font-medium">{t("dashboard.view_all")}</button>
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-4 gap-3 mb-4">
              <Link href="/crm/leads">
                <div className="text-center p-3 rounded-lg bg-info/8 hover:bg-info/15 transition-colors cursor-pointer">
                  <Users className="w-5 h-5 text-info mx-auto mb-1" />
                  <p className="text-2xl font-bold text-foreground">{leadsTotal}</p>
                  <p className="text-xs text-muted-foreground">{t("nav.leads")}</p>
                </div>
              </Link>
              <Link href="/quotes">
                <div className="text-center p-3 rounded-lg bg-warning/8 hover:bg-warning/15 transition-colors cursor-pointer">
                  <FileText className="w-5 h-5 text-warning mx-auto mb-1" />
                  <p className="text-2xl font-bold text-foreground">{quotesTotal}</p>
                  <p className="text-xs text-muted-foreground">{t("nav.quotes")}</p>
                </div>
              </Link>
              <Link href="/contracts">
                <div className="text-center p-3 rounded-lg bg-success/8 hover:bg-success/15 transition-colors cursor-pointer">
                  <FilePen className="w-5 h-5 text-success mx-auto mb-1" />
                  <p className="text-2xl font-bold text-foreground">{contractsTotal}</p>
                  <p className="text-xs text-muted-foreground">{t("nav.contracts")}</p>
                </div>
              </Link>
              <Link href="/invoices">
                <div className="text-center p-3 rounded-lg bg-accent/8 hover:bg-accent/15 transition-colors cursor-pointer">
                  <ReceiptText className="w-5 h-5 text-accent-foreground mx-auto mb-1" />
                  <p className="text-2xl font-bold text-foreground">{invoicesTotal}</p>
                  <p className="text-xs text-muted-foreground">{t("nav.invoices")}</p>
                </div>
              </Link>
            </div>
            {(leadsTotal + quotesTotal + contractsTotal + invoicesTotal) > 0 && (
              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }}
                      cursor={{ fill: "hsl(var(--muted))" }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {salesChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Next Lesson */}
          {widgets.next_lesson && (
            summary?.nextLesson ? (
              <Card className="border border-primary/10 bg-gradient-to-br from-primary/5 via-card to-card shadow-sm overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 rounded-xl overflow-hidden flex-shrink-0 shadow-sm bg-muted">
                      <img
                        src={summary.nextLesson.courseThumbnailUrl || THUMB_FALLBACK}
                        alt={summary.nextLesson.courseTitle}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = THUMB_FALLBACK; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-primary uppercase tracking-wide mb-0.5">
                        {t("dashboard.next_lesson")}
                      </p>
                      <h3 className="font-semibold text-foreground text-lg leading-snug truncate">
                        {summary.nextLesson.lessonTitle}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate">{summary.nextLesson.courseTitle}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDuration(summary.nextLesson.durationSeconds)}
                        </span>
                        {summary.nextLesson.watchPercent > 0 && (
                          <span className="text-xs text-primary font-medium">
                            {summary.nextLesson.watchPercent}% {t("dashboard.watched")}
                          </span>
                        )}
                      </div>
                      {summary.nextLesson.watchPercent > 0 && (
                        <Progress value={summary.nextLesson.watchPercent} className="h-1.5 mt-2" />
                      )}
                    </div>
                    <Link href={`/academy/${summary.nextLesson.courseId}/${summary.nextLesson.lessonId}`}>
                      <Button size="sm" className="shrink-0 shadow-sm gap-1.5">
                        <PlayCircle className="w-4 h-4" />
                        {summary.nextLesson.watchPercent > 0 ? t("dashboard.resume") : t("dashboard.start")}
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border border-dashed border-border shadow-sm">
                <CardContent className="p-6 text-center">
                  <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">{t("dashboard.no_lessons")}</p>
                  <Link href="/academy">
                    <Button variant="outline" size="sm" className="mt-3">
                      {t("academy.all_courses")} <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )
          )}

          {/* Onboarding progress */}
          {widgets.onboarding && summary && summary.onboardingPercent < 100 && (
            <Card className="border border-warning/20 bg-warning/5 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-warning" />
                    {t("dashboard.onboarding_card")}
                  </CardTitle>
                  <span className="text-sm font-semibold text-warning">{summary.onboardingPercent}%</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Progress value={summary.onboardingPercent} className="h-2 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">{t("dashboard.onboarding_desc")}</p>
                <Link href="/onboarding">
                  <Button size="sm" variant="outline" className="border-warning/40 text-warning hover:bg-warning/10">
                    {t("dashboard.continue_setup")} <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Onboarding complete celebration */}
          {widgets.onboarding && summary && summary.onboardingPercent >= 100 && (
            <Card className="border border-success/20 bg-success/5 shadow-sm">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-success/15 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{t("onboarding.congratulations")}</p>
                  <p className="text-sm text-muted-foreground">{t("onboarding.congratulations_desc")}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Notifications */}
          {widgets.notifications && (
            <Card className="border border-border shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t("dashboard.recent_notifications")}</CardTitle>
                <Link href="/notifications">
                  <button className="text-xs text-primary hover:underline font-medium">{t("dashboard.view_all")}</button>
                </Link>
              </CardHeader>
              <CardContent className="pt-0">
                {loadingNotifs ? (
                  <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                ) : notifications?.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">{t("dashboard.no_notifications")}</p>
                ) : (
                  <div className="space-y-2">
                    {notifications?.items.map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg transition-colors",
                          !n.isRead ? "bg-primary/5" : "hover:bg-muted"
                        )}
                      >
                        {!n.isRead && <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />}
                        <div className={cn("flex-1 min-w-0", n.isRead && "pl-5")}>
                          <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{n.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right — 1/3 */}
        <div className="space-y-6">
          {/* Upcoming Events */}
          {widgets.upcoming_events && (
            <Card className="border border-border shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t("dashboard.upcoming_events")}</CardTitle>
                <Link href="/events">
                  <button className="text-xs text-primary hover:underline font-medium">{t("dashboard.view_all")}</button>
                </Link>
              </CardHeader>
              <CardContent className="pt-0">
                {loadingEvents ? (
                  <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
                ) : eventsData?.items.length === 0 ? (
                  <div className="text-center py-6">
                    <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">{t("dashboard.no_events")}</p>
                    <Link href="/events">
                      <Button variant="outline" size="sm">{t("dashboard.add_event")}</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {eventsData?.items.map((ev) => (
                      <div key={ev.id} className="flex gap-3 items-start p-2 rounded-lg hover:bg-muted transition-colors">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex flex-col items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-medium text-primary uppercase leading-tight">
                            {format(parseISO(ev.eventDate), "MMM")}
                          </span>
                          <span className="text-base font-bold text-primary leading-none">
                            {format(parseISO(ev.eventDate), "d")}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{ev.title}</p>
                          {ev.location && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3" /> {ev.location}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Academy Stats */}
          {widgets.academy_stats && summary && (
            <Card className="border border-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("academy.your_progress")}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-muted-foreground">{t("academy.total_progress")}</span>
                    <span className="font-semibold text-foreground">
                      {summary.academyTotalLessons > 0
                        ? Math.round((summary.academyLessonsCompleted / summary.academyTotalLessons) * 100)
                        : 0}%
                    </span>
                  </div>
                  <Progress
                    value={
                      summary.academyTotalLessons > 0
                        ? (summary.academyLessonsCompleted / summary.academyTotalLessons) * 100
                        : 0
                    }
                    className="h-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">{summary.academyCoursesCompleted}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("academy.courses_completed")}</p>
                  </div>
                  <div className="bg-muted rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">{summary.academyLessonsCompleted}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("academy.lessons")}</p>
                  </div>
                </div>
                <Link href="/academy">
                  <Button variant="outline" size="sm" className="w-full">
                    {t("academy.all_courses")} <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
