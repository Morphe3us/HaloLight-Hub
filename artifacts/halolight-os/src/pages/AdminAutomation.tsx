import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAutomationStats,
  useListAutomationRules,
  useListAutomationExecutions,
  useListAutomationLogs,
  useRunAutomation,
  useTriggerAutomationRule,
  useUpdateAutomationRule,
  useDeleteAutomationRule,
  getListAutomationRulesQueryKey,
  getGetAutomationStatsQueryKey,
  getListAutomationExecutionsQueryKey,
  getListAutomationLogsQueryKey,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Play, Clock, CheckCircle2, XCircle, AlertTriangle,
  SkipForward, Activity, RefreshCw, Trash2,
  Bell, Mail, BookOpen, Headphones, TrendingUp, Package,
  Loader2, ListFilter,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { EmptyState, PageHeader, Stat, StatGrid, type StatTone } from "@/components/page";

type AutomationRule = {
  id: string; name: string; description: string; triggerType: string; actionType: string;
  triggerConfig: Record<string, unknown>; actionConfig: Record<string, unknown>;
  isEnabled: number; runCount: number; matchCount: number; lastRunAt: string | null;
  createdAt: string; updatedAt: string;
};

type AutomationExecution = {
  id: string; startedAt: string; finishedAt: string | null; triggeredBy: string;
  rulesEvaluated: number; actionsFired: number; errors: number; status: string;
};

type AutomationLog = {
  id: string; executionId: string; ruleId: string; ruleName: string;
  triggerType: string; actionType: string; targetUserId: string | null;
  status: string; detail: Record<string, unknown>; createdAt: string;
};

// Déclencheurs : seul un point signale un statut (alerte / succès), le reste reste neutre.
const TRIGGER_DOTS: Record<string, string> = {
  onboarding_stalled: "bg-warning",
  low_consumable_stock: "bg-warning",
  warranty_expiring: "bg-destructive",
  high_performer_detected: "bg-success",
};

function TriggerBadge({ type, children }: { type: string; children: React.ReactNode }) {
  const dot = TRIGGER_DOTS[type];
  return (
    <Badge variant="outline" className="gap-1.5 text-xs font-normal text-foreground">
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />}
      {children}
    </Badge>
  );
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  in_app_notification: Bell,
  email_template_generation: Mail,
  coaching_task_creation: BookOpen,
  support_follow_up: Headphones,
  upsell_recommendation: TrendingUp,
  consumable_reorder_recommendation: Package,
};

const STATUS_ICONS: Record<string, { Icon: React.ElementType; color: string }> = {
  action_taken:     { Icon: CheckCircle2, color: "text-success" },
  no_match:         { Icon: SkipForward,  color: "text-muted-foreground" },
  skipped_cooldown: { Icon: Clock,        color: "text-warning" },
  skipped_preference: { Icon: SkipForward, color: "text-muted-foreground" },
  error:            { Icon: XCircle,      color: "text-destructive" },
  matched:          { Icon: CheckCircle2, color: "text-foreground" },
};

export default function AdminAutomation() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"rules" | "executions" | "logs">("rules");
  const [runningGlobal, setRunningGlobal] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<string>("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: statsData } = useGetAutomationStats();
  const stats = statsData as Record<string, number> | undefined;

  const { data: rulesData, isLoading: rulesLoading } = useListAutomationRules();
  const rules: AutomationRule[] = (rulesData as { items?: AutomationRule[] })?.items ?? [];

  const { data: executionsData, isLoading: execLoading } = useListAutomationExecutions({ limit: 20 });
  const executions: AutomationExecution[] = (executionsData as { items?: AutomationExecution[] })?.items ?? [];

  const { data: logsData, isLoading: logsLoading } = useListAutomationLogs(
    { limit: 100, ...(logFilter ? { status: logFilter } : {}) }
  );
  const logs: AutomationLog[] = (logsData as { items?: AutomationLog[] })?.items ?? [];

  const { mutateAsync: runAll } = useRunAutomation();
  const { mutateAsync: triggerRule } = useTriggerAutomationRule();
  const { mutateAsync: updateRule } = useUpdateAutomationRule();
  const { mutateAsync: deleteRule } = useDeleteAutomationRule();

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: getListAutomationRulesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetAutomationStatsQueryKey() });
    void qc.invalidateQueries({ queryKey: getListAutomationExecutionsQueryKey() });
    void qc.invalidateQueries({ queryKey: getListAutomationLogsQueryKey() });
  };

  const handleRunAll = async () => {
    setRunningGlobal(true);
    try { await runAll(); invalidateAll(); } finally { setRunningGlobal(false); }
  };

  const handleTrigger = async (ruleId: string) => {
    setTriggeringId(ruleId);
    try { await triggerRule({ id: ruleId }); invalidateAll(); } finally { setTriggeringId(null); }
  };

  const handleToggle = async (rule: AutomationRule) => {
    await updateRule({ id: rule.id, data: { isEnabled: rule.isEnabled === 0 } });
    invalidateAll();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteRule({ id: deleteId });
    setDeleteId(null);
    invalidateAll();
  };

  const triggerLabel = (key: string) => {
    const tKey = `admin_automation.trigger_${key}` as Parameters<typeof t>[0];
    return t(tKey);
  };
  const actionLabel = (key: string) => {
    const tKey = `admin_automation.action_${key}` as Parameters<typeof t>[0];
    return t(tKey);
  };
  const statusLabel = (key: string) => {
    const tKey = `admin_automation.status_${key}` as Parameters<typeof t>[0];
    const result = t(tKey);
    return result === tKey ? key : result;
  };

  const TABS = [
    { key: "rules" as const,      label: t("admin_automation.tab_rules") },
    { key: "executions" as const, label: t("admin_automation.tab_executions") },
    { key: "logs" as const,       label: t("admin_automation.tab_logs") },
  ];

  const STATS: { labelKey: string; value: number; tone?: StatTone }[] = [
    { labelKey: "admin_automation.stat_total",         value: stats?.totalRules ?? 0 },
    { labelKey: "admin_automation.stat_enabled",       value: stats?.enabledRules ?? 0 },
    { labelKey: "admin_automation.stat_runs_today",    value: stats?.todayExecutions ?? 0 },
    { labelKey: "admin_automation.stat_total_runs",    value: stats?.totalExecutions ?? 0 },
    { labelKey: "admin_automation.stat_actions_today", value: stats?.actionsToday ?? 0 },
    { labelKey: "admin_automation.stat_total_actions", value: stats?.totalActions ?? 0 },
    { labelKey: "admin_automation.stat_errors_today",  value: stats?.errorsToday ?? 0,      tone: (stats?.errorsToday ?? 0) > 0 ? "destructive" : undefined },
  ];

  return (
    <div className="space-y-8">
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin_automation.delete_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin_automation.delete_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin_automation.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={handleDelete}>
              {t("admin_automation.delete_btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PageHeader
        title={t("admin_automation.title")}
        description={t("admin_automation.subtitle")}
        actions={
          <Button onClick={handleRunAll} disabled={runningGlobal} size="sm" className="gap-2">
            {runningGlobal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 stroke-[1.75]" />}
            {runningGlobal ? t("admin_automation.running") : t("admin_automation.run_all")}
          </Button>
        }
      />

      <StatGrid className="md:grid-cols-4 lg:grid-cols-7">
        {STATS.map((s) => (
          <Stat key={s.labelKey} label={t(s.labelKey as Parameters<typeof t>[0])} value={s.value} tone={s.tone} />
        ))}
      </StatGrid>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-foreground text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Rules Tab */}
      {activeTab === "rules" && (
        <div>
          {rulesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <EmptyState text={t("admin_automation.no_rules")} />
          ) : (
            <ul className="rounded-xl border border-border bg-card divide-y divide-border">
            {rules.map((rule) => {
              const ActionIcon = ACTION_ICONS[rule.actionType] ?? Bell;
              const isTriggering = triggeringId === rule.id;

              return (
                <li key={rule.id} className={`px-4 py-3 transition-opacity ${rule.isEnabled === 0 ? "opacity-60" : ""}`}>
                      <div className="flex items-start gap-3">
                        <ActionIcon className="mt-0.5 h-4 w-4 stroke-[1.75] text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium text-sm text-foreground">{rule.name}</span>
                            <TriggerBadge type={rule.triggerType}>
                              {triggerLabel(rule.triggerType)}
                            </TriggerBadge>
                            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                              {actionLabel(rule.actionType)}
                            </Badge>
                          </div>
                          <p className="text-[13px] text-muted-foreground line-clamp-1">{rule.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground tabular-nums">
                            <span className="flex items-center gap-1">
                              <RefreshCw className="h-3 w-3 stroke-[1.75]" />
                              {t("admin_automation.runs", { count: rule.runCount })}
                            </span>
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 stroke-[1.75]" />
                              {t("admin_automation.matches", { count: rule.matchCount })}
                            </span>
                            {rule.lastRunAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 stroke-[1.75]" />
                                {formatDistanceToNow(new Date(rule.lastRunAt), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch checked={rule.isEnabled === 1} onCheckedChange={() => handleToggle(rule)} />
                          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => handleTrigger(rule.id)} disabled={isTriggering}>
                            {isTriggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 stroke-[1.75]" />}
                            {t("admin_automation.run_btn")}
                          </Button>
                          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(rule.id)}>
                            <Trash2 className="h-3.5 w-3.5 stroke-[1.75]" />
                          </Button>
                        </div>
                      </div>
                </li>
              );
            })}
            </ul>
          )}
        </div>
      )}

      {/* Executions Tab */}
      {activeTab === "executions" && (
        <div>
          {execLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : executions.length === 0 ? (
            <EmptyState text={t("admin_automation.no_executions")} />
          ) : (
            <ul className="rounded-xl border border-border bg-card divide-y divide-border">
            {executions.map((exec) => {
              const isOk = exec.status === "completed" && exec.errors === 0;
              const hasFailed = exec.status === "failed";

              let runLabel: string;
              if (exec.triggeredBy === "scheduled") runLabel = t("admin_automation.scheduled_run");
              else if (exec.triggeredBy === "manual") runLabel = t("admin_automation.manual_run");
              else runLabel = t("admin_automation.run_by", { id: exec.triggeredBy.slice(0, 8) });

              return (
                <li key={exec.id} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {hasFailed ? <XCircle className="h-4 w-4 stroke-[1.75] text-destructive shrink-0" />
                          : isOk ? <CheckCircle2 className="h-4 w-4 stroke-[1.75] text-success shrink-0" />
                          : <AlertTriangle className="h-4 w-4 stroke-[1.75] text-warning shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-medium text-sm text-foreground">{runLabel}</span>
                            <Badge variant="outline" className={`text-xs font-normal ${hasFailed ? "text-destructive" : "text-muted-foreground"}`}>{exec.status}</Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
                            <span>{format(new Date(exec.startedAt), "MMM d, HH:mm:ss")}</span>
                            {exec.finishedAt && (
                              <span>
                                {Math.round((new Date(exec.finishedAt).getTime() - new Date(exec.startedAt).getTime()))}ms
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm shrink-0">
                          <div className="text-center">
                            <p className="font-medium tabular-nums text-foreground">{exec.rulesEvaluated}</p>
                            <p className="text-xs text-muted-foreground">{t("admin_automation.col_rules")}</p>
                          </div>
                          <div className="text-center">
                            <p className="font-medium tabular-nums text-foreground">{exec.actionsFired}</p>
                            <p className="text-xs text-muted-foreground">{t("admin_automation.col_actions")}</p>
                          </div>
                          <div className="text-center">
                            <p className={`font-medium tabular-nums ${exec.errors > 0 ? "text-destructive" : "text-foreground"}`}>{exec.errors}</p>
                            <p className="text-xs text-muted-foreground">{t("admin_automation.col_errors")}</p>
                          </div>
                        </div>
                      </div>
                </li>
              );
            })}
            </ul>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <ListFilter className="h-4 w-4 stroke-[1.75] text-muted-foreground" />
            {["", "action_taken", "no_match", "skipped_cooldown", "skipped_preference", "error"].map((f) => (
              <button
                key={f}
                onClick={() => setLogFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  logFilter === f ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {f === "" ? t("admin_automation.filter_all") : statusLabel(f)}
              </button>
            ))}
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState text={t("admin_automation.no_logs")} />
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[13px] text-muted-foreground border-b border-border">
                    <th className="px-4 py-2.5 font-normal">{t("admin_automation.col_status")}</th>
                    <th className="px-4 py-2.5 font-normal">{t("admin_automation.col_rule")}</th>
                    <th className="px-4 py-2.5 font-normal">{t("admin_automation.col_trigger")}</th>
                    <th className="px-4 py-2.5 font-normal">{t("admin_automation.col_action")}</th>
                    <th className="px-4 py-2.5 font-normal">{t("admin_automation.col_target")}</th>
                    <th className="px-4 py-2.5 font-normal">{t("admin_automation.col_time")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => {
                    const sc = STATUS_ICONS[log.status] ?? { Icon: Activity, color: "text-muted-foreground" };
                    return (
                      <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <sc.Icon className={`h-3.5 w-3.5 stroke-[1.75] ${sc.color}`} />
                            <span className="text-xs text-foreground">{statusLabel(log.status)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-medium text-foreground max-w-[160px] truncate">{log.ruleName}</td>
                        <td className="px-4 py-2.5">
                          <TriggerBadge type={log.triggerType}>
                            {triggerLabel(log.triggerType)}
                          </TriggerBadge>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{actionLabel(log.actionType)}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                          {log.targetUserId ? `${log.targetUserId.slice(0, 8)}…` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
