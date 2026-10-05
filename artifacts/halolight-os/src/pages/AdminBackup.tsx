import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getAuthToken } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, Check, AlertTriangle, RefreshCw, Terminal, Clock } from "lucide-react";
import { Notice, PageHeader, Section, Stat, StatGrid } from "@/components/page";

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
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="flex items-start gap-2">
        <pre className="flex-1 text-xs bg-muted/60 border border-border rounded-lg px-4 py-3 overflow-x-auto text-foreground font-mono leading-relaxed">
          {code}
        </pre>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 h-8 w-8"
          onClick={handleCopy}
        >
          {copied ? <Check className="w-3.5 h-3.5 stroke-[1.75] text-success" /> : <Copy className="w-3.5 h-3.5 stroke-[1.75]" />}
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

  const loadingValue = (width: string) => <span className={`inline-block h-7 ${width} animate-pulse rounded-md bg-muted align-middle`} />;

  return (
    <div className="space-y-10" data-testid="page-admin-backup">
      <PageHeader
        title={t("backup.title")}
        description={t("backup.subtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`w-4 h-4 mr-2 stroke-[1.75] ${isRefetching ? "animate-spin" : ""}`} />
            {t("backup.refresh")}
          </Button>
        }
      />

      <Notice tone="warning" icon={AlertTriangle} title={t("backup.warning")} />

      <StatGrid className="sm:grid-cols-3 md:grid-cols-3">
        <Stat label={t("backup.table_count")} value={isLoading ? loadingValue("w-16") : status?.tableCount ?? "—"} />
        <Stat label={t("backup.estimated_size")} value={isLoading ? loadingValue("w-20") : status?.estimatedSize ?? "—"} />
        <Stat
          label={t("backup.database_label")}
          value={isLoading ? loadingValue("w-24") : <span className="block truncate text-lg">{status?.databaseName ?? "—"}</span>}
          className="col-span-2 sm:col-span-1"
        />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-10">
        {/* Table stats */}
        <Section
          title={t("backup.table_row_counts")}
          description={status?.checkedAt ? (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 stroke-[1.75]" />
              {t("backup.checked_prefix")} {new Date(status.checkedAt).toLocaleTimeString()}
            </span>
          ) : undefined}
        >
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9" />)}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[13px] font-normal text-muted-foreground">{t("backup.col_table")}</TableHead>
                      <TableHead className="text-[13px] font-normal text-muted-foreground text-right">{t("backup.col_rows")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status?.tables.slice(0, 12).map((table) => (
                      <TableRow key={table.name} className="hover:bg-muted/40">
                        <TableCell className="text-sm font-mono py-2">{table.name}</TableCell>
                        <TableCell className="text-sm text-right py-2 tabular-nums text-muted-foreground">
                          {table.rowCount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
        </Section>

        {/* Export */}
        <div className="space-y-10">
          <Section title={t("backup.export")} description={t("backup.export_desc")}>
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <Button
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending}
                className="w-full"
              >
                <Terminal className="w-4 h-4 mr-2 stroke-[1.75]" />
                {exportMutation.isPending ? t("backup.exporting") : t("backup.export")}
              </Button>

              {exportMutation.isSuccess && exportResult && (
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-success font-medium flex items-center gap-1.5">
                    <Check className="w-4 h-4 stroke-[1.75]" /> {t("backup.export_success")}
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
            </div>
          </Section>

          {/* Instructions */}
          <Section title={t("backup.instructions")} description={t("backup.instructions_desc")}>
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <ol className="space-y-2">
                {([
                  t("backup.step_1"),
                  t("backup.step_2"),
                  t("backup.step_3"),
                  t("backup.step_4"),
                  t("backup.step_5"),
                ] as string[]).map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="shrink-0 w-4 text-right font-mono text-xs leading-5 tabular-nums text-muted-foreground/70">
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
                <Badge variant="outline" className="font-normal text-muted-foreground">{t("backup.badge_r2")}</Badge>
                <Badge variant="outline" className="font-normal text-muted-foreground">{t("backup.badge_s3")}</Badge>
                <Badge variant="outline" className="font-normal text-muted-foreground">{t("backup.badge_pg")}</Badge>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
