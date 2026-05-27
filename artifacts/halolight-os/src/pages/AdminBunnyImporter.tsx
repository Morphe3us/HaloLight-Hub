import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Globe, AlertTriangle, ArrowLeft, Video, ShieldAlert,
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
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function fmtDuration(s: number) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function StatusBadge({ label, isReady }: { label: string; isReady: boolean }) {
  if (isReady) return <Badge className="bg-success/15 text-success text-xs">ready</Badge>;
  if (label === "processing" || label === "transcoding") return <Badge className="bg-warning/15 text-warning text-xs">{label}</Badge>;
  if (label === "error" || label === "upload_failed") return <Badge className="bg-destructive/15 text-destructive text-xs">{label}</Badge>;
  return <Badge className="bg-muted text-muted-foreground text-xs">{label}</Badge>;
}

// ─── Video Preview Dialog ──────────────────────────────────────────────────

function VideoPreviewDialog({ video, open, onClose }: { video: BunnyVideo | null; open: boolean; onClose: () => void }) {
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
            <div><span className="font-medium text-foreground">Video ID:</span> {video.guid}</div>
            <div><span className="font-medium text-foreground">Duration:</span> {fmtDuration(video.durationSeconds)}</div>
            <div><span className="font-medium text-foreground">Status:</span> {video.statusLabel}</div>
            <div><span className="font-medium text-foreground">Resolution:</span> {video.width}×{video.height}</div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Embed URL</Label>
            <div className="flex items-center gap-2 bg-muted rounded px-3 py-2 text-xs font-mono break-all">
              {video.embedUrl}
            </div>
          </div>
          {video.thumbnailUrl && (
            <div className="flex items-center gap-3">
              <img src={video.thumbnailUrl} alt="thumbnail" className="h-12 w-20 rounded object-cover bg-muted" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <span className="text-xs text-muted-foreground">Thumbnail loaded</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
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
  const langLabel = LANG_LABELS[langCode] ?? langCode.toUpperCase();
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !importing) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-warning" /> Confirm Import
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
            <p className="font-semibold text-foreground mb-1">Import summary</p>
            <p className="text-muted-foreground">
              You are about to import{" "}
              <span className="font-semibold text-foreground">{count} video{count !== 1 ? "s" : ""}</span>{" "}
              from collection{" "}
              <span className="font-semibold text-foreground">"{collectionName}"</span>{" "}
              into language{" "}
              <span className="font-semibold text-foreground">{langLabel} ({langCode.toUpperCase()})</span>{" "}
              only.
            </p>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 pl-1">
            <li>• Only <code className="font-mono bg-muted px-1 rounded">videoAssets.{langCode}</code> will be written</li>
            <li>• No other language assets will be modified</li>
            <li>• Existing assets in other languages are untouched</li>
            <li>• If a lesson already has <code className="font-mono bg-muted px-1 rounded">{langCode}</code> assets, they will be overwritten</li>
          </ul>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={importing}>Cancel</Button>
          <Button onClick={onConfirm} disabled={importing}>
            {importing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Import {count} video{count !== 1 ? "s" : ""} → {langCode.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function AdminBunnyImporter({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
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
  const { data: videosData, isLoading: videosLoading } = useQuery<{ items: BunnyVideo[]; total: number; totalReported: number; pagesLoaded: number }>({
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
    if (!selectedLang) {
      toast({ title: "This collection's ID is not in the fixed language mapping. Import blocked.", variant: "destructive" });
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
        toast({ title: `Imported ${result.imported} video${result.imported !== 1 ? "s" : ""} → ${selectedLang.toUpperCase()} successfully` });
      } else {
        toast({ title: `Imported with ${result.errors.length} error(s)`, variant: "destructive" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: `Import failed: ${msg}`, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const getCourseModules = (courseId: string) => courses.find(c => c.id === courseId)?.modules ?? [];
  const getModuleLessons = (courseId: string, moduleId: string) =>
    getCourseModules(courseId).find(m => m.id === moduleId)?.lessons ?? [];

  return (
    <div className="space-y-5">
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

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-1" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" /> Back to Academy
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" /> BunnyStream Importer
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Browse your BunnyStream library and import videos directly into lessons.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => { refetchStatus(); refetchCollections(); }}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Connection status */}
      {statusLoading ? (
        <Card><CardContent className="p-4 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Checking BunnyStream connection…</CardContent></Card>
      ) : status?.connected ? (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Connected to BunnyStream</p>
              <p className="text-xs text-muted-foreground">Library: {status.libraryName} · {status.videoCount} videos · ID: {status.libraryId}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Not connected</p>
              <p className="text-xs text-muted-foreground">{status?.error ?? "BUNNY_STREAM_API_KEY or BUNNY_STREAM_LIBRARY_ID missing"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {status?.connected && (
        <>
          {/* Step 1 — Collection language mapping table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Globe className="w-4 h-4" /> Step 1 — Select a Collection
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {collectionsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading collections…</div>
              ) : collections.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No collections found in this library.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground pb-1">
                    Languages are locked by collection ID. No guessing, no manual selection.
                  </p>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border">
                          <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Collection Name</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Collection ID</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Videos</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Detected Language</th>
                          <th className="px-3 py-2 w-24"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {collections.map((col, i) => {
                          const fixedLang = COLLECTION_ID_TO_LANG[col.guid];
                          const langKnown = !!fixedLang;
                          const isSelected = selectedCollection?.guid === col.guid;
                          return (
                            <tr key={col.guid} className={`border-b border-border last:border-0 transition-colors ${isSelected ? "bg-primary/4" : i % 2 === 0 ? "bg-background" : "bg-muted/10"}`}>
                              <td className="px-3 py-2 font-medium text-foreground">{col.name}</td>
                              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{col.guid}</td>
                              <td className="px-3 py-2 text-muted-foreground text-xs">{col.videoCount}</td>
                              <td className="px-3 py-2">
                                {langKnown ? (
                                  <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                                    <span className="text-xs font-semibold text-success">
                                      {LANG_LABELS[fixedLang]} ({fixedLang.toUpperCase()})
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                    <span className="text-xs text-destructive font-medium">Unknown — import blocked</span>
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
                                  {isSelected ? "Selected" : "Browse"}
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
                      <AlertTriangle className="w-3.5 h-3.5" /> One or more collections have unknown IDs — they are blocked from import. Contact support to add them to the fixed mapping.
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
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Play className="w-4 h-4" /> Step 2 — Videos in "{selectedCollection.name}"
                  </CardTitle>
                  {/* Language lock badge */}
                  {selectedLang ? (
                    <div className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/5 px-3 py-1.5 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      <span className="text-xs font-semibold text-success">
                        Importing into: {langLabel} ({selectedLang.toUpperCase()}) only
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 shrink-0">
                      <XCircle className="w-3.5 h-3.5 text-destructive" />
                      <span className="text-xs font-semibold text-destructive">No language selected — set it in Step 1</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {videosLoading ? (
                  <div className="flex flex-col gap-1.5 py-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Fetching all pages from BunnyStream…</div>
                    <p className="text-xs text-muted-foreground pl-6">This may take a moment for large collections.</p>
                  </div>
                ) : videos.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No videos in this collection.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 pb-1">
                      <p className="text-xs text-muted-foreground">
                        {selectedRows.length} of {importRows.length} selected for import
                        {videosData?.pagesLoaded && videosData.pagesLoaded > 1 && (
                          <span className="ml-2 text-muted-foreground/60">· {videosData.pagesLoaded} pages fetched</span>
                        )}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setImportRows(r => r.map(row => ({ ...row, selected: row.video.isReady })))}>Select ready</Button>
                        <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setImportRows(r => r.map(row => ({ ...row, selected: true })))}>Select all</Button>
                        <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setImportRows(r => r.map(row => ({ ...row, selected: false })))}>Deselect all</Button>
                      </div>
                    </div>

                    {importRows.map((row, idx) => {
                      const courseModules = getCourseModules(row.courseId);
                      const moduleLessons = getModuleLessons(row.courseId, row.moduleId);
                      return (
                        <div key={row.video.guid} className={`rounded-xl border p-3 transition-colors ${row.selected ? "border-primary/30 bg-primary/3" : "border-border bg-muted/10"}`}>
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={row.selected} onChange={e => updateRow(idx, { selected: e.target.checked })}
                              className="mt-1 rounded shrink-0 w-4 h-4 accent-primary cursor-pointer" />
                            {row.video.thumbnailUrl ? (
                              <img src={row.video.thumbnailUrl} alt="" className="h-14 w-24 rounded-lg object-cover shrink-0 bg-muted"
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="h-14 w-24 rounded-lg bg-muted shrink-0 flex items-center justify-center">
                                <Video className="w-5 h-5 text-muted-foreground" />
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
                              <Play className="w-3 h-3" /> Test
                            </Button>
                          </div>

                          {row.selected && (
                            <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {/* Course */}
                              <div className="space-y-1">
                                <Label className="text-xs font-medium">Course</Label>
                                <Select value={row.courseId} onValueChange={v => updateRow(idx, { courseId: v, moduleId: "", lessonId: "" })}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select course…" /></SelectTrigger>
                                  <SelectContent>
                                    {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Lesson name */}
                              <div className="space-y-1">
                                <Label className="text-xs font-medium">Lesson name</Label>
                                <Input className="h-8 text-xs" placeholder="Defaults to video title"
                                  value={row.newLessonName} onChange={e => updateRow(idx, { newLessonName: e.target.value })} />
                              </div>

                              {row.courseId && (
                                <>
                                  {/* Module */}
                                  <div className="space-y-1">
                                    <Label className="text-xs font-medium">Module</Label>
                                    <Select value={row.moduleId} onValueChange={v => updateRow(idx, { moduleId: v, lessonId: "", newModuleName: "" })}>
                                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select module…" /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__new__">+ Create new module…</SelectItem>
                                        {courseModules.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                    {row.moduleId === "__new__" && (
                                      <Input className="h-7 text-xs mt-1" placeholder="New module name" value={row.newModuleName}
                                        onChange={e => updateRow(idx, { newModuleName: e.target.value })} />
                                    )}
                                  </div>

                                  {/* Lesson (existing) */}
                                  {row.moduleId && row.moduleId !== "__new__" && (
                                    <div className="space-y-1">
                                      <Label className="text-xs font-medium">Assign to existing lesson</Label>
                                      <Select value={row.lessonId} onValueChange={v => updateRow(idx, { lessonId: v })}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Or create new…" /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__new__">+ Create new lesson</SelectItem>
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
                            Ready to import <strong>{selectedRows.length}</strong> video{selectedRows.length !== 1 ? "s" : ""} →{" "}
                            <code className="font-mono bg-muted px-1 rounded">videoAssets.{selectedLang}</code>
                          </span>
                        )}
                        {!selectedLang && (
                          <span className="text-destructive flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Set language in Step 1 before importing</span>
                        )}
                      </div>
                      <Button
                        onClick={handleImportClick}
                        disabled={!selectedRows.length || !selectedLang || importing}
                        className="gap-2"
                      >
                        {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                        Import {selectedRows.length > 0 ? `${selectedRows.length} videos` : "videos"} → {selectedLang ? selectedLang.toUpperCase() : "…"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Import result */}
          {importResult && (
            <Card className={`border-${importResult.errors.length === 0 ? "success" : "warning"}/30 bg-${importResult.errors.length === 0 ? "success" : "warning"}/5`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {importResult.errors.length === 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground mb-2">Import complete</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-3">
                      <div>
                        <p className="text-muted-foreground">Collection</p>
                        <p className="font-medium text-foreground">{importResult.collectionName ?? "—"}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-muted-foreground">Collection ID</p>
                        <p className="font-mono text-xs text-foreground break-all">{importResult.collectionId ?? "—"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Language key written</p>
                        <p className="font-mono font-semibold text-foreground">videoAssets.{importResult.langCode}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Lessons updated</p>
                        <p className="font-medium text-foreground">{importResult.updated}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Lessons created</p>
                        <p className="font-medium text-foreground">{importResult.created}</p>
                      </div>
                    </div>
                    {importResult.errors.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs font-semibold text-destructive">Errors ({importResult.errors.length})</p>
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
