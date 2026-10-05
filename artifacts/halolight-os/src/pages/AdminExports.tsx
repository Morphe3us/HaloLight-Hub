import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getAuthToken } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  Download, FileArchive, FileText, Users, Layers,
  ReceiptText, FileSignature, Calendar, LifeBuoy,
  Monitor, Package, RefreshCw, AlertCircle,
} from "lucide-react";
import { EmptyState, Notice, PageHeader, Section } from "@/components/page";

interface ExportLog {
  id: string;
  userId: string;
  userEmail: string | null;
  exportType: string;
  format: string;
  scope: string;
  fileCount: number | null;
  recordCounts: Record<string, number> | null;
  createdAt: string;
}

interface ExportHistoryResponse {
  items: ExportLog[];
  total: number;
}

async function apiFetch<T>(path: string): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function downloadFile(path: string, filename: string) {
  const token = await getAuthToken();
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function dateSuffix() {
  return new Date().toISOString().slice(0, 10);
}

const ENTITIES = [
  { key: "leads", labelKey: "admin_exports.entity_leads", icon: Layers },
  { key: "quotes", labelKey: "admin_exports.entity_quotes", icon: FileText },
  { key: "contracts", labelKey: "admin_exports.entity_contracts", icon: FileSignature },
  { key: "invoices", labelKey: "admin_exports.entity_invoices", icon: ReceiptText },
  { key: "events", labelKey: "admin_exports.entity_events", icon: Calendar },
  { key: "support-tickets", labelKey: "admin_exports.entity_support_tickets", icon: LifeBuoy },
  { key: "equipment", labelKey: "admin_exports.entity_equipment", icon: Monitor },
  { key: "consumables", labelKey: "admin_exports.entity_consumables", icon: Package },
  { key: "clients", labelKey: "admin_exports.entity_clients", icon: Users },
] as const;

type EntityKey = (typeof ENTITIES)[number]["key"];

function formatTypeLabel(type: string) {
  return type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ScopeBadge({ scope }: { scope: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={`capitalize text-xs font-normal ${scope === "workspace" ? "text-foreground" : "text-muted-foreground"}`}>
      {t(`admin_exports.scope_${scope}`, { defaultValue: scope })}
    </Badge>
  );
}

function FormatBadge({ format }: { format: string }) {
  return (
    <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {format.toUpperCase()}
    </span>
  );
}

export default function AdminExports() {
  const { t } = useTranslation();
  const [sep, setSep] = useState<"comma" | "semicolon">("comma");
  const [downloading, setDownloading] = useState<string | null>(null);

  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = useQuery<ExportHistoryResponse>({
    queryKey: ["export-history"],
    queryFn: () => apiFetch<ExportHistoryResponse>("/exports/history?limit=50"),
  });

  const sepParam = sep === "semicolon" ? "?sep=semicolon" : "";

  async function handleDownload(key: string, path: string, filename: string) {
    setDownloading(key);
    try {
      await downloadFile(path, filename);
      toast({ title: t("admin_exports.toast_downloaded"), description: filename });
      setTimeout(() => refetchHistory(), 800);
    } catch (err) {
      toast({ title: t("admin_exports.toast_failed"), description: (err as Error).message, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }

  const date = dateSuffix();

  return (
    <div className="space-y-10">
      <PageHeader
        title={t("admin_exports.title")}
        description={t("admin_exports.subtitle")}
      />

      {/* CSV Separator Option */}
      <Section title={t("admin_exports.settings_title")} description={t("admin_exports.settings_desc")}>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{t("admin_exports.separator_label")}</span>
            <Select value={sep} onValueChange={(v) => setSep(v as "comma" | "semicolon")}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comma">{t("admin_exports.sep_comma")}</SelectItem>
                <SelectItem value="semicolon">{t("admin_exports.sep_semicolon")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      {/* Full Workspace ZIP */}
      <Section
        title={t("admin_exports.workspace_title")}
        description={<>
          {t("admin_exports.workspace_desc_prefix")}{" "}
          <code className="text-xs bg-muted px-1 rounded">metadata.json</code>{t("admin_exports.workspace_desc_suffix")}
        </>}
      >
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex-1 text-[13px] text-muted-foreground">
              {t("admin_exports.includes")}
            </div>
            <Button
              onClick={() =>
                handleDownload(
                  "workspace-zip",
                  `/exports/workspace-zip${sepParam}`,
                  `halolight-workspace-export-${date}.zip`
                )
              }
              disabled={downloading === "workspace-zip"}
              size="sm"
              className="gap-2 shrink-0"
            >
              {downloading === "workspace-zip" ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <FileArchive className="h-4 w-4 stroke-[1.75]" />
              )}
              {downloading === "workspace-zip" ? t("admin_exports.generating") : t("admin_exports.download_zip")}
            </Button>
          </div>
        </div>
      </Section>

      {/* Individual Entity CSVs */}
      <Section
        title={t("admin_exports.individual_title")}
        description={t("admin_exports.individual_desc")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-xl border border-border overflow-hidden">
          {ENTITIES.map(({ key, labelKey, icon: Icon }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-2 px-4 py-3 bg-card hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className="h-4 w-4 stroke-[1.75] text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">{t(labelKey)}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  handleDownload(
                    key,
                    `/exports/csv/${key}${sepParam}`,
                    `halolight-${key}-${date}.csv`
                  )
                }
                disabled={downloading === key}
                className="gap-1.5 shrink-0 text-muted-foreground hover:text-foreground"
              >
                {downloading === key ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3 stroke-[1.75]" />
                )}
                CSV
              </Button>
            </div>
          ))}
        </div>
      </Section>

      {/* Export Audit Log */}
      <Section
        title={t("admin_exports.audit_title")}
        description={t("admin_exports.audit_desc")}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchHistory()}
            className="gap-2 text-muted-foreground"
          >
            <RefreshCw className="h-3 w-3 stroke-[1.75]" />
            {t("admin_exports.refresh")}
          </Button>
        }
      >
        <div className="space-y-3">
          {historyLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          )}
          {historyError && (
            <Notice icon={AlertCircle} title={t("admin_exports.history_failed")} />
          )}
          {history && history.items.length === 0 && (
            <EmptyState text={t("admin_exports.no_exports")} />
          )}
          {history && history.items.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[13px] font-normal text-muted-foreground">{t("admin_exports.col_type")}</TableHead>
                    <TableHead className="text-[13px] font-normal text-muted-foreground">{t("admin_exports.col_format")}</TableHead>
                    <TableHead className="text-[13px] font-normal text-muted-foreground">{t("admin_exports.col_scope")}</TableHead>
                    <TableHead className="text-[13px] font-normal text-muted-foreground">{t("admin_exports.col_exported_by")}</TableHead>
                    <TableHead className="text-[13px] font-normal text-muted-foreground">{t("admin_exports.col_records")}</TableHead>
                    <TableHead className="text-[13px] font-normal text-muted-foreground">{t("admin_exports.col_when")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.items.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/40">
                      <TableCell className="font-medium text-sm">
                        {formatTypeLabel(log.exportType)}
                      </TableCell>
                      <TableCell>
                        <FormatBadge format={log.format} />
                      </TableCell>
                      <TableCell>
                        <ScopeBadge scope={log.scope} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.userEmail ?? log.userId.slice(0, 8) + "…"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {log.recordCounts
                          ? Object.entries(log.recordCounts)
                              .map(([k, v]) => `${v} ${k}`)
                              .join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
