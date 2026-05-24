import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getAuthToken } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, Download, Copy, Check, AlertTriangle, RefreshCw, Terminal, HardDrive, Table2, Clock } from "lucide-react";

interface BackupStatus {
  tableCount: number;
  estimatedSize: string;
  sizeBytes: number;
  tables: Array<{ name: string; rowCount: number }>;
  databaseName: string;
  checkedAt: string;
}

interface BackupExport {
  message: string;
  filename: string;
  pgDumpCommand: string;
  tarCommand: string;
  instructions: string[];
  automationExample: string;
  generatedAt: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchBackupStatus(): Promise<BackupStatus> {
  return apiFetch<BackupStatus>("/api/admin/backup/status");
}

async function requestBackupExport(): Promise<BackupExport> {
  return apiFetch<BackupExport>("/api/admin/backup/export", { method: "POST" });
}

function CopyableCode({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex items-start gap-2">
        <pre className="flex-1 text-xs bg-muted rounded-lg px-4 py-3 overflow-x-auto text-foreground font-mono leading-relaxed">
          {code}
        </pre>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 h-8 w-8"
          onClick={handleCopy}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  );
}

export default function AdminBackup() {
  const { t } = useTranslation();
  const [exportResult, setExportResult] = useState<BackupExport | null>(null);

  const { data: status, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin", "backup", "status"],
    queryFn: fetchBackupStatus,
    refetchInterval: false,
  });

  const exportMutation = useMutation({
    mutationFn: requestBackupExport,
    onSuccess: (data) => {
      setExportResult(data);
    },
  });

  return (
    <div className="space-y-6" data-testid="page-admin-backup">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("backup.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("backup.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
          {t("backup.refresh")}
        </Button>
      </div>

      {/* Warning banner */}
      <Alert className="border-warning/30 bg-warning/5">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <AlertDescription className="text-warning font-medium">
          {t("backup.warning")}
        </AlertDescription>
      </Alert>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Table2 className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("backup.table_count")}
              </span>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold text-foreground">{status?.tableCount ?? "—"}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-success/10 flex items-center justify-center">
                <HardDrive className="w-4 h-4 text-success" />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("backup.estimated_size")}
              </span>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-bold text-foreground">{status?.estimatedSize ?? "—"}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center">
                <Database className="w-4 h-4 text-accent-foreground" />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("backup.database_label")}
              </span>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-xl font-bold text-foreground truncate">{status?.databaseName ?? "—"}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table stats */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Table2 className="w-4 h-4 text-muted-foreground" />
              {t("backup.table_row_counts")}
            </CardTitle>
            {status?.checkedAt && (
              <CardDescription className="flex items-center gap-1 text-xs">
                <Clock className="w-3 h-3" />
                {t("backup.checked_prefix")} {new Date(status.checkedAt).toLocaleTimeString()}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9" />)}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t("backup.col_table")}</TableHead>
                      <TableHead className="text-xs text-right">{t("backup.col_rows")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status?.tables.slice(0, 12).map((table) => (
                      <TableRow key={table.name}>
                        <TableCell className="text-sm font-mono py-2">{table.name}</TableCell>
                        <TableCell className="text-sm text-right py-2 text-muted-foreground">
                          {table.rowCount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Export */}
        <div className="space-y-4">
          <Card className="border border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="w-4 h-4 text-muted-foreground" />
                {t("backup.export")}
              </CardTitle>
              <CardDescription>{t("backup.export_desc")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <Button
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending}
                className="w-full"
              >
                <Terminal className="w-4 h-4 mr-2" />
                {exportMutation.isPending ? t("backup.exporting") : t("backup.export")}
              </Button>

              {exportMutation.isSuccess && exportResult && (
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-success font-medium flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> {t("backup.export_success")}
                  </p>

                  <CopyableCode
                    code={exportResult.pgDumpCommand}
                    label={t("backup.pg_dump_label")}
                  />
                  <CopyableCode
                    code={exportResult.tarCommand}
                    label={t("backup.tar_label")}
                  />
                </div>
              )}

              {exportMutation.isError && (
                <p className="text-sm text-destructive">{(exportMutation.error as Error).message}</p>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="w-4 h-4 text-muted-foreground" />
                {t("backup.instructions")}
              </CardTitle>
              <CardDescription>{t("backup.instructions_desc")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <ol className="space-y-2">
                {([
                  t("backup.step_1"),
                  t("backup.step_2"),
                  t("backup.step_3"),
                  t("backup.step_4"),
                  t("backup.step_5"),
                ] as string[]).map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="border-t border-border pt-4">
                <CopyableCode
                  code={`0 2 * * * pg_dump "$DATABASE_URL" --format=custom --compress=9 --file="/backups/halolight-$(date +%Y%m%d).dump"`}
                  label={t("backup.cron_label")}
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="secondary">{t("backup.badge_r2")}</Badge>
                <Badge variant="secondary">{t("backup.badge_s3")}</Badge>
                <Badge variant="secondary">{t("backup.badge_pg")}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
