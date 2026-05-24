import { useState } from "react";
import {
  useListAdminCourses, useCreateAdminCourse, useUpdateAdminCourse,
  useDeleteAdminCourse, useDuplicateAdminCourse, useGetAdminCourseDetail,
  useCreateAdminModule, useUpdateAdminModule, useDeleteAdminModule,
  useCreateAdminLesson, useUpdateAdminLesson, useDeleteAdminLesson,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Copy, Eye, EyeOff, ChevronDown,
  ChevronRight, GraduationCap, BookOpen, Loader2,
  MoreHorizontal, ArrowLeft, Star, Users,
} from "lucide-react";

const LANGS = ["en", "fr", "de", "nl", "es", "it", "pt", "pl"] as const;
const LANG_LABELS: Record<string, string> = { en: "English", fr: "Français", de: "Deutsch", nl: "Nederlands", es: "Español", it: "Italiano", pt: "Português", pl: "Polski" };
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const LEVEL_COLORS: Record<string, string> = { beginner: "bg-success/15 text-success", intermediate: "bg-info/15 text-info", advanced: "bg-warning/15 text-warning" };

type AdminCourse = {
  id: string; slug: string; title: Record<string, string>; description: Record<string, string>;
  category: string; level: string; thumbnailUrl: string; isPublished: boolean; isFeatured: boolean;
  order: number; totalDurationSeconds: number; instructorName?: string | null;
  estimatedDuration?: string | null; moduleCount: number; lessonCount: number;
  createdAt: string; modules?: AdminModule[];
};

type AdminModule = {
  id: string; courseId: string; title: Record<string, string>; order: number; lessons: AdminLesson[];
};

type AdminLesson = {
  id: string; moduleId: string; title: Record<string, string>; description?: Record<string, string> | null;
  videoUrl: string; durationSeconds: number; order: number; isPublished: boolean; notes?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mlObj(langs: string[], val: string): Record<string, string> {
  return Object.fromEntries(langs.map(l => [l, val]));
}

function fmtDuration(s: number) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

// ─── Course Form Modal ────────────────────────────────────────────────────────

const EMPTY_COURSE = {
  titleEn: "", descEn: "", category: "", level: "beginner",
  thumbnailUrl: "", isPublished: false, isFeatured: false,
  instructorName: "", estimatedDuration: "",
  activeLang: "en" as string,
  titlesByLang: {} as Record<string, string>,
  descsByLang: {} as Record<string, string>,
};

function CourseFormModal({
  open, onClose, course,
}: {
  open: boolean;
  onClose: () => void;
  course?: AdminCourse | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!course;

  const [form, setForm] = useState(() => {
    if (course) {
      return {
        titleEn: course.title.en ?? "",
        descEn: course.description.en ?? "",
        category: course.category,
        level: course.level,
        thumbnailUrl: course.thumbnailUrl,
        isPublished: course.isPublished,
        isFeatured: course.isFeatured,
        instructorName: course.instructorName ?? "",
        estimatedDuration: course.estimatedDuration ?? "",
        activeLang: "en",
        titlesByLang: { ...course.title } as Record<string, string>,
        descsByLang: { ...course.description } as Record<string, string>,
      };
    }
    return { ...EMPTY_COURSE };
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });
  };

  const { mutate: create, isPending: creating } = useCreateAdminCourse({
    mutation: {
      onSuccess: () => { toast({ title: "Course created" }); invalidate(); onClose(); },
      onError: () => toast({ title: "Failed to create course", variant: "destructive" }),
    },
  });

  const { mutate: update, isPending: updating } = useUpdateAdminCourse({
    mutation: {
      onSuccess: () => { toast({ title: "Course updated" }); invalidate(); onClose(); },
      onError: () => toast({ title: "Failed to update course", variant: "destructive" }),
    },
  });

  const isPending = creating || updating;

  const buildTitles = () => ({ en: form.titleEn, ...form.titlesByLang });
  const buildDescs = () => ({ en: form.descEn, ...form.descsByLang });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titleEn || !form.category || !form.level) return;
    const level = form.level as "beginner" | "intermediate" | "advanced";
    const payload = {
      title: buildTitles(),
      description: buildDescs(),
      category: form.category,
      level,
      thumbnailUrl: form.thumbnailUrl || undefined,
      isPublished: form.isPublished,
      isFeatured: form.isFeatured,
      instructorName: form.instructorName || null,
      estimatedDuration: form.estimatedDuration || null,
    };
    if (isEdit) {
      update({ id: course!.id, data: payload });
    } else {
      create({ data: payload });
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Course" : "Create Course"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Language tabs */}
          <div className="flex gap-1 flex-wrap">
            {LANGS.map(l => (
              <button key={l} type="button"
                onClick={() => setForm(f => ({ ...f, activeLang: l }))}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${form.activeLang === l ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Title ({LANG_LABELS[form.activeLang]}) <span className="text-destructive">*</span></Label>
            <Input
              value={form.activeLang === "en" ? form.titleEn : (form.titlesByLang[form.activeLang] ?? "")}
              onChange={e => {
                if (form.activeLang === "en") setForm(f => ({ ...f, titleEn: e.target.value }));
                else setForm(f => ({ ...f, titlesByLang: { ...f.titlesByLang, [f.activeLang]: e.target.value } }));
              }}
              placeholder={`Course title in ${LANG_LABELS[form.activeLang]}…`}
              required={form.activeLang === "en"}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description ({LANG_LABELS[form.activeLang]})</Label>
            <Textarea rows={3}
              value={form.activeLang === "en" ? form.descEn : (form.descsByLang[form.activeLang] ?? "")}
              onChange={e => {
                if (form.activeLang === "en") setForm(f => ({ ...f, descEn: e.target.value }));
                else setForm(f => ({ ...f, descsByLang: { ...f.descsByLang, [f.activeLang]: e.target.value } }));
              }}
              placeholder="Course description…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category <span className="text-destructive">*</span></Label>
              <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Business, Technical" required />
            </div>
            <div className="space-y-1.5">
              <Label>Level <span className="text-destructive">*</span></Label>
              <Select value={form.level} onValueChange={v => setForm(f => ({ ...f, level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map(l => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Instructor Name</Label>
              <Input value={form.instructorName} onChange={e => setForm(f => ({ ...f, instructorName: e.target.value }))} placeholder="e.g. Marie Dupont" />
            </div>
            <div className="space-y-1.5">
              <Label>Estimated Duration</Label>
              <Input value={form.estimatedDuration} onChange={e => setForm(f => ({ ...f, estimatedDuration: e.target.value }))} placeholder="e.g. 2h 30m" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Thumbnail URL</Label>
              <Input value={form.thumbnailUrl} onChange={e => setForm(f => ({ ...f, thumbnailUrl: e.target.value }))} placeholder="https://…" />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.isPublished} onCheckedChange={v => setForm(f => ({ ...f, isPublished: v }))} />
              <Label>Published</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isFeatured} onCheckedChange={v => setForm(f => ({ ...f, isFeatured: v }))} />
              <Label>Featured</Label>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending || !form.titleEn || !form.category}>
              {isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving…</> : isEdit ? "Save Changes" : "Create Course"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lesson Form Modal ────────────────────────────────────────────────────────

function LessonFormModal({
  open, onClose, moduleId, lesson,
}: {
  open: boolean; onClose: () => void; moduleId: string; lesson?: AdminLesson | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!lesson;

  const [form, setForm] = useState({
    titleEn: lesson?.title?.en ?? "",
    titlesByLang: { ...(lesson?.title ?? {}) } as Record<string, string>,
    videoUrl: lesson?.videoUrl ?? "",
    durationSeconds: String(lesson?.durationSeconds ?? 0),
    isPublished: lesson?.isPublished ?? false,
    notes: lesson?.notes ?? "",
    activeLang: "en",
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });

  const { mutate: create, isPending: creating } = useCreateAdminLesson({
    mutation: {
      onSuccess: () => { toast({ title: "Lesson created" }); invalidate(); onClose(); },
      onError: () => toast({ title: "Failed to create lesson", variant: "destructive" }),
    },
  });

  const { mutate: update, isPending: updating } = useUpdateAdminLesson({
    mutation: {
      onSuccess: () => { toast({ title: "Lesson updated" }); invalidate(); onClose(); },
      onError: () => toast({ title: "Failed to update lesson", variant: "destructive" }),
    },
  });

  const isPending = creating || updating;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      moduleId,
      title: { en: form.titleEn, ...form.titlesByLang },
      videoUrl: form.videoUrl || undefined,
      durationSeconds: parseInt(form.durationSeconds, 10) || 0,
      isPublished: form.isPublished,
      notes: form.notes || null,
    };
    if (isEdit) update({ id: lesson!.id, data: payload });
    else create({ data: payload });
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Lesson" : "Create Lesson"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="flex gap-1 flex-wrap">
            {LANGS.map(l => (
              <button key={l} type="button"
                onClick={() => setForm(f => ({ ...f, activeLang: l }))}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${form.activeLang === l ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Title ({LANG_LABELS[form.activeLang]}) <span className="text-destructive">*</span></Label>
            <Input
              value={form.activeLang === "en" ? form.titleEn : (form.titlesByLang[form.activeLang] ?? "")}
              onChange={e => {
                if (form.activeLang === "en") setForm(f => ({ ...f, titleEn: e.target.value }));
                else setForm(f => ({ ...f, titlesByLang: { ...f.titlesByLang, [f.activeLang]: e.target.value } }));
              }}
              placeholder={`Lesson title…`}
              required={form.activeLang === "en"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Video URL (Vimeo)</Label>
              <Input value={form.videoUrl} onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))} placeholder="https://vimeo.com/…" />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (seconds)</Label>
              <Input type="number" min="0" value={form.durationSeconds} onChange={e => setForm(f => ({ ...f, durationSeconds: e.target.value }))} />
            </div>
            <div className="flex items-end pb-1">
              <div className="flex items-center gap-2">
                <Switch checked={form.isPublished} onCheckedChange={v => setForm(f => ({ ...f, isPublished: v }))} />
                <Label>Published</Label>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes for this lesson…" />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending || !form.titleEn}>
              {isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving…</> : isEdit ? "Save Changes" : "Create Lesson"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Course Detail View (modules + lessons) ────────────────────────────────────

function CourseDetailView({
  courseId, onBack,
}: {
  courseId: string; onBack: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [lessonModal, setLessonModal] = useState<{ open: boolean; moduleId: string; lesson?: AdminLesson | null }>({ open: false, moduleId: "" });
  const [moduleEditId, setModuleEditId] = useState<string | null>(null);
  const [moduleTitle, setModuleTitle] = useState("");
  const [addingModule, setAddingModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; name: string } | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const { data: courseData, isLoading } = useGetAdminCourseDetail(courseId);
  const course = courseData as AdminCourse | undefined;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });
    qc.invalidateQueries({ queryKey: [`/api/admin/academy/courses/${courseId}`] });
  };

  const { mutate: createMod, isPending: creatingMod } = useCreateAdminModule({
    mutation: {
      onSuccess: () => { toast({ title: "Module added" }); invalidate(); setAddingModule(false); setNewModuleTitle(""); },
      onError: () => toast({ title: "Failed to add module", variant: "destructive" }),
    },
  });

  const { mutate: updateMod } = useUpdateAdminModule({
    mutation: {
      onSuccess: () => { toast({ title: "Module updated" }); invalidate(); setModuleEditId(null); },
    },
  });

  const { mutate: deleteMod } = useDeleteAdminModule({
    mutation: {
      onSuccess: () => { toast({ title: "Module deleted" }); invalidate(); setDeleteTarget(null); },
    },
  });

  const { mutate: deleteLesson } = useDeleteAdminLesson({
    mutation: {
      onSuccess: () => { toast({ title: "Lesson deleted" }); invalidate(); setDeleteTarget(null); },
    },
  });

  const toggleModule = (id: string) => {
    setExpandedModules(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}
    </div>
  );

  if (!course) return <div className="text-muted-foreground">Course not found</div>;

  const titleEn = (course.title as Record<string, string>).en ?? "Untitled";

  return (
    <div className="space-y-4">
      <LessonFormModal
        open={lessonModal.open}
        onClose={() => setLessonModal({ open: false, moduleId: "" })}
        moduleId={lessonModal.moduleId}
        lesson={lessonModal.lesson}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type}?</AlertDialogTitle>
            <AlertDialogDescription>"{deleteTarget?.name}" will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => {
              if (!deleteTarget) return;
              if (deleteTarget.type === "module") deleteMod({ id: deleteTarget.id });
              if (deleteTarget.type === "lesson") deleteLesson({ id: deleteTarget.id });
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button variant="ghost" size="sm" className="gap-1.5 -ml-1" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" /> Back to Courses
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">{titleEn}</h2>
          <p className="text-sm text-muted-foreground">{course.moduleCount} modules · {course.lessonCount} lessons</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setAddingModule(true)}>
          <Plus className="w-4 h-4" /> Add Module
        </Button>
      </div>

      {addingModule && (
        <Card>
          <CardContent className="p-3 flex gap-2">
            <Input
              autoFocus
              placeholder="Module title (English)…"
              value={newModuleTitle}
              onChange={e => setNewModuleTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && newModuleTitle.trim()) {
                  createMod({ data: { courseId, title: mlObj(["en"], newModuleTitle.trim()), order: (course.modules?.length ?? 0) + 1 } });
                }
                if (e.key === "Escape") { setAddingModule(false); setNewModuleTitle(""); }
              }}
            />
            <Button size="sm" disabled={creatingMod || !newModuleTitle.trim()} onClick={() =>
              createMod({ data: { courseId, title: mlObj(["en"], newModuleTitle.trim()), order: (course.modules?.length ?? 0) + 1 } })
            }>
              {creatingMod ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setAddingModule(false); setNewModuleTitle(""); }}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      {(course.modules ?? []).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No modules yet — add one to get started</p>
        </div>
      ) : (
        (course.modules ?? []).map((mod) => {
          const modTitle = (mod.title as Record<string, string>).en ?? "Untitled";
          const isExpanded = expandedModules.has(mod.id);
          return (
            <Card key={mod.id}>
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between gap-2">
                  <button className="flex items-center gap-2 flex-1 text-left" onClick={() => toggleModule(mod.id)}>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    {moduleEditId === mod.id ? (
                      <Input
                        autoFocus
                        value={moduleTitle}
                        className="h-7 text-sm"
                        onChange={e => setModuleTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") updateMod({ id: mod.id, data: { title: mlObj(["en"], moduleTitle) } });
                          if (e.key === "Escape") setModuleEditId(null);
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="font-semibold text-sm text-foreground">{modTitle}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-1">({mod.lessons.length} lessons)</span>
                  </button>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setModuleEditId(mod.id); setModuleTitle(modTitle); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget({ type: "module", id: mod.id, name: modTitle })}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-3">
                  <div className="space-y-1.5 mb-3">
                    {mod.lessons.map(lesson => {
                      const lTitle = (lesson.title as Record<string, string>).en ?? "Untitled";
                      return (
                        <div key={lesson.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/40 group">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-sm font-medium text-foreground truncate">{lTitle}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${lesson.isPublished ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                              {lesson.isPublished ? "Published" : "Draft"}
                            </span>
                            {lesson.durationSeconds > 0 && (
                              <span className="text-xs text-muted-foreground">{fmtDuration(lesson.durationSeconds)}</span>
                            )}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-6 w-6"
                              onClick={() => setLessonModal({ open: true, moduleId: mod.id, lesson })}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget({ type: "lesson", id: lesson.id, name: lTitle })}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 w-full"
                    onClick={() => setLessonModal({ open: true, moduleId: mod.id })}>
                    <Plus className="w-3.5 h-3.5" /> Add Lesson
                  </Button>
                </CardContent>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAcademy() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courseModal, setCourseModal] = useState<{ open: boolean; course?: AdminCourse | null }>({ open: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const { data, isLoading } = useListAdminCourses({ q: search || undefined, status: statusFilter === "all" ? undefined : statusFilter });
  const courses = ((data as { items?: AdminCourse[] })?.items ?? []) as AdminCourse[];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });

  const { mutate: deleteCourse } = useDeleteAdminCourse({
    mutation: {
      onSuccess: () => { toast({ title: "Course deleted" }); invalidate(); setDeleteId(null); },
    },
  });

  const { mutate: duplicate } = useDuplicateAdminCourse({
    mutation: {
      onSuccess: () => { toast({ title: "Course duplicated as draft" }); invalidate(); },
    },
  });

  if (selectedCourseId) {
    return <CourseDetailView courseId={selectedCourseId} onBack={() => setSelectedCourseId(null)} />;
  }

  return (
    <div className="space-y-5">
      <CourseFormModal
        open={courseModal.open}
        onClose={() => setCourseModal({ open: false })}
        course={courseModal.course}
      />

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete course?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the course and all its modules and lessons.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteId && deleteCourse({ id: deleteId })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Academy Manager</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage courses, modules, and lessons</p>
        </div>
        <Button className="gap-1.5" onClick={() => setCourseModal({ open: true })}>
          <Plus className="w-4 h-4" /> New Course
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <Input
          className="max-w-xs"
          placeholder="Search courses…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1">
          {["all", "published", "draft"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Courses", value: courses.length },
          { label: "Published", value: courses.filter(c => c.isPublished).length },
          { label: "Drafts", value: courses.filter(c => !c.isPublished).length },
          { label: "Total Lessons", value: courses.reduce((s, c) => s + c.lessonCount, 0) },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">No courses found</p>
            <Button size="sm" className="gap-1.5 mt-3" onClick={() => setCourseModal({ open: true })}>
              <Plus className="w-4 h-4" /> Create first course
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {courses.map(course => {
            const titleEn = (course.title as Record<string, string>).en ?? "Untitled";
            return (
              <Card key={course.id} className="hover:border-border/80 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  {course.thumbnailUrl ? (
                    <img src={course.thumbnailUrl} alt="" className="w-14 h-10 rounded object-cover shrink-0 bg-muted" />
                  ) : (
                    <div className="w-14 h-10 rounded bg-muted shrink-0 flex items-center justify-center">
                      <GraduationCap className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">{titleEn}</span>
                      {course.isFeatured && <Star className="w-3.5 h-3.5 text-warning fill-warning" />}
                      <Badge className={`text-xs ${LEVEL_COLORS[course.level] ?? ""}`}>{course.level}</Badge>
                      <Badge className={`text-xs ${course.isPublished ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                        {course.isPublished ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {course.category}
                      {course.instructorName ? ` · ${course.instructorName}` : ""}
                      {` · ${course.moduleCount} modules · ${course.lessonCount} lessons`}
                      {course.estimatedDuration ? ` · ${course.estimatedDuration}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="sm" className="gap-1.5 hidden sm:flex"
                      onClick={() => setSelectedCourseId(course.id)}>
                      <BookOpen className="w-3.5 h-3.5" /> Manage
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelectedCourseId(course.id)}>
                          <BookOpen className="w-4 h-4 mr-2" /> Manage modules
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setCourseModal({ open: true, course })}>
                          <Pencil className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate({ id: course.id })}>
                          <Copy className="w-4 h-4 mr-2" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteId(course.id)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
