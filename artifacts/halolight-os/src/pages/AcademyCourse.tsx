import { useTranslation } from "react-i18next";
import { useParams, Link } from "wouter";
import { useGetCourse } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, Clock, BookOpen, CheckCircle2, PlayCircle, Video } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const THUMB_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='450' viewBox='0 0 800 450'%3E%3Crect width='800' height='450' fill='%23DDB398' opacity='0.25'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%23DDB398'%3E▶%3C/text%3E%3C/svg%3E";

const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-success/15 text-success border-success/30",
  intermediate: "bg-info/15 text-info border-info/30",
  advanced: "bg-muted text-foreground border-border",
};

export default function AcademyCourse() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.split("-")[0] ?? "en";
  const { courseId } = useParams<{ courseId: string }>();
  const { data: course, isLoading } = useGetCourse(courseId!);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>Course not found.</p>
        <Link href="/academy">
          <Button variant="outline" className="mt-4">{t("academy.back_to_academy")}</Button>
        </Link>
      </div>
    );
  }

  const completedLessons = course.completedLessons;
  const totalLessons = course.lessonCount;
  const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // Find first incomplete lesson for the CTA
  let nextLessonId: string | null = null;
  for (const mod of course.modules) {
    for (const lesson of mod.lessons) {
      if (!lesson.completedAt) {
        nextLessonId = lesson.id;
        break;
      }
    }
    if (nextLessonId) break;
  }
  if (!nextLessonId && course.modules[0]?.lessons[0]) {
    nextLessonId = course.modules[0].lessons[0].id;
  }

  return (
    <div className="space-y-8" data-testid="page-academy-course">
      {/* Back */}
      <Link href="/academy">
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {t("academy.back_to_academy")}
        </button>
      </Link>

      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden shadow-sm border border-border">
        <div className="absolute inset-0">
          <img
            src={course.thumbnailUrl || THUMB_FALLBACK}
            alt={course.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = THUMB_FALLBACK; }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/70 to-transparent" />
        </div>
        <div className="relative p-8 md:p-12 flex flex-col gap-4 min-h-[240px] justify-end">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={cn("text-xs font-medium", LEVEL_COLORS[course.level])}>
              {t(`academy.level_${course.level}`)}
            </Badge>
            <Badge variant="outline" className="text-xs bg-card/10 text-white border-white/20">
              {course.category}
            </Badge>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight max-w-2xl">
            {course.title}
          </h1>
          <p className="text-muted-foreground max-w-2xl">{course.description}</p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              {totalLessons} {t("academy.lessons")}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {formatDuration(course.totalDurationSeconds)}
            </span>
            {progress > 0 && (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-success" />
                {progress}% {t("academy.completed")}
              </span>
            )}
          </div>
          {nextLessonId && (
            <div className="mt-2">
              <Link href={`/academy/${course.id}/${nextLessonId}`}>
                <Button size="lg" className="shadow-lg">
                  <PlayCircle className="w-5 h-5 mr-2" />
                  {completedLessons === 0 ? t("academy.start_course") : t("academy.continue")}
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {progress > 0 && (
        <div className="bg-card rounded-xl border border-border shadow-sm p-5">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-foreground">{t("academy.your_progress")}</span>
            <span className="text-sm font-medium text-primary">{completedLessons} / {totalLessons} {t("academy.lessons")}</span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>
      )}

      {/* Curriculum */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-4">{t("academy.course_overview")}</h2>

        {course.modules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground bg-card rounded-2xl border border-border">
            <Video className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">{t("academy.no_content", { defaultValue: "No lessons available yet." })}</p>
            <p className="text-xs opacity-60">{t("academy.no_content_hint", { defaultValue: "Content will appear here once lessons are added to this course." })}</p>
          </div>
        ) : (
        <Accordion type="multiple" defaultValue={course.modules.map((m) => m.id)} className="space-y-3">
          {course.modules.map((mod) => {
            const modCompleted = mod.lessons.filter((l) => l.completedAt).length;
            return (
              <AccordionItem
                key={mod.id}
                value={mod.id}
                className="border border-border rounded-xl bg-card shadow-sm overflow-hidden px-0"
              >
                <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted transition-colors">
                  <div className="flex items-center justify-between w-full pr-2">
                    <span className="font-semibold text-foreground text-left">{mod.title}</span>
                    <span className="text-xs text-muted-foreground font-medium shrink-0 ml-4">
                      {modCompleted}/{mod.lessons.length} lessons
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-0">
                  <div className="divide-y divide-gray-50">
                    {mod.lessons.map((lesson, idx) => {
                      const isCompleted = !!lesson.completedAt;
                      return (
                        <Link key={lesson.id} href={`/academy/${course.id}/${lesson.id}`}>
                          <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted transition-colors cursor-pointer group">
                            {/* Thumbnail or icon */}
                            {(() => {
                              type VA = { thumbnailUrl?: string };
                              const va = (lesson as { videoAssets?: Record<string, VA> | null }).videoAssets;
                              const thumb = va?.[lang]?.thumbnailUrl ?? va?.["en"]?.thumbnailUrl ?? (lesson as { thumbnailUrl?: string | null }).thumbnailUrl ?? null;
                              return thumb ? (
                              <div className="h-10 w-16 rounded-md overflow-hidden flex-shrink-0 bg-muted relative">
                                <img
                                  src={thumb}
                                  alt={lesson.title}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                                />
                                {isCompleted && (
                                  <div className="absolute inset-0 bg-success/40 flex items-center justify-center">
                                    <CheckCircle2 className="w-4 h-4 text-white" />
                                  </div>
                                )}
                              </div>
                              ) : null;
                            })()}
                            {(() => {
                              type VA = { thumbnailUrl?: string };
                              const va = (lesson as { videoAssets?: Record<string, VA> | null }).videoAssets;
                              const thumb = va?.[lang]?.thumbnailUrl ?? va?.["en"]?.thumbnailUrl ?? (lesson as { thumbnailUrl?: string | null }).thumbnailUrl ?? null;
                              return !thumb ? (
                              <div className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                                isCompleted ? "bg-success/15" : "bg-muted group-hover:bg-primary/10"
                              )}>
                                {isCompleted
                                  ? <CheckCircle2 className="w-4 h-4 text-success" />
                                  : <PlayCircle className={cn("w-4 h-4", "text-muted-foreground group-hover:text-primary")} />
                                }
                              </div>
                              ) : null;
                            })()}
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-sm font-medium truncate",
                                isCompleted ? "text-muted-foreground" : "text-foreground"
                              )}>
                                {lesson.title}
                              </p>
                              {lesson.watchPercent != null && lesson.watchPercent > 0 && !isCompleted && (
                                <p className="text-xs text-primary mt-0.5">{lesson.watchPercent}% watched</p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {formatDuration(lesson.durationSeconds)}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
        )}
      </div>
    </div>
  );
}
