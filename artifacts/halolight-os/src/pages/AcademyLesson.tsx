import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation, Link } from "wouter";
import {
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
} from "lucide-react";
import { cn } from "@/lib/utils";

function getVideoEmbedUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    // YouTube: youtu.be short link
    if (u.hostname === "youtu.be") {
      const videoId = u.pathname.slice(1);
      return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1` : url;
    }
    // YouTube: standard watch URL
    if (u.hostname.includes("youtube.com")) {
      const videoId = u.searchParams.get("v") ?? "";
      return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1` : url;
    }
    // BunnyStream: watch/player URL → iframe embed URL
    // e.g. https://video.bunnycdn.com/play/{libraryId}/{videoId}
    if (u.hostname === "video.bunnycdn.com" && u.pathname.startsWith("/play/")) {
      const parts = u.pathname.split("/").filter(Boolean); // ["play", libraryId, videoId]
      if (parts.length >= 3) {
        return `https://iframe.mediadelivery.net/embed/${parts[1]}/${parts[2]}`;
      }
    }
    // BunnyStream embed URL — already correct, pass through
    // e.g. https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}
    return url;
  } catch {
    return url;
  }
}

const RESOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pdf: FileText,
  link: LinkIcon,
  download: Download,
  video: BookOpen,
};

export default function AcademyLesson() {
  const { t, i18n } = useTranslation();
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: lesson, isLoading: isLoadingLesson, refetch: refetchLesson } = useGetLesson(lessonId!);
  const { data: course, isLoading: isLoadingCourse } = useGetCourse(courseId!);
  const { mutate: updateProgress } = useUpdateLessonProgress();
  const { mutate: submitQuiz } = useSubmitQuiz();

  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizResult, setQuizResult] = useState<{ score: number; total: number; passed: boolean; answers: Array<{ questionId: string; correct: boolean; selectedOption: number; correctOption: number }> } | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);

  const isLoading = isLoadingLesson || isLoadingCourse;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="aspect-video rounded-2xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!lesson || !course) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>Lesson not found.</p>
        <Link href={`/academy/${courseId}`}>
          <Button variant="outline" className="mt-4">{t("academy.back_to_course")}</Button>
        </Link>
      </div>
    );
  }

  const allLessons = course.modules.flatMap((m) =>
    m.lessons.map((l) => ({ ...l, moduleTitle: m.title }))
  );
  const currentIdx = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;

  const isCompleted = !!lesson.completedAt;

  const handleMarkComplete = () => {
    if (isMarkingComplete) return;
    setIsMarkingComplete(true);
    updateProgress(
      { id: lessonId!, data: { watchPercent: 100, completed: true } },
      {
        onSuccess: () => {
          refetchLesson();
          toast({ title: t("academy_lesson.toast_completed"), description: t("academy_lesson.toast_completed_desc") });
          setIsMarkingComplete(false);
          if (nextLesson) {
            setTimeout(() => setLocation(`/academy/${courseId}/${nextLesson.id}`), 800);
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
    const answers = lesson.quizQuestions.map((q, i) => quizAnswers[q.id] ?? -1);
    submitQuiz(
      { id: lessonId!, data: { answers } },
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

  const lang = i18n.language?.split("-")[0] ?? "en";
  type VideoAsset = { embedUrl?: string; thumbnailUrl?: string; previewUrl?: string; videoId?: string };
  const videoAssets = (lesson as { videoAssets?: Record<string, VideoAsset> | null }).videoAssets;
  const asset = videoAssets?.[lang] ?? videoAssets?.["en"];
  const videoUrls = lesson.videoUrls as Record<string, string> | null | undefined;
  // Resolution chain: videoAssets[lang].embedUrl → videoAssets.en.embedUrl → videoUrls[lang] → videoUrls.en → lesson.videoUrl (legacy)
  const resolvedVideoUrl = asset?.embedUrl ?? videoUrls?.[lang] ?? videoUrls?.["en"] ?? lesson.videoUrl ?? "";
  const embedUrl = getVideoEmbedUrl(resolvedVideoUrl);
  // Thumbnail chain: videoAssets[lang].thumbnailUrl → videoAssets.en.thumbnailUrl → lesson.thumbnailUrl (legacy)
  const thumbnailUrl = asset?.thumbnailUrl ?? videoAssets?.["en"]?.thumbnailUrl ?? (lesson as { thumbnailUrl?: string | null }).thumbnailUrl ?? null;

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
      {embedUrl ? (
        <div
          className="relative bg-black rounded-2xl overflow-hidden shadow-lg aspect-video"
          style={thumbnailUrl ? { backgroundImage: `url(${thumbnailUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          <iframe
            src={embedUrl}
            title={lesson.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="w-full h-full"
            style={{ border: "none" }}
          />
        </div>
      ) : thumbnailUrl ? (
        <div className="relative rounded-2xl overflow-hidden shadow-sm aspect-video bg-black">
          <img src={thumbnailUrl} alt={lesson.title} className="w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Video className="w-12 h-12 opacity-60" />
            <p className="text-sm">{t("academy_lesson.no_video", { defaultValue: "No video available for this lesson." })}</p>
          </div>
        </div>
      ) : (
        <div className="relative bg-muted rounded-2xl overflow-hidden shadow-sm aspect-video flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Video className="w-12 h-12 opacity-30" />
          <p className="text-sm">{t("academy_lesson.no_video", { defaultValue: "No video available for this lesson." })}</p>
        </div>
      )}

      {/* Mark Complete */}
      {!isCompleted && lesson.quizQuestions.length === 0 && (
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
                              disabled={quizSubmitted}
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

                {/* Quiz Result */}
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
                    disabled={Object.keys(quizAnswers).length < lesson.quizQuestions.length}
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
