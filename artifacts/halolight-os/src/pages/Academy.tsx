import { useTranslation } from "react-i18next";
import { useListCourses, useGetAcademyProgressSummary } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Clock, PlayCircle, CheckCircle2, GraduationCap, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-success/15 text-success",
  intermediate: "bg-info/15 text-info",
  advanced: "bg-muted text-foreground",
};

export default function Academy() {
  const { t } = useTranslation();
  const { data: coursesData, isLoading: isLoadingCourses } = useListCourses();
  const { data: progressSummary, isLoading: isLoadingProgress } = useGetAcademyProgressSummary();

  const isLoading = isLoadingCourses || isLoadingProgress;

  if (isLoading) {
    return (
      <div className="space-y-8" data-testid="page-academy-loading">
        <div className="space-y-2">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const courses = coursesData?.items ?? [];
  const summary = progressSummary;

  return (
    <div className="space-y-8" data-testid="page-academy">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("academy.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("academy.subtitle")}</p>
      </div>

      {/* Progress Summary */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm bg-info/8">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-info font-medium">{t("academy.total_progress")}</p>
                <p className="text-2xl font-bold text-foreground">{summary.percentComplete}%</p>
                <p className="text-xs text-info">{summary.completedLessons} / {summary.totalLessons} {t("academy.lessons")}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-success/8">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-success flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-success font-medium">{t("academy.courses_completed")}</p>
                <p className="text-2xl font-bold text-foreground">{summary.completedCourses}</p>
                <p className="text-xs text-muted-foreground">{t("common.of")} {summary.totalCourses} {t("academy.courses").toLowerCase()}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-accent/8">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Watch Time</p>
                <p className="text-2xl font-bold text-foreground">{formatDuration(summary.watchedDurationSeconds)}</p>
                <p className="text-xs text-muted-foreground">{t("common.of")} {formatDuration(summary.totalDurationSeconds)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Course Grid */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-4">{t("academy.all_courses")}</h2>
        {courses.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>{t("academy.no_courses")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {courses.map((course) => {
              const isComplete = course.completedLessons >= course.lessonCount && course.lessonCount > 0;
              const progress = course.lessonCount > 0
                ? Math.round((course.completedLessons / course.lessonCount) * 100)
                : 0;
              return (
                <Link key={course.id} href={`/academy/${course.id}`}>
                  <Card className="group border border-border shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden h-full">
                    <div className="relative aspect-video overflow-hidden">
                      <img
                        src={course.thumbnailUrl}
                        alt={course.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      {isComplete && (
                        <div className="absolute top-3 right-3 bg-success text-white rounded-full p-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      )}
                      <div className="absolute bottom-3 left-3 flex gap-2">
                        <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", LEVEL_COLORS[course.level] ?? "bg-muted text-foreground")}>
                          {t(`academy.level_${course.level}`)}
                        </span>
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-black/40 text-white backdrop-blur-sm">
                          {formatDuration(course.totalDurationSeconds)}
                        </span>
                      </div>
                    </div>
                    <CardContent className="p-5 flex flex-col gap-3">
                      <div>
                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                          {course.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{course.description}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5" />
                          {course.lessonCount} {t("academy.lessons")}
                        </span>
                        <span className="flex items-center gap-1">
                          <PlayCircle className="w-3.5 h-3.5" />
                          {course.moduleCount} modules
                        </span>
                      </div>
                      {progress > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>{t("academy.progress")}</span>
                            <span>{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-1.5" />
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
