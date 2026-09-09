import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAcademyProgressSummaryQueryKey,
  getGetCourseQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetLessonQueryKey,
  getListCoursesQueryKey,
  useGetLesson,
  useGetCourse,
  useUpdateLessonProgress,
  useSubmitQuiz,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Link as LinkIcon,
  Download,
  BookOpen,
  AlertCircle,
  Video,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { academyErrorMessage, apiErrorStatus } from "@/lib/apiErrorMessage";

export function getVideoEmbedUrl(url: string): string {
  if (typeof url !== "string" || !url.trim()) return "";
  try {
    const u = new URL(url);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) return "";
    if (u.hostname === "youtu.be") {
      const videoId = u.pathname.slice(1);
      return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1` : url;
    }
    if (u.hostname === "youtube.com" || u.hostname.endsWith(".youtube.com")) {
      const videoId = u.searchParams.get("v") ?? "";
      return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1` : url;
    }
    if (u.hostname === "video.bunnycdn.com" && u.pathname.startsWith("/play/")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length === 3) {
        u.protocol = "https:";
        u.host = "iframe.mediadelivery.net";
        u.pathname = `/embed/${parts[1]}/${parts[2]}`;
      }
    }
    if (u.hostname === "iframe.mediadelivery.net") {
      if (/^\/play\/[^/]+\/[^/]+\/?$/.test(u.pathname)) {
        u.pathname = u.pathname.replace(/^\/play\//, "/embed/");
      }
      const defaults = new URLSearchParams({
        controls: "true", autoplay: "false", loop: "false", muted: "false",
        preload: "true", responsive: "true",
      });
      for (const key of [...defaults.keys()]) {
        if (u.searchParams.has(key)) defaults.delete(key);
      }
      // Append defaults without reserializing or dropping signed token/expiry parameters.
      if (defaults.size) u.search += `${u.search ? "&" : "?"}${defaults}`;
      return u.toString();
    }
    return u.toString();
  } catch {
    return "";
  }
}

type VideoAsset = { embedUrl?: string | null; thumbnailUrl?: string | null };
type LessonPlayback = {
  videoUrl?: string | null;
  videoUrls?: Record<string, string> | null;
  videoAssets?: Record<string, VideoAsset> | null;
};

export function resolveLessonVideoUrl(lesson: LessonPlayback, lang: string): string {
  const { videoAssets, videoUrls } = lesson;
  const candidates = [videoAssets?.[lang]?.embedUrl, videoUrls?.[lang],
    videoAssets?.en?.embedUrl, videoUrls?.en];
  // A legacy default must not resurrect playback from an unrelated language.
  if (!Object.keys(videoAssets ?? {}).length && !Object.keys(videoUrls ?? {}).length) {
    candidates.push(lesson.videoUrl);
  }
  return candidates.map((url) => getVideoEmbedUrl(url ?? "")).find(Boolean) ?? "";
}

const RESOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pdf: FileText,
  link: LinkIcon,
  download: Download,
  video: BookOpen,
};

/**
 * Maps all known module title formats to language codes.
 * Covers native names (server output) and legacy English names (cached responses).
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

function filterModulesByLang<T extends { title: string; lessons: unknown[] }>(
  mods: T[],
  lang: string
): T[] {
  const hasLangMods = mods.some((m) => getModuleLang(m.title) !== null);
  if (!hasLangMods) return mods;

  const userLangMods = mods.filter((m) => getModuleLang(m.title) === lang);
  if (userLangMods.length > 0) return userLangMods;

  const enMods = mods.filter((m) => getModuleLang(m.title) === "en");
  if (enMods.length > 0) return enMods;

  return mods;
}

export default function AcademyLesson() {
  const { i18n } = useTranslation();
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const lang = i18n.language?.split("-")[0] ?? "en";
  // Route/language changes must discard quiz state, player state and delayed navigation.
  return <AcademyLessonContent key={`${courseId}:${lessonId}:${lang}`} courseId={courseId!} lessonId={lessonId!} lang={lang} />;
}

function AcademyLessonContent({ courseId, lessonId, lang }: { courseId: string; lessonId: string; lang: string }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: lesson,
    error: lessonError,
    isError: isLessonError,
    isLoading: isLoadingLesson,
    isFetching: isFetchingLesson,
    isFetchedAfterMount,
    refetch: refetchLesson,
  } = useGetLesson(lessonId, { lang }, {
    query: {
      queryKey: getGetLessonQueryKey(lessonId, { lang }),
      staleTime: 0,
      refetchOnMount: "always",
    },
  });
  const {
    data: course,
    error: courseError,
    isError: isCourseError,
    isLoading: isLoadingCourse,
    isFetching: isFetchingCourse,
    refetch: refetchCourse,
  } = useGetCourse(courseId!, { lang });
  const { mutate: updateProgress } = useUpdateLessonProgress();
  const { mutate: submitQuiz, isPending: isSubmittingQuiz } = useSubmitQuiz();

  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizResult, setQuizResult] = useState<{ score: number; total: number; passed: boolean; answers: Array<{ questionId: string; correct: boolean; selectedOption: number; correctOption: number }> } | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);
  const [playbackAttempt, setPlaybackAttempt] = useState(0);
  const [isRetryingPlayback, setIsRetryingPlayback] = useState(false);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (completionTimer.current !== null) clearTimeout(completionTimer.current);
  }, []);

  const isLoading = isLoadingLesson || isLoadingCourse || (!isFetchedAfterMount && isFetchingLesson);
  const visibleModules = course
    ? filterModulesByLang(
        course.modules as Array<{
          id: string;
          title: string;
          lessons: Array<{ id: string; moduleTitle?: string }>;
        }>,
        lang,
      )
    : [];
  const allLessons = visibleModules.flatMap((m) =>
    m.lessons.map((l) => ({ ...l, moduleTitle: m.title })),
  );
  const currentIdx = allLessons.findIndex((l) => l.id === lessonId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="aspect-video rounded-2xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (isLessonError || isCourseError) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/8 p-5 text-destructive break-words">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{t("academy.error_title")}</p>
            <p className="mt-1 text-sm">
              {isCourseError ? academyErrorMessage(courseError, t)
                : apiErrorStatus(lessonError) === 404 ? t("academy.lesson_unavailable")
                : academyErrorMessage(lessonError, t)}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" disabled={isFetchingLesson || isFetchingCourse} onClick={() => {
            void refetchLesson();
            void refetchCourse();
          }}>
            <RefreshCw className={cn("mr-2 h-4 w-4", (isFetchingLesson || isFetchingCourse) && "animate-spin")} />
            {t("academy.retry")}
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/academy/${courseId}`}>{t("academy.back_to_course")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!lesson || !course || currentIdx === -1 || lesson.id !== lessonId || course.id !== courseId) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>{t("academy.lesson_unavailable")}</p>
        <Link href={`/academy/${courseId}`}>
          <Button variant="outline" className="mt-4">{t("academy.back_to_course")}</Button>
        </Link>
      </div>
    );
  }

  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;

  const isCompleted = !!lesson.completedAt;

  const handleMarkComplete = () => {
    if (isMarkingComplete) return;
    setIsMarkingComplete(true);
    updateProgress(
      { id: lessonId!, params: { lang }, data: { watchPercent: 100, completed: true } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetLessonQueryKey(lessonId!, { lang }),
          });
          queryClient.invalidateQueries({
            queryKey: getGetCourseQueryKey(courseId!, { lang }),
          });
          queryClient.invalidateQueries({
            queryKey: getListCoursesQueryKey({ lang }),
          });
          queryClient.invalidateQueries({
            queryKey: getGetAcademyProgressSummaryQueryKey({ lang }),
          });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey({ lang }),
          });
          toast({ title: t("academy_lesson.toast_completed"), description: t("academy_lesson.toast_completed_desc") });
          setIsMarkingComplete(false);
          if (nextLesson) {
            completionTimer.current = setTimeout(() => setLocation(`/academy/${courseId}/${nextLesson.id}`), 800);
          }
        },
        onError: () => {
          setIsMarkingComplete(false);
          toast({ title: t("academy_lesson.toast_error"), description: t("academy_lesson.toast_mark_fail"), variant: "destructive" });
        },
      }
    );
  };

  const handleQuizSubmit = () => {
    if (isSubmittingQuiz || quizSubmitted) return;
    const answers = lesson.quizQuestions.map((q) => quizAnswers[q.id] ?? -1);
    submitQuiz(
      { id: lessonId!, params: { lang }, data: { answers } },
      {
        onSuccess: (result) => {
          setQuizResult(result);
          setQuizSubmitted(true);
          if (result.passed) {
            handleMarkComplete();
          }
        },
        onError: () => {
          toast({ title: t("academy_lesson.toast_error"), description: t("academy_lesson.toast_quiz_fail"), variant: "destructive" });
        },
      }
    );
  };

  const videoAssets = lesson.videoAssets;
  const embedUrl = resolveLessonVideoUrl(lesson, lang);

  const retryPlayback = async () => {
    if (isRetryingPlayback || isFetchingLesson) return;
    setIsRetryingPlayback(true);
    try {
      const result = await refetchLesson();
      if (!result.isError) setPlaybackAttempt((attempt) => attempt + 1);
    } finally {
      setIsRetryingPlayback(false);
    }
  };

  // Thumbnail: lang-specific → EN fallback only (no random language fallback)
  const thumbnailUrl =
    videoAssets?.[lang]?.thumbnailUrl ||
    videoAssets?.["en"]?.thumbnailUrl ||
    (lesson as { thumbnailUrl?: string | null }).thumbnailUrl ||
    null;

  return (
    <div className="space-y-6" data-testid="page-academy-lesson">
      {/* Back */}
      <Link href={`/academy/${courseId}`}>
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {t("academy.back_to_course")}
        </button>
      </Link>

      {/* Title & status */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{course.title}</p>
          <h1 className="text-2xl font-bold text-foreground">{lesson.title}</h1>
        </div>
        {isCompleted && (
          <Badge className="bg-success/15 text-success border-success/30 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            {t("academy.completed")}
          </Badge>
        )}
      </div>

      {/* Video Player */}
      {isRetryingPlayback ? (
        <Skeleton className="aspect-video rounded-2xl" aria-label={t("common.loading")} />
      ) : embedUrl ? (
        <div
          className="relative bg-black rounded-2xl overflow-hidden shadow-lg aspect-video"
          style={thumbnailUrl ? { backgroundImage: `url(${thumbnailUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          <iframe
            key={playbackAttempt}
            src={embedUrl}
            title={lesson.title}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="origin"
            className="w-full h-full"
            style={{ border: "none" }}
          />
        </div>
      ) : thumbnailUrl ? (
        <div className="relative rounded-2xl overflow-hidden shadow-sm aspect-video bg-black">
          <img src={thumbnailUrl} alt={lesson.title} className="w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Video className="w-12 h-12 opacity-60" />
            <p className="text-sm">{t("academy_lesson.no_video", { defaultValue: "Video not available in this language yet." })}</p>
          </div>
        </div>
      ) : (
        <div className="relative bg-muted rounded-2xl overflow-hidden shadow-sm aspect-video flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Video className="w-12 h-12 opacity-30" />
          <p className="text-sm">{t("academy_lesson.no_video", { defaultValue: "Video not available in this language yet." })}</p>
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => void retryPlayback()} disabled={isRetryingPlayback || isFetchingLesson}>
          <RefreshCw className={cn("mr-2 h-4 w-4", (isRetryingPlayback || isFetchingLesson) && "animate-spin")} />
          {t("academy.retry_video")}
        </Button>
      </div>

      {/* Mark Complete */}
      {!isCompleted && (lesson.quizQuestions.length === 0 || quizResult?.passed) && (
        <div className="flex justify-end">
          <Button
            onClick={handleMarkComplete}
            disabled={isMarkingComplete}
            className="shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {t("academy.mark_complete")}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Quiz */}
        <div className="lg:col-span-2 space-y-6">
          {lesson.quizQuestions.length > 0 && (
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  {t("academy.quiz")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {lesson.quizQuestions.map((q, qi) => {
                  const result = quizResult?.answers.find((a) => a.questionId === q.id);
                  return (
                    <div key={q.id} className="space-y-3">
                      <p className="font-medium text-foreground">
                        {qi + 1}. {q.question}
                      </p>
                      <div className="space-y-2">
                        {q.options.map((opt, oi) => {
                          const isSelected = quizAnswers[q.id] === oi;
                          const isCorrect = result && oi === result.correctOption;
                          const isWrong = result && isSelected && !result.correct;
                          return (
                            <button
                              key={oi}
                              onClick={() => !quizSubmitted && setQuizAnswers((prev) => ({ ...prev, [q.id]: oi }))}
                              disabled={quizSubmitted || isSubmittingQuiz}
                              aria-pressed={isSelected}
                              className={cn(
                                "w-full text-left px-4 py-3 rounded-lg border text-sm transition-all",
                                quizSubmitted
                                  ? isCorrect
                                    ? "border-success/40 bg-success/8 text-success"
                                    : isWrong
                                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                                      : "border-border text-muted-foreground"
                                  : isSelected
                                    ? "border-primary bg-primary/5 text-primary font-medium"
                                    : "border-border hover:border-border hover:bg-muted text-foreground"
                              )}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {quizResult && (
                  <div className={cn(
                    "rounded-xl p-4 flex items-center gap-3",
                    quizResult.passed ? "bg-success/8 border border-success/20" : "bg-warning/8 border border-warning/20"
                  )}>
                    {quizResult.passed
                      ? <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                      : <AlertCircle className="w-5 h-5 text-warning shrink-0" />
                    }
                    <div>
                      <p className={cn("font-semibold", quizResult.passed ? "text-success" : "text-warning")}>
                        {quizResult.passed ? t("academy.quiz_passed") : t("academy.quiz_failed")}
                      </p>
                      <p className={cn("text-sm", quizResult.passed ? "text-success" : "text-warning")}>
                        {t("academy.quiz_score")}: {quizResult.score} / {quizResult.total}
                      </p>
                    </div>
                  </div>
                )}

                {!quizSubmitted ? (
                  <Button
                    onClick={handleQuizSubmit}
                    disabled={isSubmittingQuiz || lesson.quizQuestions.some((q) => quizAnswers[q.id] === undefined)}
                    className="w-full"
                  >
                    {t("academy.quiz_submit")}
                  </Button>
                ) : !quizResult?.passed && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuizSubmitted(false);
                      setQuizResult(null);
                      setQuizAnswers({});
                    }}
                    className="w-full"
                  >
                    {t("academy.quiz_retake")}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Resources */}
        {lesson.resources.length > 0 && (
          <div className="space-y-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("academy.resources")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {lesson.resources.map((r) => {
                  const Icon = RESOURCE_ICONS[r.type] ?? FileText;
                  return (
                    <a
                      key={r.id}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors group"
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {r.title}
                      </span>
                    </a>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-border">
        {prevLesson ? (
          <Link href={`/academy/${courseId}/${prevLesson.id}`}>
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              {t("academy.prev_lesson")}
            </Button>
          </Link>
        ) : <div />}

        {nextLesson ? (
          <Link href={`/academy/${courseId}/${nextLesson.id}`}>
            <Button className="gap-2">
              {t("academy.next_lesson")}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        ) : (
          <Link href={`/academy/${courseId}`}>
            <Button variant="outline">{t("academy.back_to_course")}</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
