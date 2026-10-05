import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListCourses,
  useGetAcademyProgressSummary,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Search,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { academyErrorMessage } from "@/lib/apiErrorMessage";
import { EmptyState, Meter, Notice, PageHeader, Stat, StatGrid } from "@/components/page";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const THUMB_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='450' viewBox='0 0 800 450'%3E%3Crect width='800' height='450' fill='%23DDB398' opacity='0.25'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%23DDB398'%3E▶%3C/text%3E%3C/svg%3E";

export default function Academy() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.split("-")[0] ?? "en";
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Pass lang as a query param so React Query creates a per-language cache slot.
  // The server uses this param (or falls back to user.language in DB) to filter modules.
  const {
    data: coursesData,
    error: coursesError,
    isError: isCoursesError,
    isLoading: isLoadingCourses,
    isFetching: isFetchingCourses,
    refetch: refetchCourses,
  } = useListCourses({
    lang,
  });
  const {
    data: progressSummary,
    error: progressError,
    isError: isProgressError,
    isLoading: isLoadingProgress,
    isFetching: isFetchingProgress,
    refetch: refetchProgress,
  } = useGetAcademyProgressSummary({ lang });

  const courses = coursesData?.items ?? [];
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          courses
            .map((course) => course.category)
            .filter((category): category is string => Boolean(category)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [courses],
  );
  const filteredCourses = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return courses.filter((course) => {
      const matchesCategory =
        categoryFilter === "all" || course.category === categoryFilter;
      const haystack = [
        course.title,
        course.description,
        course.category,
        course.level,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !q || haystack.includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [categoryFilter, courses, deferredSearch]);
  const summary = progressSummary;

  if (isLoadingCourses) {
    return (
      <div className="space-y-8" data-testid="page-academy-loading">
        <div className="space-y-2">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-5 w-80" />
        </div>
        <Skeleton className="h-[116px] rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isCoursesError) {
    return (
      <Notice
        icon={AlertCircle}
        title={t("academy.error_title")}
        action={
          <Button variant="outline" size="sm" disabled={isFetchingCourses} onClick={() => void refetchCourses()}>
            <RefreshCw className={cn("h-4 w-4", isFetchingCourses && "animate-spin")} />
            {t("academy.retry")}
          </Button>
        }
      >
        {academyErrorMessage(coursesError, t)}
      </Notice>
    );
  }

  return (
    <div className="space-y-10" data-testid="page-academy">
      {/* Header */}
      <PageHeader title={t("academy.title")} description={t("academy.subtitle")} />

      {/* Progress Summary */}
      {isLoadingProgress ? (
        <Skeleton className="h-[116px] rounded-xl" />
      ) : isProgressError ? (
        <Notice
          tone="warning"
          icon={AlertCircle}
          title={t("academy.error_title")}
          action={
            <Button variant="outline" size="sm" disabled={isFetchingProgress} onClick={() => void refetchProgress()}>
              <RefreshCw className={cn("h-4 w-4", isFetchingProgress && "animate-spin")} />
              {t("academy.retry")}
            </Button>
          }
        >
          {academyErrorMessage(progressError, t)}
        </Notice>
      ) : summary ? (
        <StatGrid className="grid-cols-1 sm:grid-cols-3 md:grid-cols-3">
          <Stat
            label={t("academy.total_progress")}
            value={`${summary.percentComplete}%`}
            hint={`${summary.completedLessons} / ${summary.totalLessons} ${t("academy.lessons")}`}
            progress={summary.percentComplete}
          />
          <Stat
            label={t("academy.courses_completed")}
            value={summary.completedCourses}
            suffix={`/ ${summary.totalCourses}`}
            tone={summary.totalCourses > 0 && summary.completedCourses >= summary.totalCourses ? "success" : undefined}
          />
          <Stat
            label={t("academy.watch_time")}
            value={formatDuration(summary.watchedDurationSeconds)}
            suffix={`/ ${formatDuration(summary.totalDurationSeconds)}`}
          />
        </StatGrid>
      ) : null}

      {/* Course Grid */}
      <div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h2 className="text-sm font-medium text-foreground">
            {t("academy.all_courses")}
          </h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 sm:w-64"
                placeholder={t("academy.search_placeholder")}
                aria-label={t("academy.search_placeholder")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="sm:w-52" aria-label={t("academy.filter_category")}>
                <SelectValue placeholder={t("academy.filter_category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("academy.all_categories")}
                </SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {courses.length === 0 ? (
          <EmptyState icon={BookOpen} text={t("academy.no_courses")} />
        ) : filteredCourses.length === 0 ? (
          <EmptyState icon={Search} text={t("academy.no_filtered_courses")} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredCourses.map((course) => {
              const isComplete =
                course.completedLessons >= course.lessonCount &&
                course.lessonCount > 0;
              const progress =
                course.lessonCount > 0
                  ? Math.round(
                      (course.completedLessons / course.lessonCount) * 100,
                    )
                  : 0;
              const hasThumbnail = !!course.thumbnailUrl;
              return (
                <Link key={course.id} href={`/academy/${course.id}`}>
                  <Card className="group cursor-pointer overflow-hidden h-full transition-colors hover:border-foreground/20">
                    <div className="relative aspect-video overflow-hidden bg-muted border-b border-border">
                      <img
                        src={course.thumbnailUrl || THUMB_FALLBACK}
                        alt={course.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = THUMB_FALLBACK;
                        }}
                      />
                      {isComplete && (
                        <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-background/90 backdrop-blur px-2 py-0.5 text-[11px] font-medium text-success">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t("academy.completed", { defaultValue: "Done" })}
                        </div>
                      )}
                    </div>
                    <CardContent className="p-5 flex flex-col gap-3">
                      <div>
                        <h3 className="text-[15px] font-medium text-foreground leading-snug">
                          {course.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {course.description}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{t(`academy.level_${course.level}`)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{formatDuration(course.totalDurationSeconds)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{course.lessonCount} {t("academy.lessons")}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{t("academy.module_count", { count: course.moduleCount })}</span>
                      </div>
                      {progress > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                            <span>{t("academy.progress")}</span>
                            <span className="tabular-nums">{progress}%</span>
                          </div>
                          <Meter value={progress} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
