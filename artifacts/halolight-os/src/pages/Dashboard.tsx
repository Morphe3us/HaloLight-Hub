import { useTranslation } from "react-i18next";
import {
  useGetCurrentUser,
  useListNotifications,
  useGetDashboardSummary,
  useListEvents,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Bell, ArrowRight, Trophy, PlayCircle, Calendar, BookOpen, Clock,
  MapPin, GraduationCap, Monitor, Package, LifeBuoy, CheckCircle2,
} from "lucide-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t("dashboard.greeting_morning")
      : hour < 18
      ? t("dashboard.greeting_afternoon")
      : t("dashboard.greeting_evening");

  const { data: user, isLoading: loadingUser } = useGetCurrentUser();
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: notifications, isLoading: loadingNotifs } = useListNotifications({ limit: 3 });
  const { data: eventsData, isLoading: loadingEvents } = useListEvents({ status: "upcoming", limit: 4 });

  const isLoading = loadingUser || loadingSummary;

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

  // Derive alert state for contextual display
  const equipmentAlerts = (summary as Record<string, unknown> | undefined)?.equipmentAlerts as number ?? 0;
  const lowStockCount = (summary as Record<string, unknown> | undefined)?.lowStockCount as number ?? 0;
  const openTicketsCount = (summary as Record<string, unknown> | undefined)?.openTicketsCount as number ?? 0;

  return (
    <div className="space-y-8" data-testid="page-dashboard">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {greeting}, {firstName}
        </h1>
        <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
      </div>

      {/* KPI Cards — 6-card grid (2×3 mobile, 3×2 desktop) */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Lessons Completed */}
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
                <span className="text-base font-normal text-muted-foreground ml-1">
                  / {summary.academyTotalLessons}
                </span>
              </p>
            </CardContent>
          </Card>

          {/* Upcoming Events */}
          <Card className="border-0 shadow-sm bg-accent/8">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-foreground" />
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">
                  {t("dashboard.kpi_events")}
                </span>
              </div>
              <p className="text-3xl font-bold text-foreground">{summary.upcomingEventsCount}</p>
            </CardContent>
          </Card>

          {/* Unread Notifications */}
          <Card className="border-0 shadow-sm bg-info/8">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
                  <Bell className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-medium text-info uppercase tracking-wide leading-tight">
                  {t("dashboard.kpi_notifications")}
                </span>
              </div>
              <p className="text-3xl font-bold text-foreground">{summary.unreadNotifications}</p>
            </CardContent>
          </Card>

          {/* Equipment Alerts */}
          <Link href="/equipment">
            <Card className={cn(
              "border-0 shadow-sm cursor-pointer transition-transform hover:scale-[1.02]",
              equipmentAlerts > 0 ? "bg-destructive/8" : "bg-muted/50"
            )}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center",
                    equipmentAlerts > 0 ? "bg-destructive" : "bg-muted"
                  )}>
                    <Monitor className={cn("w-4 h-4", equipmentAlerts > 0 ? "text-white" : "text-muted-foreground")} />
                  </div>
                  <span className={cn(
                    "text-xs font-medium uppercase tracking-wide leading-tight",
                    equipmentAlerts > 0 ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {t("dashboard.kpi_equipment_alerts")}
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {equipmentAlerts > 0 ? equipmentAlerts : (
                    <span className="text-xl text-success font-semibold">{t("dashboard.equipment_ok")}</span>
                  )}
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Low Stock */}
          <Link href="/consumables">
            <Card className={cn(
              "border-0 shadow-sm cursor-pointer transition-transform hover:scale-[1.02]",
              lowStockCount > 0 ? "bg-warning/8" : "bg-muted/50"
            )}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center",
                    lowStockCount > 0 ? "bg-warning" : "bg-muted"
                  )}>
                    <Package className={cn("w-4 h-4", lowStockCount > 0 ? "text-foreground" : "text-muted-foreground")} />
                  </div>
                  <span className={cn(
                    "text-xs font-medium uppercase tracking-wide leading-tight",
                    lowStockCount > 0 ? "text-warning" : "text-muted-foreground"
                  )}>
                    {t("dashboard.kpi_low_stock")}
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {lowStockCount > 0 ? lowStockCount : (
                    <span className="text-xl text-success font-semibold">{t("dashboard.stock_ok")}</span>
                  )}
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Open Tickets */}
          <Link href="/support">
            <Card className={cn(
              "border-0 shadow-sm cursor-pointer transition-transform hover:scale-[1.02]",
              openTicketsCount > 0 ? "bg-info/8" : "bg-muted/50"
            )}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center",
                    openTicketsCount > 0 ? "bg-info" : "bg-muted"
                  )}>
                    <LifeBuoy className={cn("w-4 h-4", openTicketsCount > 0 ? "text-white" : "text-muted-foreground")} />
                  </div>
                  <span className={cn(
                    "text-xs font-medium uppercase tracking-wide leading-tight",
                    openTicketsCount > 0 ? "text-info" : "text-muted-foreground"
                  )}>
                    {t("dashboard.kpi_open_tickets")}
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">{openTicketsCount}</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Next Lesson */}
          {summary?.nextLesson ? (
            <Card className="border border-primary/10 bg-gradient-to-br from-primary/5 via-card to-card shadow-sm overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
                    <img
                      src={summary.nextLesson.courseThumbnailUrl}
                      alt={summary.nextLesson.courseTitle}
                      className="w-full h-full object-cover"
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
          )}

          {/* Onboarding progress — only if incomplete */}
          {summary && summary.onboardingPercent < 100 && (
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
          {summary && summary.onboardingPercent >= 100 && (
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
        </div>

        {/* Right — 1/3 */}
        <div className="space-y-6">
          {/* Upcoming Events */}
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

          {/* Academy Stats */}
          {summary && (
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
