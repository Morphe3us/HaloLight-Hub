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
} from "lucide-react";
import { cn } from "@/lib/utils";

function getYouTubeEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    let videoId = "";
    if (u.hostname === "youtu.be") {
      videoId = u.pathname.slice(1);
    } else {
      videoId = u.searchParams.get("v") ?? "";
    }
    if (!videoId) return url;
    return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
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
  const { t } = useTranslation();
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
      <div className="text-center py-16 text-gray-400">
        <p>Lesson not found.</p>
        <Link href={`/academy/${courseId}`}>
          <Button variant="outline" className="mt-4">{t("academy.back_to_course")}</Button>
        </Link>
      </div>
    );
  }

  // Build flat lesson list for prev/next navigation
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
          toast({ title: "Lesson completed!", description: "Great work. Keep going!" });
          setIsMarkingComplete(false);
          if (nextLesson) {
            setTimeout(() => setLocation(`/academy/${courseId}/${nextLesson.id}`), 800);
          }
        },
        onError: () => {
          setIsMarkingComplete(false);
          toast({ title: "Error", description: "Could not mark complete.", variant: "destructive" });
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
          toast({ title: "Error", description: "Could not submit quiz.", variant: "destructive" });
        },
      }
    );
  };

  const embedUrl = getYouTubeEmbedUrl(lesson.videoUrl);

  return (
    <div className="space-y-6" data-testid="page-academy-lesson">
      {/* Back */}
      <Link href={`/academy/${courseId}`}>
        <button className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {t("academy.back_to_course")}
        </button>
      </Link>

      {/* Title & status */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-400 mb-1">{course.title}</p>
          <h1 className="text-2xl font-bold text-gray-900">{lesson.title}</h1>
        </div>
        {isCompleted && (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            {t("academy.completed")}
          </Badge>
        )}
      </div>

      {/* Video Player */}
      <div className="relative bg-black rounded-2xl overflow-hidden shadow-lg aspect-video">
        <iframe
          src={embedUrl}
          title={lesson.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>

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
            <Card className="border-gray-100 shadow-sm">
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
                      <p className="font-medium text-gray-900">
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
                                    ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                                    : isWrong
                                      ? "border-red-300 bg-red-50 text-red-800"
                                      : "border-gray-200 text-gray-400"
                                  : isSelected
                                    ? "border-primary bg-primary/5 text-primary font-medium"
                                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
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
                    quizResult.passed ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"
                  )}>
                    {quizResult.passed
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      : <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    }
                    <div>
                      <p className={cn("font-semibold", quizResult.passed ? "text-emerald-800" : "text-amber-800")}>
                        {quizResult.passed ? t("academy.quiz_passed") : t("academy.quiz_failed")}
                      </p>
                      <p className={cn("text-sm", quizResult.passed ? "text-emerald-600" : "text-amber-600")}>
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
            <Card className="border-gray-100 shadow-sm">
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
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-gray-700 group-hover:text-primary transition-colors">
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
      <div className="flex justify-between pt-4 border-t border-gray-100">
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
