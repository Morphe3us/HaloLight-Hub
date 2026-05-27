import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthToken } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  Download, FileArchive, FileText, Users, Layers,
  ReceiptText, FileSignature, Calendar, LifeBuoy,
  Monitor, Package, RefreshCw, History, AlertCircle,
} from "lucide-react";

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
  { key: "leads", label: "Leads", icon: Layers },
  { key: "quotes", label: "Quotes", icon: FileText },
  { key: "contracts", label: "Contracts", icon: FileSignature },
  { key: "invoices", label: "Invoices", icon: ReceiptText },
  { key: "events", label: "Events", icon: Calendar },
  { key: "support-tickets", label: "Support Tickets", icon: LifeBuoy },
  { key: "equipment", label: "Equipment", icon: Monitor },
  { key: "consumables", label: "Consumables", icon: Package },
  { key: "clients", label: "Clients", icon: Users },
] as const;

type EntityKey = (typeof ENTITIES)[number]["key"];

function formatTypeLabel(type: string) {
  return type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <Badge variant={scope === "workspace" ? "default" : "secondary"} className="capitalize text-xs">
      {scope}
    </Badge>
  );
}

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, string> = {
    zip: "bg-info/10 text-info border-info/20",
    json: "bg-warning/10 text-warning border-warning/20",
    csv: "bg-success/10 text-success border-success/20",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${colors[format] ?? "bg-muted text-muted-foreground"}`}>
      {format.toUpperCase()}
    </span>
  );
}

export default function AdminExports() {
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
      toast({ title: "Export downloaded", description: filename });
      setTimeout(() => refetchHistory(), 800);
    } catch (err) {
      toast({ title: "Export failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }

  const date = dateSuffix();

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Data Exports</h1>
        <p className="text-sm text-muted-foreground">
          Download workspace data as CSV or ZIP. All exports are logged for audit purposes.
        </p>
      </div>

      {/* CSV Separator Option */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Export Settings</CardTitle>
          <CardDescription>Choose a CSV separator. Use semicolon for European Excel compatibility.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">CSV separator:</span>
            <Select value={sep} onValueChange={(v) => setSep(v as "comma" | "semicolon")}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comma">Comma ( , ) — default</SelectItem>
                <SelectItem value="semicolon">Semicolon ( ; ) — EU Excel</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Full Workspace ZIP */}
      <Card className="shadow-sm border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileArchive className="h-5 w-5 text-primary" />
            <CardTitle>Full Workspace Export</CardTitle>
          </div>
          <CardDescription>
            Download all data as a single ZIP file containing 9 CSV files and a{" "}
            <code className="text-xs bg-muted px-1 rounded">metadata.json</code>. Admin only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex-1 text-sm text-muted-foreground">
              Includes: leads, quotes, contracts, invoices, events, support tickets, equipment, consumables, clients
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
              className="gap-2 shrink-0"
            >
              {downloading === "workspace-zip" ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <FileArchive className="h-4 w-4" />
              )}
              {downloading === "workspace-zip" ? "Generating…" : "Download ZIP"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Individual Entity CSVs */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Individual CSV Exports</CardTitle>
          </div>
          <CardDescription>
            Download a single entity as a UTF-8 BOM CSV file. Excel-friendly, fully escaped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ENTITIES.map(({ key, label, icon: Icon }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-2 p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{label}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleDownload(
                      key,
                      `/exports/csv/${key}${sepParam}`,
                      `halolight-${key}-${date}.csv`
                    )
                  }
                  disabled={downloading === key}
                  className="gap-1.5 shrink-0"
                >
                  {downloading === key ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  CSV
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Export Audit Log */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Export Audit Log</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchHistory()}
              className="gap-2 text-muted-foreground"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          </div>
          <CardDescription>
            Every export is logged with who exported, what, in which format, and when.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          )}
          {historyError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Failed to load export history.</AlertDescription>
            </Alert>
          )}
          {history && history.items.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No exports yet. Download something above to see it logged here.
            </div>
          )}
          {history && history.items.length > 0 && (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Exported by</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.items.map((log) => (
                    <TableRow key={log.id}>
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
                      <TableCell className="text-sm text-muted-foreground">
                        {log.recordCounts
                          ? Object.entries(log.recordCounts)
                              .map(([k, v]) => `${v} ${k}`)
                              .join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
