import { useTranslation } from "react-i18next";
import { useParams, Link } from "wouter";
import { useGetCourse } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertCircle, ArrowLeft, CheckCircle2, PlayCircle, RefreshCw, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { academyErrorMessage } from "@/lib/apiErrorMessage";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const THUMB_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='450' viewBox='0 0 800 450'%3E%3Crect width='800' height='450' fill='%23DDB398' opacity='0.25'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%23DDB398'%3E▶%3C/text%3E%3C/svg%3E";

const LEVEL_DOT: Record<string, string> = {
  beginner: "bg-success",
  intermediate: "bg-info",
  advanced: "bg-muted-foreground",
};

/**
 * Maps all known module title formats (native names + legacy English names) to ISO language codes.
 * This covers both the current API output (native names like "Français") and legacy formats
 * ("French Language", "French") that may appear from cached responses.
 */
const MODULE_TITLE_TO_LANG: Record<string, string> = {
  "english": "en",
  "english language": "en",
  "français": "fr",
  "french": "fr",
  "french language": "fr",
  "deutsch": "de",
  "german": "de",
  "german language": "de",
  "español": "es",
  "spanish": "es",
  "spanish language": "es",
  "italiano": "it",
  "italian": "it",
  "italian language": "it",
  "nederlands": "nl",
  "dutch": "nl",
  "dutch language": "nl",
  "polski": "pl",
  "polish": "pl",
  "polish language": "pl",
  "português": "pt",
  "portuguese": "pt",
  "portuguese language": "pt",
};

function getModuleLang(title: string): string | null {
  return MODULE_TITLE_TO_LANG[title.toLowerCase().trim()] ?? null;
}

type CourseModule = {
  id: string;
  title: string;
  order: number;
  lessons: Array<{
    id: string;
    title: string;
    durationSeconds: number;
    order: number;
    completedAt: string | null;
    watchPercent: number | null;
    thumbnailUrl?: string | null;
    videoAssets?: Record<string, { thumbnailUrl?: string }> | null;
  }>;
};

/**
 * Client-side safety filter — mirrors server-side filterModulesForLang().
 * Always filters by language on public Academy pages — no role bypass.
 * Falls back to English if the user's language has no module.
 */
function filterModulesByLang(mods: CourseModule[], lang: string): CourseModule[] {
  const hasLangMods = mods.some((m) => getModuleLang(m.title) !== null);
  if (!hasLangMods) return mods; // not a language-structured course

  const userLangMods = mods.filter((m) => getModuleLang(m.title) === lang);
  if (userLangMods.length > 0) return userLangMods;

  // Fallback to English
  const enMods = mods.filter((m) => getModuleLang(m.title) === "en");
  if (enMods.length > 0) return enMods;

  return mods;
}

export default function AcademyCourse() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.split("-")[0] ?? "en";
  const { courseId } = useParams<{ courseId: string }>();
  // Pass lang so the server returns only this language's modules, and React Query
  // creates a per-language cache slot (different cache key per language).
  const {
    data: course,
    error: courseError,
    isError: isCourseError,
    isLoading: isLoadingCourse,
    isFetching: isFetchingCourse,
    refetch: refetchCourse,
  } = useGetCourse(courseId!, { lang });
  if (isLoadingCourse) {
    return (
      <div className="space-y-10">
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 space-y-3">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-5 w-full max-w-md" />
          </div>
          <Skeleton className="lg:col-span-2 aspect-video rounded-xl" />
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (isCourseError) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-4 break-words">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 stroke-[1.75] text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-destructive">{t("academy.error_title")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {academyErrorMessage(courseError, t)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={isFetchingCourse} onClick={() => void refetchCourse()}>
                <RefreshCw className={cn("h-4 w-4", isFetchingCourse && "animate-spin")} />
                {t("academy.retry")}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/academy">{t("academy.back_to_academy")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">{t("academy.course_unavailable")}</p>
        <Link href="/academy">
          <Button variant="outline" size="sm" className="mt-4">{t("academy.back_to_academy")}</Button>
        </Link>
      </div>
    );
  }

  // Apply client-side language filter (safety net on top of server-side filtering)
  const visibleModules = filterModulesByLang(course.modules as CourseModule[], lang);

  const allVisibleLessons = visibleModules.flatMap((m) => m.lessons);
  const totalLessons = allVisibleLessons.length;
  const completedLessons = allVisibleLessons.filter((l) => l.completedAt).length;
  const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // First incomplete lesson for the CTA
  let nextLessonId: string | null = null;
  for (const mod of visibleModules) {
    for (const lesson of mod.lessons) {
      if (!lesson.completedAt) {
        nextLessonId = lesson.id;
        break;
      }
    }
    if (nextLessonId) break;
  }
  if (!nextLessonId && visibleModules[0]?.lessons[0]) {
    nextLessonId = visibleModules[0].lessons[0].id;
  }

  return (
    <div className="space-y-10" data-testid="page-academy-course">
      {/* Back */}
      <Link href="/academy">
        <button className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5 stroke-[1.75]" />
          {t("academy.back_to_academy")}
        </button>
      </Link>

      {/* Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
        <div className="lg:col-span-3 flex flex-col gap-4 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", LEVEL_DOT[course.level] ?? "bg-muted-foreground")} />
              {t(`academy.level_${course.level}`)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{course.category}</span>
          </div>
          <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight text-foreground leading-tight max-w-2xl break-words">
            {course.title}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">{course.description}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{totalLessons} {t("academy.lessons")}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{formatDuration(course.totalDurationSeconds)}</span>
            {progress > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.75]" />
                  <span className="tabular-nums">{progress}% {t("academy.completed")}</span>
                </span>
              </>
            )}
          </div>
          {nextLessonId && (
            <div className="mt-1">
              <Link href={`/academy/${course.id}/${nextLessonId}`}>
                <Button className="gap-1.5">
                  <PlayCircle className="w-4 h-4 stroke-[1.75]" />
                  {completedLessons === 0 ? t("academy.start_course") : t("academy.continue")}
                </Button>
              </Link>
            </div>
          )}
        </div>
        <div className="lg:col-span-2 aspect-video rounded-xl overflow-hidden border border-border bg-muted">
          <img
            src={course.thumbnailUrl || THUMB_FALLBACK}
            alt={course.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = THUMB_FALLBACK; }}
          />
        </div>
      </div>

      {/* Progress bar */}
      {progress > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[13px] text-muted-foreground">{t("academy.your_progress")}</span>
            <span className="text-sm font-medium tabular-nums text-foreground">{completedLessons} / {totalLessons} {t("academy.lessons")}</span>
          </div>
          <Progress value={progress} className="h-1 mt-3" />
        </div>
      )}

      {/* Curriculum */}
      <section>
        <h2 className="text-sm font-medium text-foreground mb-3">{t("academy.course_overview")}</h2>

        {visibleModules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <Video className="w-5 h-5 mx-auto mb-3 text-muted-foreground/70 stroke-[1.75]" />
            <p className="text-sm text-muted-foreground">{t("academy.no_content", { defaultValue: "No lessons available yet." })}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">{t("academy.no_content_hint", { defaultValue: "Content will appear here once lessons are added to this course." })}</p>
          </div>
        ) : (
          <Accordion key={`${courseId}:${lang}`} type="multiple" defaultValue={visibleModules.map((m) => m.id)} className="space-y-3">
            {visibleModules.map((mod) => {
              const modCompleted = mod.lessons.filter((l) => l.completedAt).length;
              return (
                <AccordionItem
                  key={mod.id}
                  value={mod.id}
                  className="border border-border rounded-xl bg-card overflow-hidden px-0"
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between w-full pr-2">
                      <span className="text-sm font-medium text-foreground text-left">{mod.title}</span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-4">
                        {modCompleted}/{mod.lessons.length} {t("academy.lessons")}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <div className="divide-y divide-border border-t border-border">
                      {mod.lessons.map((lesson) => {
                        const isCompleted = !!lesson.completedAt;
                        type VA = { thumbnailUrl?: string };
                        const va = (lesson as { videoAssets?: Record<string, VA> | null }).videoAssets;
                        const thumb = va?.[lang]?.thumbnailUrl || va?.["en"]?.thumbnailUrl || (lesson as { thumbnailUrl?: string | null }).thumbnailUrl || null;
                        return (
                          <Link key={lesson.id} href={`/academy/${course.id}/${lesson.id}`}>
                            <div className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer group">
                              {thumb ? (
                                <div key={thumb} className="h-10 w-16 rounded-md overflow-hidden flex-shrink-0 bg-muted relative">
                                  <img
                                    src={thumb}
                                    alt={lesson.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                                  />
                                  {isCompleted && (
                                    <div className="absolute inset-0 bg-foreground/40 flex items-center justify-center">
                                      <CheckCircle2 className="w-4 h-4 stroke-[1.75] text-white" />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="h-8 w-8 flex items-center justify-center flex-shrink-0">
                                  {isCompleted
                                    ? <CheckCircle2 className="w-4 h-4 stroke-[1.75] text-success" />
                                    : <PlayCircle className={cn("w-4 h-4 stroke-[1.75]", "text-muted-foreground group-hover:text-foreground")} />
                                  }
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={cn(
                                  "text-sm truncate",
                                  isCompleted ? "text-muted-foreground" : "text-foreground font-medium"
                                )}>
                                  {lesson.title}
                                </p>
                                {lesson.watchPercent != null && lesson.watchPercent > 0 && !isCompleted && (
                                  <p className="text-xs text-muted-foreground tabular-nums mt-0.5">{lesson.watchPercent}% {t("academy.watched", { defaultValue: "watched" })}</p>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
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
      </section>
    </div>
  );
}
