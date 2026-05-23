import { useListOnboardingSteps, useCompleteOnboardingStep, useGetOnboardingSummary, getListOnboardingStepsQueryKey, getGetOnboardingSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Circle, Trophy, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Onboarding() {
  const queryClient = useQueryClient();
  const { data: stepsData, isLoading: isLoadingSteps } = useListOnboardingSteps();
  const { data: summary, isLoading: isLoadingSummary } = useGetOnboardingSummary();
  const completeStep = useCompleteOnboardingStep();

  const handleComplete = (id: string) => {
    completeStep.mutate({ stepId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOnboardingStepsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOnboardingSummaryQueryKey() });
      }
    });
  };

  if (isLoadingSteps || isLoadingSummary) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="space-y-4 mt-8">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const steps = stepsData?.items || [];
  const isAllComplete = summary?.percentComplete === 100;

  return (
    <div className="max-w-4xl mx-auto space-y-8" data-testid="page-onboarding">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Partner Setup</h1>
        <p className="text-muted-foreground mt-1">Get your account ready for production.</p>
      </div>

      <Card className="bg-sidebar text-sidebar-foreground border-sidebar-border shadow-lg overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Trophy className="w-32 h-32" />
        </div>
        <CardHeader className="relative z-10 pb-4">
          <CardTitle className="text-2xl text-white">Your Progress</CardTitle>
          <CardDescription className="text-muted-foreground">
            {summary?.completedSteps} of {summary?.totalSteps} steps completed
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="flex items-center gap-4 mb-2">
            <div className="flex-1 h-3 bg-sidebar-accent rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-1000 ease-out" 
                style={{ width: `${summary?.percentComplete || 0}%` }}
              />
            </div>
            <span className="font-bold text-white w-12 text-right">{summary?.percentComplete}%</span>
          </div>
          {isAllComplete && (
            <p className="text-green-400 text-sm font-medium mt-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> All set! Your account is fully configured.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {steps.map((step) => {
          const isCompleted = !!step.completedAt;
          
          return (
            <Card 
              key={step.id} 
              className={`transition-all ${isCompleted ? 'bg-muted border-border' : 'bg-card border-border hover:border-primary/50 shadow-sm'}`}
              data-testid={`card-step-${step.id}`}
            >
              <div className="p-6 flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="shrink-0 flex items-center justify-center">
                  {isCompleted ? (
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  ) : (
                    <Circle className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <h3 className={`text-lg font-bold ${isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                      {step.title}
                    </h3>
                    {step.isRequired && !isCompleted && (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-destructive/15 text-destructive uppercase tracking-wide">
                        Required
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground capitalize">
                      {step.category}
                    </span>
                  </div>
                  <p className={`text-sm ${isCompleted ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                    {step.description}
                  </p>
                </div>
                
                <div className="shrink-0 pt-2 sm:pt-0">
                  {!isCompleted ? (
                    <Button 
                      onClick={() => handleComplete(step.id)}
                      disabled={completeStep.isPending}
                      className="w-full sm:w-auto shadow-sm"
                      data-testid={`button-complete-step-${step.id}`}
                    >
                      Complete Step <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  ) : (
                    <Button variant="ghost" disabled className="w-full sm:w-auto text-success font-medium">
                      Completed
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
