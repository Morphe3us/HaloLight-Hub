import { useTranslation } from "react-i18next";
import { useParams, Link } from "wouter";
import { useGetCourse, useGetCurrentUser } from "@workspace/api-client-react";
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
 * Admins see all modules. Regular users see only modules for their language.
 * Falls back to English if the user's language has no module.
 * Non-language-track modules (detectModuleLang = null) are always included.
 */
function filterModulesByLang(mods: CourseModule[], lang: string, isAdmin: boolean): CourseModule[] {
  if (isAdmin) return mods;

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
  const { data: course, isLoading: isLoadingCourse } = useGetCourse(courseId!);
  const { data: currentUser } = useGetCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  if (isLoadingCourse) {
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

  // Apply client-side language filter (safety net on top of server-side filtering)
  const visibleModules = filterModulesByLang(course.modules as CourseModule[], lang, isAdmin);

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

        {visibleModules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground bg-card rounded-2xl border border-border">
            <Video className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">{t("academy.no_content", { defaultValue: "No lessons available yet." })}</p>
            <p className="text-xs opacity-60">{t("academy.no_content_hint", { defaultValue: "Content will appear here once lessons are added to this course." })}</p>
          </div>
        ) : (
          <Accordion type="multiple" defaultValue={visibleModules.map((m) => m.id)} className="space-y-3">
            {visibleModules.map((mod) => {
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
                        {modCompleted}/{mod.lessons.length} {t("academy.lessons")}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <div className="divide-y divide-border/50">
                      {mod.lessons.map((lesson) => {
                        const isCompleted = !!lesson.completedAt;
                        type VA = { thumbnailUrl?: string };
                        const va = (lesson as { videoAssets?: Record<string, VA> | null }).videoAssets;
                        const thumb = va?.[lang]?.thumbnailUrl || va?.["en"]?.thumbnailUrl || (lesson as { thumbnailUrl?: string | null }).thumbnailUrl || null;
                        return (
                          <Link key={lesson.id} href={`/academy/${course.id}/${lesson.id}`}>
                            <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted transition-colors cursor-pointer group">
                              {thumb ? (
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
                              ) : (
                                <div className={cn(
                                  "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                                  isCompleted ? "bg-success/15" : "bg-muted group-hover:bg-primary/10"
                                )}>
                                  {isCompleted
                                    ? <CheckCircle2 className="w-4 h-4 text-success" />
                                    : <PlayCircle className={cn("w-4 h-4", "text-muted-foreground group-hover:text-primary")} />
                                  }
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={cn(
                                  "text-sm font-medium truncate",
                                  isCompleted ? "text-muted-foreground" : "text-foreground"
                                )}>
                                  {lesson.title}
                                </p>
                                {lesson.watchPercent != null && lesson.watchPercent > 0 && !isCompleted && (
                                  <p className="text-xs text-primary mt-0.5">{lesson.watchPercent}% {t("academy.watched", { defaultValue: "watched" })}</p>
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
