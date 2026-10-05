import { useTranslation } from "react-i18next";
import { useListOnboardingSteps, useCompleteOnboardingStep, useGetOnboardingSummary, getListOnboardingStepsQueryKey, getGetOnboardingSummaryQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Meter, PageHeader } from "@/components/page";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Onboarding() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: stepsData, isLoading: isLoadingSteps } = useListOnboardingSteps();
  const { data: summary, isLoading: isLoadingSummary } = useGetOnboardingSummary();
  const completeStep = useCompleteOnboardingStep();
  const { toast } = useToast();

  const handleComplete = (id: string) => {
    completeStep.mutate({ stepId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOnboardingStepsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOnboardingSummaryQueryKey() });
        toast({ title: t("onboarding.step_completed") });
      },
      onError: (err: unknown) => {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? t("onboarding.step_complete_error");
        toast({ title: message, variant: "destructive" });
      },
    });
  };

  if (isLoadingSteps || isLoadingSummary) {
    return (
      <div className="max-w-4xl space-y-10">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const steps = stepsData?.items || [];
  const isAllComplete = summary?.percentComplete === 100;

  return (
    <div className="max-w-4xl space-y-10" data-testid="page-onboarding">
      <PageHeader title={t("onboarding.page_title")} description={t("onboarding.get_ready")} />

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("onboarding.your_progress")}</p>
            <p className="text-[13px] text-muted-foreground mt-0.5 tabular-nums">
              {t("onboarding.steps_of", { completed: summary?.completedSteps ?? 0, total: summary?.totalSteps ?? 0 })}
            </p>
          </div>
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{summary?.percentComplete}%</span>
        </div>
        <Meter value={summary?.percentComplete || 0} className="mt-4" />
        {isAllComplete && (
          <p className="text-success text-sm font-medium mt-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 stroke-[1.75]" /> {t("onboarding.all_set")}
          </p>
        )}
      </div>

      <ul className="rounded-xl border border-border bg-card divide-y divide-border">
        {steps.map((step) => {
          const isCompleted = !!step.completedAt;

          return (
            <li
              key={step.id}
              className="transition-colors"
              data-testid={`card-step-${step.id}`}
            >
              <div className="px-4 py-4 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex flex-1 items-start gap-3 min-w-0">
                  <div className="shrink-0 pt-0.5">
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 stroke-[1.75] text-success" />
                    ) : (
                      <Circle className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className={cn("text-sm font-medium", isCompleted ? "text-muted-foreground line-through" : "text-foreground")}>
                        {t(`onboarding.steps.${step.key}.title`, { defaultValue: step.title })}
                      </h3>
                      {step.isRequired && !isCompleted && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                          {t("onboarding.required")}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground first-letter:uppercase">
                        {t(`onboarding.category_${step.category}`, { defaultValue: step.category })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {t(`onboarding.steps.${step.key}.description`, { defaultValue: step.description })}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 pl-7 sm:pl-0">
                  {!isCompleted ? (
                    <Button
                      size="sm"
                      onClick={() => handleComplete(step.id)}
                      disabled={completeStep.isPending}
                      className="w-full sm:w-auto gap-1.5"
                      data-testid={`button-complete-step-${step.id}`}
                    >
                      {t("onboarding.complete_step")} <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" disabled className="w-full sm:w-auto text-success">
                      {t("onboarding.completed_label")}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
