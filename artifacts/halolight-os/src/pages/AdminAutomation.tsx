import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Zap, Play, Clock, CheckCircle2, XCircle, AlertTriangle,
  SkipForward, Activity, RefreshCw, Trash2, BarChart3,
  Bell, Mail, BookOpen, Headphones, TrendingUp, Package,
  ChevronRight, Loader2, ListFilter,
} from "lucide-react";
import { motion } from "framer-motion";
import { formatDistanceToNow, format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type AutomationRule = {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  actionType: string;
  triggerConfig: Record<string, unknown>;
  actionConfig: Record<string, unknown>;
  isEnabled: number;
  runCount: number;
  matchCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AutomationExecution = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string;
  rulesEvaluated: number;
  actionsFired: number;
  errors: number;
  status: string;
};

type AutomationLog = {
  id: string;
  executionId: string;
  ruleId: string;
  ruleName: string;
  triggerType: string;
  actionType: string;
  targetUserId: string | null;
  status: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

// ─── Labels & Icons ───────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  onboarding_stalled: "Onboarding Stalled",
  inactive_user: "Inactive User",
  low_academy_progress: "Low Academy Progress",
  no_events_created: "No Events Created",
  no_quotes_created: "No Quotes Created",
  low_consumable_stock: "Low Consumable Stock",
  warranty_expiring: "Warranty Expiring",
  high_performer_detected: "High Performer",
  upsell_opportunity_detected: "Upsell Opportunity",
  coaching_recommendation_generated: "Coaching Recommendation",
};

const ACTION_LABELS: Record<string, string> = {
  in_app_notification: "In-App Notification",
  email_template_generation: "Email Template",
  coaching_task_creation: "Coaching Task",
  support_follow_up: "Support Follow-Up",
  upsell_recommendation: "Upsell Recommendation",
  consumable_reorder_recommendation: "Reorder Alert",
};

const TRIGGER_COLORS: Record<string, string> = {
  onboarding_stalled: "bg-warning/15 text-warning",
  inactive_user: "bg-slate-100 text-slate-700",
  low_academy_progress: "bg-info/15 text-info",
  no_events_created: "bg-muted text-foreground",
  no_quotes_created: "bg-info/15 text-info",
  low_consumable_stock: "bg-warning/15 text-warning",
  warranty_expiring: "bg-destructive/15 text-destructive",
  high_performer_detected: "bg-success/15 text-success",
  upsell_opportunity_detected: "bg-teal-100 text-teal-800",
  coaching_recommendation_generated: "bg-info/15 text-info",
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  in_app_notification: Bell,
  email_template_generation: Mail,
  coaching_task_creation: BookOpen,
  support_follow_up: Headphones,
  upsell_recommendation: TrendingUp,
  consumable_reorder_recommendation: Package,
};

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  action_taken: { icon: CheckCircle2, color: "text-success", label: "Action Taken" },
  no_match: { icon: SkipForward, color: "text-slate-400", label: "No Match" },
  skipped_cooldown: { icon: Clock, color: "text-warning", label: "Cooldown" },
  error: { icon: XCircle, color: "text-destructive", label: "Error" },
  matched: { icon: CheckCircle2, color: "text-info", label: "Matched" },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminAutomation() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"rules" | "executions" | "logs">("rules");
  const [runningGlobal, setRunningGlobal] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<string>("");

  const { data: statsData } = useGetAutomationStats();
  const stats = statsData as Record<string, number> | undefined;

  const { data: rulesData, isLoading: rulesLoading } = useListAutomationRules();
  const rules: AutomationRule[] = (rulesData as { items?: AutomationRule[] })?.items ?? [];

  const { data: executionsData, isLoading: execLoading } = useListAutomationExecutions(
    { limit: 20 }
  );
  const executions: AutomationExecution[] =
    (executionsData as { items?: AutomationExecution[] })?.items ?? [];

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
    try {
      await runAll();
      invalidateAll();
    } finally {
      setRunningGlobal(false);
    }
  };

  const handleTrigger = async (ruleId: string) => {
    setTriggeringId(ruleId);
    try {
      await triggerRule({ id: ruleId });
      invalidateAll();
    } finally {
      setTriggeringId(null);
    }
  };

  const handleToggle = async (rule: AutomationRule) => {
    await updateRule({ id: rule.id, data: { isEnabled: rule.isEnabled === 0 } });
    invalidateAll();
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm("Delete this automation rule?")) return;
    await deleteRule({ id: ruleId });
    invalidateAll();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Automation Engine
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Rule-based automations that evaluate all clients hourly and fire targeted actions.
          </p>
        </div>
        <Button
          onClick={handleRunAll}
          disabled={runningGlobal}
          className="gap-2"
        >
          {runningGlobal ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {runningGlobal ? "Running…" : "Run All Now"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {[
          { label: "Total Rules", value: stats?.totalRules ?? 0, icon: Zap, color: "text-primary" },
          { label: "Enabled", value: stats?.enabledRules ?? 0, icon: CheckCircle2, color: "text-success" },
          { label: "Runs Today", value: stats?.todayExecutions ?? 0, icon: Activity, color: "text-info" },
          { label: "Total Runs", value: stats?.totalExecutions ?? 0, icon: RefreshCw, color: "text-slate-600" },
          { label: "Actions Today", value: stats?.actionsToday ?? 0, icon: Zap, color: "text-info" },
          { label: "Total Actions", value: stats?.totalActions ?? 0, icon: BarChart3, color: "text-teal-600" },
          { label: "Errors Today", value: stats?.errorsToday ?? 0, icon: AlertTriangle, color: "text-destructive" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["rules", "executions", "logs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Rules Tab */}
      {activeTab === "rules" && (
        <div className="space-y-3">
          {rulesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No automation rules found. Run the seed script to add default rules.
            </Card>
          ) : (
            rules.map((rule, i) => {
              const ActionIcon = ACTION_ICONS[rule.actionType] ?? Bell;
              const triggerColor = TRIGGER_COLORS[rule.triggerType] ?? "bg-slate-100 text-slate-700";
              const isTriggering = triggeringId === rule.id;

              return (
                <motion.div
                  key={rule.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Card className={`transition-opacity ${rule.isEnabled === 0 ? "opacity-60" : ""}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className="mt-0.5 h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <ActionIcon className="h-4 w-4 text-primary" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium text-sm">{rule.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${triggerColor}`}>
                              {TRIGGER_LABELS[rule.triggerType] ?? rule.triggerType}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                              {ACTION_LABELS[rule.actionType] ?? rule.actionType}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">{rule.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <RefreshCw className="h-3 w-3" />
                              {rule.runCount} runs
                            </span>
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              {rule.matchCount} matches
                            </span>
                            {rule.lastRunAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(rule.lastRunAt), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={rule.isEnabled === 1}
                            onCheckedChange={() => handleToggle(rule)}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs"
                            onClick={() => handleTrigger(rule.id)}
                            disabled={isTriggering}
                          >
                            {isTriggering ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                            Run
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(rule.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* Executions Tab */}
      {activeTab === "executions" && (
        <div className="space-y-3">
          {execLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : executions.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No executions yet. Click "Run All Now" to trigger the automation engine.
            </Card>
          ) : (
            executions.map((exec, i) => {
              const isOk = exec.status === "completed" && exec.errors === 0;
              const hasFailed = exec.status === "failed";

              return (
                <motion.div
                  key={exec.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                          hasFailed ? "bg-destructive/15" : isOk ? "bg-success/15" : "bg-warning/8"
                        }`}>
                          {hasFailed ? (
                            <XCircle className="h-4 w-4 text-destructive" />
                          ) : isOk ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-warning" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-medium text-sm">
                              {exec.triggeredBy === "scheduled"
                                ? "Scheduled Run"
                                : exec.triggeredBy === "manual"
                                ? "Manual Run"
                                : `Run by ${exec.triggeredBy.slice(0, 8)}…`}
                            </span>
                            <Badge variant={hasFailed ? "destructive" : "secondary"} className="text-xs">
                              {exec.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{format(new Date(exec.startedAt), "MMM d, HH:mm:ss")}</span>
                            {exec.finishedAt && (
                              <span>
                                {Math.round(
                                  (new Date(exec.finishedAt).getTime() - new Date(exec.startedAt).getTime())
                                )}ms
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm shrink-0">
                          <div className="text-center">
                            <p className="font-semibold">{exec.rulesEvaluated}</p>
                            <p className="text-xs text-muted-foreground">Rules</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-success">{exec.actionsFired}</p>
                            <p className="text-xs text-muted-foreground">Actions</p>
                          </div>
                          <div className="text-center">
                            <p className={`font-semibold ${exec.errors > 0 ? "text-destructive" : ""}`}>
                              {exec.errors}
                            </p>
                            <p className="text-xs text-muted-foreground">Errors</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === "logs" && (
        <div className="space-y-3">
          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
            {["", "action_taken", "no_match", "skipped_cooldown", "error"].map((f) => (
              <button
                key={f}
                onClick={() => setLogFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  logFilter === f
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                {f === "" ? "All" : STATUS_CONFIG[f]?.label ?? f}
              </button>
            ))}
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No logs yet. Trigger a run to see activity here.
            </Card>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Rule</th>
                    <th className="px-4 py-2 font-medium">Trigger</th>
                    <th className="px-4 py-2 font-medium">Action</th>
                    <th className="px-4 py-2 font-medium">Target</th>
                    <th className="px-4 py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => {
                    const sc = STATUS_CONFIG[log.status] ?? {
                      icon: Activity,
                      color: "text-slate-500",
                      label: log.status,
                    };
                    return (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2">
                          <div className={`flex items-center gap-1.5 ${sc.color}`}>
                            <sc.icon className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">{sc.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs font-medium max-w-[160px] truncate">
                          {log.ruleName}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${TRIGGER_COLORS[log.triggerType] ?? "bg-muted"}`}>
                            {TRIGGER_LABELS[log.triggerType] ?? log.triggerType}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {ACTION_LABELS[log.actionType] ?? log.actionType}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
                          {log.targetUserId
                            ? `${log.targetUserId.slice(0, 8)}…`
                            : log.status === "no_match"
                            ? "—"
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
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
