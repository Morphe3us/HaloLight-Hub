import { useState, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, XCircle, Loader2, Play, RefreshCw,
  AlertTriangle, ArrowLeft, Video, ShieldAlert,
} from "lucide-react";

const LANG_LABELS: Record<string, string> = {
  en: "English", fr: "Français", de: "Deutsch", nl: "Nederlands",
  es: "Español", it: "Italiano", pt: "Português", pl: "Polski",
};

// Fixed collection ID → language mapping. Single source of truth — mirrors the backend exactly.
const COLLECTION_ID_TO_LANG: Record<string, string> = {
  "a8f1d88d-d78b-40a3-8110-3b573a1603e2": "de",
  "3e3b7105-0fd0-4f48-a223-9b0842e4e3e5": "es",
  "dba3c601-c795-43a6-9ee7-f48365a0e4de": "pt",
  "c415e75f-4c65-4314-bec2-fa968e1397ff": "pl",
  "50ecaca6-0542-4c91-af26-d3006fa02b08": "it",
  "630999cb-1df6-43f2-8cff-dc49950be601": "en",
  "b7b1ee25-e810-4784-bf85-3a476114ad1a": "nl",
  "476e5f64-87b2-4dee-8a80-5ef6cc544378": "fr",
};

type BunnyStatus = {
  connected: boolean; error?: string;
  libraryId?: string; libraryName?: string;
  pullZoneHostname?: string; videoCount?: number;
};

type BunnyCollection = {
  guid: string; name: string; videoCount: number; lang: string | null; langKnown: boolean;
};

type BunnyVideo = {
  guid: string; title: string; collectionId: string;
  durationSeconds: number; status: number; statusLabel: string; isReady: boolean;
  embedUrl: string; thumbnailUrl: string; previewUrl: string;
  width: number; height: number;
};

type AdminCourse = { id: string; title: string; modules: AdminModule[] };
type AdminModule = { id: string; title: string; lessons: AdminLesson[] };
type AdminLesson = { id: string; title: string };

type ImportRow = {
  video: BunnyVideo;
  courseId: string;
  moduleId: string;
  lessonId: string;
  newModuleName: string;
  newLessonName: string;
  selected: boolean;
};

type ImportResult = {
  imported: number;
  created: number;
  updated: number;
  errors: string[];
  collectionName?: string;
  collectionId?: string;
  langCode?: string;
};

async function apiFetch(path: string, opts?: RequestInit) {
  return customFetch<any>(`/api${path}`, { ...opts, responseType: "json" });
}

function fmtDuration(s: number) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function StatusBadge({ label, isReady }: { label: string; isReady: boolean }) {
  const { t } = useTranslation();
  const dot = (cls: string) => <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />;
  if (isReady) return <Badge variant="outline" className="gap-1.5 text-xs font-normal">{dot("bg-success")}{t("admin_bunny.status_ready")}</Badge>;
  if (label === "processing" || label === "transcoding") return <Badge variant="outline" className="gap-1.5 text-xs font-normal">{dot("bg-warning")}{label}</Badge>;
  if (label === "error" || label === "upload_failed") return <Badge variant="outline" className="gap-1.5 text-xs font-normal">{dot("bg-destructive")}{label}</Badge>;
  return <Badge variant="outline" className="gap-1.5 text-xs font-normal text-muted-foreground">{dot("bg-muted-foreground/50")}{label}</Badge>;
}

// ─── Video Preview Dialog ──────────────────────────────────────────────────

function VideoPreviewDialog({ video, open, onClose }: { video: BunnyVideo | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  if (!video) return null;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate">{video.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
            <iframe
              src={video.embedUrl}
              className="w-full h-full"
              allow="autoplay"
              allowFullScreen
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div><span className="font-medium text-foreground">{t("admin_bunny.video_id")}</span> {video.guid}</div>
            <div><span className="font-medium text-foreground">{t("admin_bunny.duration")}</span> {fmtDuration(video.durationSeconds)}</div>
            <div><span className="font-medium text-foreground">{t("admin_bunny.status")}</span> {video.statusLabel}</div>
            <div><span className="font-medium text-foreground">{t("admin_bunny.resolution")}</span> {video.width}×{video.height}</div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-normal text-muted-foreground">{t("admin_bunny.embed_url")}</Label>
            <div className="flex items-center gap-2 bg-muted rounded px-3 py-2 text-xs font-mono break-all">
              {video.embedUrl}
            </div>
          </div>
          {video.thumbnailUrl && (
            <div className="flex items-center gap-3">
              <img src={video.thumbnailUrl} alt={t("admin_bunny.thumbnail_alt")} className="h-12 w-20 rounded object-cover bg-muted" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <span className="text-xs text-muted-foreground">{t("admin_bunny.thumbnail_loaded")}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("admin_bunny.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Confirmation Dialog ───────────────────────────────────────────────────

function ConfirmImportDialog({
  open, onClose, onConfirm, importing,
  collectionName, langCode, count,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  importing: boolean;
  collectionName: string;
  langCode: string;
  count: number;
}) {
  const { t } = useTranslation();
  const langLabel = LANG_LABELS[langCode] ?? langCode.toUpperCase();
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !importing) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 stroke-[1.75] text-warning" /> {t("admin_bunny.confirm_title")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4 text-sm">
            <p className="font-medium text-foreground mb-1">{t("admin_bunny.import_summary")}</p>
            <p className="text-muted-foreground">
              {t("admin_bunny.summary_text", { count, collection: collectionName, language: `${langLabel} (${langCode.toUpperCase()})` })}
            </p>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 pl-1">
            <li>• {t("admin_bunny.rule_only_prefix")} <code className="font-mono bg-muted px-1 rounded">videoAssets.{langCode}</code> {t("admin_bunny.rule_only_suffix")}</li>
            <li>• {t("admin_bunny.rule_no_other")}</li>
            <li>• {t("admin_bunny.rule_untouched")}</li>
            <li>• {t("admin_bunny.rule_overwrite_prefix")} <code className="font-mono bg-muted px-1 rounded">{langCode}</code>{t("admin_bunny.rule_overwrite_suffix")}</li>
          </ul>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={importing}>{t("admin_bunny.cancel")}</Button>
          <Button onClick={onConfirm} disabled={importing}>
            {importing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {t("admin_bunny.import_btn", { count, lang: langCode.toUpperCase() })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function AdminBunnyImporter({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [selectedCollection, setSelectedCollection] = useState<BunnyCollection | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [previewVideo, setPreviewVideo] = useState<BunnyVideo | null>(null);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [importing, setImporting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Status
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<BunnyStatus>({
    queryKey: ["bunny-status"],
    queryFn: () => apiFetch("/admin/bunny/status"),
  });

  // Collections
  const { data: collectionsData, isLoading: collectionsLoading, refetch: refetchCollections } = useQuery<{ items: BunnyCollection[]; total: number }>({
    queryKey: ["bunny-collections"],
    queryFn: () => apiFetch("/admin/bunny/collections"),
    enabled: !!status?.connected,
  });
  const collections = collectionsData?.items ?? [];

  // Videos for selected collection — fetches ALL pages server-side
  const { data: videosData, isLoading: videosLoading } = useQuery<{ items: BunnyVideo[]; total: number; totalReported: number; pagesLoaded: number; requestedCollectionId: string; detectedLanguage: string; totalVideosReturned: number; pagesFetched: number }>({
    queryKey: ["bunny-videos", selectedCollection?.guid],
    queryFn: () => apiFetch(`/admin/bunny/collections/${selectedCollection!.guid}/videos`),
    enabled: !!selectedCollection,
  });
  const videos = videosData?.items ?? [];

  // Courses for assignment
  useEffect(() => {
    apiFetch("/admin/academy/courses").then((data: { items: { id: string; title: Record<string, string>; modules?: { id: string; title: Record<string, string>; lessons: { id: string; title: Record<string, string> }[] }[] }[] }) => {
      setCourses((data.items ?? []).map(c => ({
        id: c.id,
        title: (c.title as Record<string, string>).en ?? "Untitled",
        modules: (c.modules ?? []).map(m => ({
          id: m.id,
          title: (m.title as Record<string, string>).en ?? "Untitled",
          lessons: (m.lessons ?? []).map(l => ({
            id: l.id,
            title: (l.title as Record<string, string>).en ?? "Untitled",
          })),
        })),
      })));
    }).catch(() => {});
  }, []);

  // When videos load, build import rows (no lang field — lang is collection-level)
  useEffect(() => {
    if (!videos.length) { setImportRows([]); return; }
    setImportRows(videos.map(v => ({
      video: v,
      courseId: "",
      moduleId: "",
      lessonId: "",
      newModuleName: "",
      newLessonName: v.title,
      selected: v.isReady,
    })));
  }, [videos]);

  const updateRow = (idx: number, patch: Partial<ImportRow>) => {
    setImportRows(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const selectedRows = importRows.filter(r => r.selected);

  // The authoritative language — derived strictly from fixed collection ID map, never user-editable
  const selectedLang = selectedCollection ? (COLLECTION_ID_TO_LANG[selectedCollection.guid] ?? "") : "";
  const langLabel = selectedLang ? (LANG_LABELS[selectedLang] ?? selectedLang.toUpperCase()) : "";

  const handleImportClick = () => {
    if (!selectedRows.length) return;
    if (selectedRows.some((row) => !row.video.isReady)) {
      toast({ title: t("admin_bunny.toast_only_ready"), variant: "destructive" });
      return;
    }
    if (!selectedLang) {
      toast({ title: t("admin_bunny.toast_unmapped"), variant: "destructive" });
      return;
    }
    setShowConfirm(true);
  };

  const handleImportConfirm = async () => {
    setImporting(true);
    try {
      const items = selectedRows.map(r => ({
        videoId: r.video.guid,
        collectionId: r.video.collectionId, // backend enforces lang via COLLECTION_ID_TO_LANG
        embedUrl: r.video.embedUrl,
        thumbnailUrl: r.video.thumbnailUrl,
        previewUrl: r.video.previewUrl || undefined,
        durationSeconds: r.video.durationSeconds,
        videoTitle: r.video.title,
        courseId: r.courseId || undefined,
        moduleId: r.moduleId !== "__new__" ? r.moduleId || undefined : undefined,
        lessonId: r.lessonId !== "__new__" ? r.lessonId || undefined : undefined,
        newModuleName: r.moduleId === "__new__" ? r.newModuleName || undefined : undefined,
        newLessonName: r.newLessonName || r.video.title,
      }));
      const result = await apiFetch("/admin/bunny/import", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      setImportResult({
        ...result,
        collectionName: selectedCollection?.name,
        collectionId: selectedCollection?.guid,
        langCode: selectedLang,
      });
      setShowConfirm(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });
      if ((result.errors?.length ?? 0) === 0) {
        toast({ title: t("admin_bunny.toast_imported", { count: result.imported, lang: selectedLang.toUpperCase() }) });
      } else {
        toast({ title: t("admin_bunny.toast_imported_errors", { count: result.errors.length }), variant: "destructive" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: t("admin_bunny.toast_failed", { message: msg }), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const getCourseModules = (courseId: string) => courses.find(c => c.id === courseId)?.modules ?? [];
  const getModuleLessons = (courseId: string, moduleId: string) =>
    getCourseModules(courseId).find(m => m.id === moduleId)?.lessons ?? [];

  return (
    <div className="space-y-8">
      <VideoPreviewDialog video={previewVideo} open={!!previewVideo} onClose={() => setPreviewVideo(null)} />
      <ConfirmImportDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleImportConfirm}
        importing={importing}
        collectionName={selectedCollection?.name ?? ""}
        langCode={selectedLang}
        count={selectedRows.length}
      />

      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 stroke-[1.75]" /> {t("admin_bunny.back")}
        </Button>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {t("admin_bunny.title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{t("admin_bunny.subtitle")}</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => { refetchStatus(); refetchCollections(); }}>
            <RefreshCw className="w-3.5 h-3.5 stroke-[1.75]" /> {t("admin_bunny.refresh")}
          </Button>
        </div>
      </div>

      {/* Connection status */}
      {statusLoading ? (
        <Card><CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> {t("admin_bunny.checking")}</CardContent></Card>
      ) : status?.connected ? (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{t("admin_bunny.connected")}</p>
              <p className="text-xs text-muted-foreground">{t("admin_bunny.library_info", { name: status.libraryName, count: status.videoCount, id: status.libraryId })}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <XCircle className="w-4 h-4 stroke-[1.75] text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">{t("admin_bunny.not_connected")}</p>
              <p className="text-xs text-muted-foreground">{status?.error ?? t("admin_bunny.missing_env")}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {status?.connected && (
        <>
          {/* Step 1 — Collection language mapping table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {t("admin_bunny.step1_title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {collectionsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> {t("admin_bunny.loading_collections")}</div>
              ) : collections.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{t("admin_bunny.no_collections")}</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground pb-1">
                    {t("admin_bunny.languages_locked")}
                  </p>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-3 py-2 text-[13px] font-normal text-muted-foreground">{t("admin_bunny.col_name")}</th>
                          <th className="text-left px-3 py-2 text-[13px] font-normal text-muted-foreground">{t("admin_bunny.collection_id")}</th>
                          <th className="text-left px-3 py-2 text-[13px] font-normal text-muted-foreground">{t("admin_bunny.col_videos")}</th>
                          <th className="text-left px-3 py-2 text-[13px] font-normal text-muted-foreground">{t("admin_bunny.col_detected_language")}</th>
                          <th className="px-3 py-2 w-24"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {collections.map((col, i) => {
                          const fixedLang = COLLECTION_ID_TO_LANG[col.guid];
                          const langKnown = !!fixedLang;
                          const isSelected = selectedCollection?.guid === col.guid;
                          return (
                            <tr key={col.guid} className={`border-b border-border last:border-0 transition-colors ${isSelected ? "bg-muted" : "hover:bg-muted/50"}`}>
                              <td className="px-3 py-2 font-medium text-foreground">{col.name}</td>
                              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{col.guid}</td>
                              <td className="px-3 py-2 text-muted-foreground text-xs">{col.videoCount}</td>
                              <td className="px-3 py-2">
                                {langKnown ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                                    <span className="text-xs font-medium text-foreground">
                                      {LANG_LABELS[fixedLang]} ({fixedLang.toUpperCase()})
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                                    <span className="text-xs text-destructive">{t("admin_bunny.unknown_blocked")}</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <Button
                                  variant={isSelected ? "default" : "outline"}
                                  size="sm"
                                  className="h-7 text-xs w-full"
                                  disabled={!langKnown}
                                  onClick={() => setSelectedCollection(col)}
                                >
                                  {isSelected ? t("admin_bunny.selected") : t("admin_bunny.browse")}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {collections.some(c => !COLLECTION_ID_TO_LANG[c.guid]) && (
                    <p className="text-xs text-warning flex items-center gap-1.5 pt-1">
                      <AlertTriangle className="w-3.5 h-3.5 stroke-[1.75]" /> {t("admin_bunny.unknown_warning")}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2 — Videos */}
          {selectedCollection && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    {t("admin_bunny.step2_title", { name: selectedCollection.name })}
                  </CardTitle>
                  {/* Language lock badge */}
                  {selectedLang ? (
                    <div className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      <span className="text-xs text-foreground">
                        {t("admin_bunny.lang_only", { language: `${langLabel} (${selectedLang.toUpperCase()})` })}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                      <span className="text-xs text-destructive">{t("admin_bunny.no_language")}</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {videosLoading ? (
                  <div className="flex flex-col gap-1.5 py-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> {t("admin_bunny.fetching")}</div>
                    <p className="text-xs text-muted-foreground pl-6">{t("admin_bunny.fetching_hint")}</p>
                  </div>
                ) : videos.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">{t("admin_bunny.no_videos")}</p>
                ) : (
                  <div className="space-y-2">
                    {/* Debug info from API */}
                  {videosData && (
                    <div className="rounded-lg border border-border px-3 py-2 mb-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <span className="text-muted-foreground">{t("admin_bunny.collection_id")}: </span>
                        <span className="font-mono text-foreground">{videosData.requestedCollectionId?.slice(0, 12)}…</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("admin_bunny.language")}: </span>
                        <span className="font-medium text-foreground">{videosData.detectedLanguage?.toUpperCase()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("admin_bunny.videos_returned")}: </span>
                        <span className="font-medium text-foreground tabular-nums">{videosData.totalVideosReturned}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("admin_bunny.pages_fetched")}: </span>
                        <span className="font-medium text-foreground tabular-nums">{videosData.pagesFetched}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 pb-1">
                      <p className="text-xs text-muted-foreground">
                        {t("admin_bunny.selected_count", { selected: selectedRows.length, total: importRows.length })}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setImportRows(r => r.map(row => ({ ...row, selected: row.video.isReady })))}>{t("admin_bunny.select_ready")}</Button>
                        <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setImportRows(r => r.map(row => ({ ...row, selected: false })))}>{t("admin_bunny.deselect_all")}</Button>
                      </div>
                    </div>

                    {importRows.map((row, idx) => {
                      const courseModules = getCourseModules(row.courseId);
                      const moduleLessons = getModuleLessons(row.courseId, row.moduleId);
                      return (
                        <div key={row.video.guid} className={`rounded-xl border p-3 transition-colors ${row.selected ? "border-foreground/30 bg-card" : "border-border bg-card hover:border-foreground/20"}`}>
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={row.selected} disabled={!row.video.isReady} onChange={e => updateRow(idx, { selected: e.target.checked })}
                              className="mt-1 rounded shrink-0 w-4 h-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40" />
                            {row.video.thumbnailUrl ? (
                              <img src={row.video.thumbnailUrl} alt="" className="h-14 w-24 rounded-lg object-cover shrink-0 bg-muted"
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="h-14 w-24 rounded-lg bg-muted shrink-0 flex items-center justify-center">
                                <Video className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-sm font-medium text-foreground truncate max-w-xs">{row.video.title}</span>
                                <StatusBadge label={row.video.statusLabel} isReady={row.video.isReady} />
                                <span className="text-xs text-muted-foreground">{fmtDuration(row.video.durationSeconds)}</span>
                              </div>
                              <p className="text-xs text-muted-foreground font-mono truncate">{row.video.embedUrl}</p>
                            </div>
                            <Button variant="outline" size="sm" className="gap-1.5 shrink-0 h-7 text-xs" onClick={() => setPreviewVideo(row.video)}>
                              <Play className="w-3 h-3 stroke-[1.75]" /> {t("admin_bunny.test")}
                            </Button>
                          </div>

                          {row.selected && (
                            <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {/* Course */}
                              <div className="space-y-1">
                                <Label className="text-xs font-normal text-muted-foreground">{t("admin_bunny.course")}</Label>
                                <Select value={row.courseId} onValueChange={v => updateRow(idx, { courseId: v, moduleId: "", lessonId: "" })}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("admin_bunny.select_course")} /></SelectTrigger>
                                  <SelectContent>
                                    {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Lesson name */}
                              <div className="space-y-1">
                                <Label className="text-xs font-normal text-muted-foreground">{t("admin_bunny.lesson_name")}</Label>
                                <Input className="h-8 text-xs" placeholder={t("admin_bunny.lesson_name_placeholder")}
                                  value={row.newLessonName} onChange={e => updateRow(idx, { newLessonName: e.target.value })} />
                              </div>

                              {row.courseId && (
                                <>
                                  {/* Module */}
                                  <div className="space-y-1">
                                    <Label className="text-xs font-normal text-muted-foreground">{t("admin_bunny.module")}</Label>
                                    <Select value={row.moduleId} onValueChange={v => updateRow(idx, { moduleId: v, lessonId: "", newModuleName: "" })}>
                                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("admin_bunny.select_module")} /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__new__">{t("admin_bunny.create_module")}</SelectItem>
                                        {courseModules.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                    {row.moduleId === "__new__" && (
                                      <Input className="h-7 text-xs mt-1" placeholder={t("admin_bunny.new_module_name")} value={row.newModuleName}
                                        onChange={e => updateRow(idx, { newModuleName: e.target.value })} />
                                    )}
                                  </div>

                                  {/* Lesson (existing) */}
                                  {row.moduleId && row.moduleId !== "__new__" && (
                                    <div className="space-y-1">
                                      <Label className="text-xs font-normal text-muted-foreground">{t("admin_bunny.assign_lesson")}</Label>
                                      <Select value={row.lessonId} onValueChange={v => updateRow(idx, { lessonId: v })}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("admin_bunny.or_create_new")} /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__new__">{t("admin_bunny.create_lesson")}</SelectItem>
                                          {moduleLessons.map(l => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Import bar */}
                    <div className="pt-2 flex items-center justify-between gap-3 border-t border-border mt-2">
                      <div className="text-xs text-muted-foreground">
                        {selectedRows.length > 0 && selectedLang && (
                          <span>
                            {t("admin_bunny.ready_to_import", { count: selectedRows.length })} →{" "}
                            <code className="font-mono bg-muted px-1 rounded">videoAssets.{selectedLang}</code>
                          </span>
                        )}
                        {!selectedLang && (
                          <span className="text-destructive flex items-center gap-1"><XCircle className="w-3.5 h-3.5 stroke-[1.75]" /> {t("admin_bunny.set_language_first")}</span>
                        )}
                      </div>
                      <Button
                        onClick={handleImportClick}
                        disabled={!selectedRows.length || !selectedLang || importing}
                        className="gap-2"
                      >
                        {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                        {t("admin_bunny.import_btn", { count: selectedRows.length, lang: selectedLang ? selectedLang.toUpperCase() : "…" })}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Import result */}
          {importResult && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {importResult.errors.length === 0 ? (
                    <CheckCircle2 className="w-4 h-4 stroke-[1.75] text-success shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 stroke-[1.75] text-warning shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground mb-3">{t("admin_bunny.import_complete")}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-3">
                      <div>
                        <p className="text-muted-foreground">{t("admin_bunny.collection")}</p>
                        <p className="font-medium text-foreground">{importResult.collectionName ?? "—"}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-muted-foreground">{t("admin_bunny.collection_id")}</p>
                        <p className="font-mono text-xs text-foreground break-all">{importResult.collectionId ?? "—"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">{t("admin_bunny.language_key_written")}</p>
                        <p className="font-mono text-foreground">videoAssets.{importResult.langCode}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("admin_bunny.lessons_updated")}</p>
                        <p className="text-lg font-semibold tracking-tight tabular-nums text-foreground">{importResult.updated}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("admin_bunny.lessons_created")}</p>
                        <p className="text-lg font-semibold tracking-tight tabular-nums text-foreground">{importResult.created}</p>
                      </div>
                    </div>
                    {importResult.errors.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs font-medium text-destructive">{t("admin_bunny.errors", { count: importResult.errors.length })}</p>
                        {importResult.errors.map((e, i) => (
                          <p key={i} className="text-xs text-destructive">{e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
