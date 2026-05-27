import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Download, ChevronDown, ChevronRight, Globe, AlertTriangle,
  Link as LinkIcon, ArrowLeft, Video, Info,
} from "lucide-react";

const LANG_LABELS: Record<string, string> = {
  en: "English", fr: "Français", de: "Deutsch", nl: "Nederlands",
  es: "Español", it: "Italiano", pt: "Português", pl: "Polski",
};

type BunnyStatus = {
  connected: boolean; error?: string;
  libraryId?: string; libraryName?: string;
  pullZoneHostname?: string; videoCount?: number;
};

type BunnyCollection = {
  guid: string; name: string; videoCount: number; lang: string;
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
  lang: string;
  courseId: string;
  moduleId: string;
  lessonId: string;
  newModuleName: string;
  newLessonName: string;
  selected: boolean;
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

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function AdminBunnyImporter({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedCollection, setSelectedCollection] = useState<BunnyCollection | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [previewVideo, setPreviewVideo] = useState<BunnyVideo | null>(null);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; created: number; updated: number; errors: string[] } | null>(null);

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

  // When videos load, build import rows with defaults
  useEffect(() => {
    if (!videos.length) { setImportRows([]); return; }
    const lang = selectedCollection?.lang ?? "en";
    setImportRows(videos.map(v => ({
      video: v,
      lang,
      courseId: "",
      moduleId: "",
      lessonId: "",
      newModuleName: "",
      newLessonName: v.title,
      selected: v.isReady,
    })));
  }, [videos, selectedCollection?.lang]);

  const updateRow = (idx: number, patch: Partial<ImportRow>) => {
    setImportRows(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const selectedRows = importRows.filter(r => r.selected);

  const handleImport = async () => {
    if (!selectedRows.length) return;
    setImporting(true);
    setImportResult(null);
    try {
      const items = selectedRows.map(r => ({
        videoId: r.video.guid,
        lang: r.lang,
        embedUrl: r.video.embedUrl,
        thumbnailUrl: r.video.thumbnailUrl,
        previewUrl: r.video.previewUrl || undefined,
        durationSeconds: r.video.durationSeconds,
        videoTitle: r.video.title,
        courseId: r.courseId || undefined,
        moduleId: r.moduleId || undefined,
        lessonId: r.lessonId || undefined,
        newModuleName: r.newModuleName || undefined,
        newLessonName: r.newLessonName || r.video.title,
      }));
      const result = await apiFetch("/admin/bunny/import", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      setImportResult(result);
      qc.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });
      if (result.errors?.length === 0) {
        toast({ title: `Imported ${result.imported} video${result.imported !== 1 ? "s" : ""} successfully` });
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
          {/* Collections */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Globe className="w-4 h-4" /> Step 1 — Select a Language Collection
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {collectionsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading collections…</div>
              ) : collections.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No collections found in this library.</p>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {collections.map(col => (
                    <button key={col.guid} onClick={() => setSelectedCollection(col)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${selectedCollection?.guid === col.guid ? "border-primary bg-primary/5 text-foreground" : "border-border bg-muted/30 text-muted-foreground hover:border-border/80"}`}>
                      <span className="font-medium">{col.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{col.lang}</span>
                      <span className="text-xs text-muted-foreground">{col.videoCount} videos</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Videos */}
          {selectedCollection && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Play className="w-4 h-4" /> Step 2 — Videos in "{selectedCollection.name}" ({selectedCollection.lang.toUpperCase()})
                </CardTitle>
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
                            {/* Checkbox + thumbnail */}
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
                              {/* Language override */}
                              <div className="space-y-1">
                                <Label className="text-xs font-medium">Language</Label>
                                <Select value={row.lang} onValueChange={v => updateRow(idx, { lang: v })}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(LANG_LABELS).map(([k, v]) => (
                                      <SelectItem key={k} value={k}>{v} ({k})</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

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

                                  {/* Lesson */}
                                  {(row.moduleId && row.moduleId !== "__new__") && (
                                    <div className="space-y-1">
                                      <Label className="text-xs font-medium">Lesson</Label>
                                      <Select value={row.lessonId} onValueChange={v => updateRow(idx, { lessonId: v })}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select or create…" /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__new__">+ Create new lesson…</SelectItem>
                                          {moduleLessons.map(l => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                      {(row.lessonId === "__new__" || !row.lessonId) && (
                                        <Input className="h-7 text-xs mt-1" placeholder="Lesson name (defaults to video title)"
                                          value={row.newLessonName} onChange={e => updateRow(idx, { newLessonName: e.target.value })} />
                                      )}
                                    </div>
                                  )}

                                  {row.moduleId === "__new__" && (
                                    <div className="space-y-1">
                                      <Label className="text-xs font-medium">Lesson name</Label>
                                      <Input className="h-7 text-xs" placeholder="Lesson name (defaults to video title)"
                                        value={row.newLessonName} onChange={e => updateRow(idx, { newLessonName: e.target.value })} />
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Import button */}
                    <div className="pt-3 flex items-center justify-between gap-3 border-t border-border">
                      <p className="text-sm text-muted-foreground">
                        {selectedRows.length} video{selectedRows.length !== 1 ? "s" : ""} ready to import
                      </p>
                      <Button
                        className="gap-1.5"
                        disabled={!selectedRows.length || importing || selectedRows.some(r => !r.courseId)}
                        onClick={handleImport}
                      >
                        {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Download className="w-4 h-4" /> Import {selectedRows.length} video{selectedRows.length !== 1 ? "s" : ""}</>}
                      </Button>
                    </div>

                    {selectedRows.some(r => r.selected && !r.courseId) && (
                      <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Some selected videos have no course assigned. Assign a course before importing.
                      </div>
                    )}

                    {/* Import result */}
                    {importResult && (
                      <div className={`rounded-xl border p-4 space-y-2 ${importResult.errors.length ? "border-warning/30 bg-warning/5" : "border-success/30 bg-success/5"}`}>
                        <div className="flex items-center gap-2">
                          {importResult.errors.length === 0
                            ? <CheckCircle2 className="w-4 h-4 text-success" />
                            : <AlertTriangle className="w-4 h-4 text-warning" />}
                          <span className="font-semibold text-sm">
                            Import complete — {importResult.imported} imported, {importResult.created} created, {importResult.updated} updated
                          </span>
                        </div>
                        {importResult.errors.length > 0 && (
                          <ul className="text-xs text-destructive space-y-0.5 pl-6 list-disc">
                            {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Info card */}
      <Card className="border-dashed">
        <CardContent className="p-4 flex items-start gap-3 text-sm text-muted-foreground">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p><strong className="text-foreground">How it works:</strong> Select a language collection → videos load from BunnyStream → assign each to a course + module + lesson → click Import. The Embed URL, Thumbnail, Preview URL, and Video ID are stored per language on the lesson.</p>
            <p>After import, the client Academy lesson page will show the BunnyStream iframe for the user's language, falling back to English if their language is not available.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
