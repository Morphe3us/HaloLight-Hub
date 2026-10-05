import { useState, useEffect } from "react";
import AdminBunnyImporter from "./AdminBunnyImporter";
import { useTranslation } from "react-i18next";
import {
  useListAdminCourses,
  useCreateAdminCourse,
  useUpdateAdminCourse,
  useDeleteAdminCourse,
  useDuplicateAdminCourse,
  useGetAdminCourseDetail,
  useCreateAdminModule,
  useUpdateAdminModule,
  useDeleteAdminModule,
  useCreateAdminLesson,
  useUpdateAdminLesson,
  useDeleteAdminLesson,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat, StatGrid } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  BookOpen,
  Loader2,
  MoreHorizontal,
  ArrowLeft,
  Star,
  Video,
  Archive,
  RotateCcw,
} from "lucide-react";

const LANGS = ["en", "fr", "de", "nl", "es", "it", "pt", "pl"] as const;
const LANG_LABELS: Record<string, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  nl: "Nederlands",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  pl: "Polski",
};
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-success",
  intermediate: "bg-info",
  advanced: "bg-warning",
};

type AdminCourse = {
  id: string;
  slug: string;
  title: Record<string, string>;
  description: Record<string, string>;
  category: string;
  level: string;
  thumbnailUrl: string;
  isPublished: boolean;
  isFeatured: boolean;
  order: number;
  totalDurationSeconds: number;
  instructorName?: string | null;
  estimatedDuration?: string | null;
  moduleCount: number;
  lessonCount: number;
  createdAt: string;
  modules?: AdminModule[];
};

type AdminModule = {
  id: string;
  courseId: string;
  title: Record<string, string>;
  order: number;
  lessons: AdminLesson[];
};

type VideoAsset = {
  embedUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  videoId?: string;
};

type AdminLesson = {
  id: string;
  moduleId: string;
  title: Record<string, string>;
  description?: Record<string, string> | null;
  videoUrl: string;
  videoUrls?: Record<string, string> | null;
  thumbnailUrl?: string | null;
  videoAssets?: Record<string, VideoAsset> | null;
  durationSeconds: number;
  order: number;
  isPublished: boolean;
  notes?: string | null;
};

function mlObj(langs: string[], val: string): Record<string, string> {
  return Object.fromEntries(langs.map((l) => [l, val]));
}

function fmtDuration(s: number) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

// ─── Course Form Modal ─────────────────────────────────────────────────────────

const EMPTY_COURSE = {
  titleEn: "",
  descEn: "",
  category: "",
  level: "beginner",
  thumbnailUrl: "",
  isPublished: false,
  isFeatured: false,
  instructorName: "",
  estimatedDuration: "",
  activeLang: "en" as string,
  titlesByLang: {} as Record<string, string>,
  descsByLang: {} as Record<string, string>,
};

function CourseFormModal({
  open,
  onClose,
  course,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  course?: AdminCourse | null;
  onCreated?: (id: string) => void;
}) {
  const { t } = useTranslation();
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
      onSuccess: (data) => {
        toast({ title: t("admin_academy.toast_course_created") });
        invalidate();
        onClose();
        const id = (data as AdminCourse).id;
        if (id) onCreated?.(id);
      },
      onError: () =>
        toast({
          title: t("admin_academy.toast_course_create_fail"),
          variant: "destructive",
        }),
    },
  });

  const { mutate: update, isPending: updating } = useUpdateAdminCourse({
    mutation: {
      onSuccess: () => {
        toast({ title: t("admin_academy.toast_course_updated") });
        invalidate();
        onClose();
      },
      onError: () =>
        toast({
          title: t("admin_academy.toast_course_update_fail"),
          variant: "destructive",
        }),
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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("admin_academy.course_form_edit")
              : t("admin_academy.course_form_create")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="flex gap-1 flex-wrap">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setForm((f) => ({ ...f, activeLang: l }))}
                className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${form.activeLang === l ? "border-foreground/20 bg-muted text-foreground font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>
              {t("admin_academy.label_title")} ({LANG_LABELS[form.activeLang]}){" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              value={
                form.activeLang === "en"
                  ? form.titleEn
                  : (form.titlesByLang[form.activeLang] ?? "")
              }
              onChange={(e) => {
                if (form.activeLang === "en")
                  setForm((f) => ({ ...f, titleEn: e.target.value }));
                else
                  setForm((f) => ({
                    ...f,
                    titlesByLang: {
                      ...f.titlesByLang,
                      [f.activeLang]: e.target.value,
                    },
                  }));
              }}
              placeholder={t("admin_academy.course_title_placeholder", {
                lang: LANG_LABELS[form.activeLang],
              })}
              required={form.activeLang === "en"}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              {t("admin_academy.label_desc")} ({LANG_LABELS[form.activeLang]})
            </Label>
            <Textarea
              rows={3}
              value={
                form.activeLang === "en"
                  ? form.descEn
                  : (form.descsByLang[form.activeLang] ?? "")
              }
              onChange={(e) => {
                if (form.activeLang === "en")
                  setForm((f) => ({ ...f, descEn: e.target.value }));
                else
                  setForm((f) => ({
                    ...f,
                    descsByLang: {
                      ...f.descsByLang,
                      [f.activeLang]: e.target.value,
                    },
                  }));
              }}
              placeholder={t("admin_academy.desc_placeholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                {t("admin_academy.label_category")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                placeholder={t("admin_academy.placeholder_category")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("admin_academy.label_level")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.level}
                onValueChange={(v) => setForm((f) => ({ ...f, level: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l} className="capitalize">
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin_academy.label_instructor")}</Label>
              <Input
                value={form.instructorName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, instructorName: e.target.value }))
                }
                placeholder={t("admin_academy.placeholder_instructor")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin_academy.label_duration")}</Label>
              <Input
                value={form.estimatedDuration}
                onChange={(e) =>
                  setForm((f) => ({ ...f, estimatedDuration: e.target.value }))
                }
                placeholder="e.g. 2h 30m"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("admin_academy.label_thumbnail")}</Label>
              <Input
                value={form.thumbnailUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, thumbnailUrl: e.target.value }))
                }
                placeholder="https://…"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isPublished}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isPublished: v }))
                }
              />
              <Label>{t("admin_academy.label_published")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isFeatured}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isFeatured: v }))
                }
              />
              <Label>{t("admin_academy.label_featured")}</Label>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              {t("admin_academy.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || !form.titleEn || !form.category}
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  {t("admin_academy.saving")}
                </>
              ) : isEdit ? (
                t("admin_academy.save_changes")
              ) : (
                t("admin_academy.create_course")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lesson Form Modal ─────────────────────────────────────────────────────────

function LessonFormModal({
  open,
  onClose,
  moduleId,
  courseId,
  lesson,
}: {
  open: boolean;
  onClose: () => void;
  moduleId: string;
  courseId: string;
  lesson?: AdminLesson | null;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!lesson;

  // Migrate legacy fields into videoAssets structure on first open
  const initVideoAssets = (): Record<
    string,
    {
      embedUrl: string;
      thumbnailUrl: string;
      previewUrl: string;
      videoId: string;
    }
  > => {
    const base = (lesson?.videoAssets ?? {}) as Record<string, VideoAsset>;
    return (LANGS as readonly string[]).reduce<
      Record<
        string,
        {
          embedUrl: string;
          thumbnailUrl: string;
          previewUrl: string;
          videoId: string;
        }
      >
    >((acc, l) => {
      const existing = base[l] ?? {};
      acc[l] = {
        embedUrl:
          existing.embedUrl ??
          (l === "en"
            ? (lesson?.videoUrl ?? "")
            : (lesson?.videoUrls?.[l] ?? "")),
        thumbnailUrl:
          existing.thumbnailUrl ??
          (l === "en" ? (lesson?.thumbnailUrl ?? "") : ""),
        previewUrl: existing.previewUrl ?? "",
        videoId: existing.videoId ?? "",
      };
      return acc;
    }, {});
  };

  const [form, setForm] = useState({
    titleEn: lesson?.title?.en ?? "",
    titlesByLang: { ...(lesson?.title ?? {}) } as Record<string, string>,
    videoAssets: initVideoAssets(),
    durationSeconds: String(lesson?.durationSeconds ?? 0),
    isPublished: lesson?.isPublished ?? false,
    notes: lesson?.notes ?? "",
    activeLang: "en",
    activeVideoLang: "en",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });
    qc.invalidateQueries({
      queryKey: [`/api/admin/academy/courses/${courseId}`],
    });
  };

  const { mutate: create, isPending: creating } = useCreateAdminLesson({
    mutation: {
      onSuccess: () => {
        toast({ title: t("admin_academy.toast_lesson_created") });
        invalidate();
        onClose();
      },
      onError: () =>
        toast({
          title: t("admin_academy.toast_lesson_create_fail"),
          variant: "destructive",
        }),
    },
  });

  const { mutate: update, isPending: updating } = useUpdateAdminLesson({
    mutation: {
      onSuccess: () => {
        toast({ title: t("admin_academy.toast_lesson_updated") });
        invalidate();
        onClose();
      },
      onError: () =>
        toast({
          title: t("admin_academy.toast_lesson_update_fail"),
          variant: "destructive",
        }),
    },
  });

  const isPending = creating || updating;

  const setVideoAssetField = (
    lang: string,
    field: keyof VideoAsset,
    value: string,
  ) => {
    setForm((f) => ({
      ...f,
      videoAssets: {
        ...f.videoAssets,
        [lang]: { ...f.videoAssets[lang], [field]: value },
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const enAsset = form.videoAssets["en"];
    // Only send language entries that have at least one field filled
    const cleanAssets = Object.fromEntries(
      Object.entries(form.videoAssets)
        .filter(
          ([, a]) => a.embedUrl || a.thumbnailUrl || a.previewUrl || a.videoId,
        )
        .map(([l, a]) => [
          l,
          {
            ...(a.embedUrl ? { embedUrl: a.embedUrl } : {}),
            ...(a.thumbnailUrl ? { thumbnailUrl: a.thumbnailUrl } : {}),
            ...(a.previewUrl ? { previewUrl: a.previewUrl } : {}),
            ...(a.videoId ? { videoId: a.videoId } : {}),
          },
        ]),
    );
    const payload = {
      moduleId,
      title: { en: form.titleEn, ...form.titlesByLang },
      videoUrl: enAsset?.embedUrl || undefined,
      thumbnailUrl: enAsset?.thumbnailUrl || null,
      videoAssets:
        Object.keys(cleanAssets).length > 0 ? cleanAssets : undefined,
      durationSeconds: parseInt(form.durationSeconds, 10) || 0,
      isPublished: form.isPublished,
      notes: form.notes || null,
    };
    if (isEdit) update({ id: lesson!.id, data: payload });
    else create({ data: payload });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isEdit
              ? t("admin_academy.lesson_form_edit")
              : t("admin_academy.lesson_form_create")}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 pt-1 overflow-y-auto flex-1 pr-1"
        >
          <div className="flex gap-1 flex-wrap">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setForm((f) => ({ ...f, activeLang: l }))}
                className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${form.activeLang === l ? "border-foreground/20 bg-muted text-foreground font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>
              {t("admin_academy.label_title")} ({LANG_LABELS[form.activeLang]}){" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              value={
                form.activeLang === "en"
                  ? form.titleEn
                  : (form.titlesByLang[form.activeLang] ?? "")
              }
              onChange={(e) => {
                if (form.activeLang === "en")
                  setForm((f) => ({ ...f, titleEn: e.target.value }));
                else
                  setForm((f) => ({
                    ...f,
                    titlesByLang: {
                      ...f.titlesByLang,
                      [f.activeLang]: e.target.value,
                    },
                  }));
              }}
              placeholder={t("admin_academy.lesson_title_placeholder")}
              required={form.activeLang === "en"}
            />
          </div>

          {/* BunnyStream video assets per language */}
          <div className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                {t("admin_academy.label_video_assets", {
                  defaultValue: "BunnyStream Video Assets",
                })}
              </Label>
              <span className="text-xs text-muted-foreground">
                {t("admin_academy.per_language", {
                  defaultValue: "per language",
                })}
              </span>
            </div>

            {/* Language selector */}
            <div className="flex gap-1 flex-wrap">
              {LANGS.map((l) => {
                const a = form.videoAssets[l];
                const hasData = !!(a?.embedUrl || a?.thumbnailUrl);
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, activeVideoLang: l }))
                    }
                    className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${form.activeVideoLang === l ? "border-foreground/20 bg-muted text-foreground font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {LANG_LABELS[l]}
                    {form.activeVideoLang !== l && hasData && (
                      <span className="ml-1 w-1.5 h-1.5 rounded-full bg-success inline-block align-middle" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Embed URL */}
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">
                BunnyStream Embed URL{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({LANG_LABELS[form.activeVideoLang]})
                </span>
              </Label>
              <Input
                value={form.videoAssets[form.activeVideoLang]?.embedUrl ?? ""}
                onChange={(e) =>
                  setVideoAssetField(
                    form.activeVideoLang,
                    "embedUrl",
                    e.target.value,
                  )
                }
                placeholder="https://iframe.mediadelivery.net/embed/..."
              />
            </div>

            {/* Thumbnail URL */}
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">
                Thumbnail URL{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({LANG_LABELS[form.activeVideoLang]})
                </span>
              </Label>
              <Input
                value={
                  form.videoAssets[form.activeVideoLang]?.thumbnailUrl ?? ""
                }
                onChange={(e) =>
                  setVideoAssetField(
                    form.activeVideoLang,
                    "thumbnailUrl",
                    e.target.value,
                  )
                }
                placeholder="https://vz-xxxxx.b-cdn.net/{videoId}/thumbnail.jpg"
              />
              {form.videoAssets[form.activeVideoLang]?.thumbnailUrl && (
                <div className="mt-1 rounded-md overflow-hidden h-16 w-28 bg-muted border border-border">
                  <img
                    src={form.videoAssets[form.activeVideoLang].thumbnailUrl}
                    alt="preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}
            </div>

            {/* Optional fields */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t("admin_academy.label_preview_url", {
                    defaultValue: "Preview Animation URL",
                  })}{" "}
                  <span className="opacity-50">(opt)</span>
                </Label>
                <Input
                  value={
                    form.videoAssets[form.activeVideoLang]?.previewUrl ?? ""
                  }
                  onChange={(e) =>
                    setVideoAssetField(
                      form.activeVideoLang,
                      "previewUrl",
                      e.target.value,
                    )
                  }
                  placeholder="https://...preview.webp"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t("admin_academy.label_video_id", {
                    defaultValue: "Video ID",
                  })}{" "}
                  <span className="opacity-50">(opt)</span>
                </Label>
                <Input
                  value={form.videoAssets[form.activeVideoLang]?.videoId ?? ""}
                  onChange={(e) =>
                    setVideoAssetField(
                      form.activeVideoLang,
                      "videoId",
                      e.target.value,
                    )
                  }
                  placeholder="16556027-e82f-..."
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground pt-0.5">
              {t("admin_academy.video_assets_hint", {
                defaultValue:
                  "Use BunnyStream Embed URL for the player. EN is the fallback for all languages.",
              })}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("admin_academy.label_duration_sec")}</Label>
              <Input
                type="number"
                min="0"
                value={form.durationSeconds}
                onChange={(e) =>
                  setForm((f) => ({ ...f, durationSeconds: e.target.value }))
                }
              />
            </div>
            <div className="flex items-end pb-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isPublished}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, isPublished: v }))
                  }
                />
                <Label>{t("admin_academy.label_published")}</Label>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("admin_academy.label_notes")}</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              placeholder={t("admin_academy.notes_placeholder")}
            />
          </div>

          <DialogFooter className="pt-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              {t("admin_academy.cancel")}
            </Button>
            <Button type="submit" disabled={isPending || !form.titleEn}>
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  {t("admin_academy.saving")}
                </>
              ) : isEdit ? (
                t("admin_academy.save_changes")
              ) : (
                t("admin_academy.create_lesson")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Course Detail View ────────────────────────────────────────────────────────

function CourseDetailView({
  courseId,
  onBack,
}: {
  courseId: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [lessonModal, setLessonModal] = useState<{
    open: boolean;
    moduleId: string;
    lesson?: AdminLesson | null;
  }>({ open: false, moduleId: "" });
  const [moduleEditId, setModuleEditId] = useState<string | null>(null);
  const [moduleTitle, setModuleTitle] = useState("");
  const [addingModule, setAddingModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    type: string;
    id: string;
    name: string;
  } | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set(),
  );

  const { data: courseData, isLoading } = useGetAdminCourseDetail(courseId);
  const course = courseData as AdminCourse | undefined;

  // Auto-expand all modules when course data loads
  useEffect(() => {
    if (course?.modules?.length) {
      setExpandedModules(new Set(course.modules.map((m) => m.id)));
    }
  }, [course?.modules?.length]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });
    qc.invalidateQueries({
      queryKey: [`/api/admin/academy/courses/${courseId}`],
    });
  };

  const { mutate: createMod, isPending: creatingMod } = useCreateAdminModule({
    mutation: {
      onSuccess: () => {
        toast({ title: t("admin_academy.toast_module_added") });
        invalidate();
        setAddingModule(false);
        setNewModuleTitle("");
      },
      onError: () =>
        toast({
          title: t("admin_academy.toast_module_add_fail"),
          variant: "destructive",
        }),
    },
  });

  const { mutate: updateMod } = useUpdateAdminModule({
    mutation: {
      onSuccess: () => {
        toast({ title: t("admin_academy.toast_module_updated") });
        invalidate();
        setModuleEditId(null);
      },
    },
  });

  const { mutate: deleteMod } = useDeleteAdminModule({
    mutation: {
      onSuccess: () => {
        toast({ title: t("admin_academy.toast_module_deleted") });
        invalidate();
        setDeleteTarget(null);
      },
    },
  });

  const { mutate: deleteLesson } = useDeleteAdminLesson({
    mutation: {
      onSuccess: () => {
        toast({ title: t("admin_academy.toast_lesson_deleted") });
        invalidate();
        setDeleteTarget(null);
      },
    },
  });

  const toggleModule = (id: string) => {
    setExpandedModules((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  if (isLoading)
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );

  if (!course)
    return (
      <div className="text-muted-foreground">
        {t("admin_academy.course_not_found")}
      </div>
    );

  const titleEn = (course.title as Record<string, string>).en ?? "Untitled";

  const deleteTypeLabel =
    deleteTarget?.type === "module"
      ? t("admin_academy.type_module")
      : t("admin_academy.type_lesson");

  return (
    <div className="space-y-6">
      <LessonFormModal
        key={`${lessonModal.lesson?.id ?? "new"}-${String(lessonModal.open)}`}
        open={lessonModal.open}
        onClose={() => setLessonModal({ open: false, moduleId: "" })}
        moduleId={lessonModal.moduleId}
        courseId={courseId}
        lesson={lessonModal.lesson}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("admin_academy.delete_item_title", { type: deleteTypeLabel })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" {t("admin_academy.delete_item_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin_academy.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.type === "module")
                  deleteMod({ id: deleteTarget.id });
                if (deleteTarget.type === "lesson")
                  deleteLesson({ id: deleteTarget.id });
              }}
            >
              {t("admin_academy.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="w-4 h-4 stroke-[1.75]" /> {t("admin_academy.back_to_courses")}
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{titleEn}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("admin_academy.modules_lessons", {
              modules: course.moduleCount,
              lessons: course.lessonCount,
            })}
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setAddingModule(true)}
        >
          <Plus className="w-4 h-4 stroke-[1.75]" /> {t("admin_academy.add_module")}
        </Button>
      </div>

      {addingModule && (
        <Card>
          <CardContent className="p-3 flex gap-2">
            <Input
              autoFocus
              placeholder={t("admin_academy.module_placeholder")}
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newModuleTitle.trim()) {
                  createMod({
                    data: {
                      courseId,
                      title: mlObj(["en"], newModuleTitle.trim()),
                      order: (course.modules?.length ?? 0) + 1,
                    },
                  });
                }
                if (e.key === "Escape") {
                  setAddingModule(false);
                  setNewModuleTitle("");
                }
              }}
            />
            <Button
              size="sm"
              disabled={creatingMod || !newModuleTitle.trim()}
              onClick={() =>
                createMod({
                  data: {
                    courseId,
                    title: mlObj(["en"], newModuleTitle.trim()),
                    order: (course.modules?.length ?? 0) + 1,
                  },
                })
              }
            >
              {creatingMod ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("admin_academy.add")
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAddingModule(false);
                setNewModuleTitle("");
              }}
            >
              {t("admin_academy.cancel")}
            </Button>
          </CardContent>
        </Card>
      )}

      {(course.modules ?? []).length === 0 ? (
        <div className="text-center px-6 py-10 text-muted-foreground border border-dashed border-border rounded-xl">
          <BookOpen className="w-5 h-5 mx-auto mb-3 text-muted-foreground/70 stroke-[1.75]" />
          <p className="text-sm font-medium text-foreground">
            {t("admin_academy.no_modules")}
          </p>
          <p className="text-sm mt-1 max-w-xs mx-auto">
            {t("admin_academy.no_modules_hint")}
          </p>
          <Button
            size="sm"
            className="gap-1.5 mt-4"
            onClick={() => setAddingModule(true)}
          >
            <Plus className="w-4 h-4 stroke-[1.75]" /> {t("admin_academy.add_module")}
          </Button>
        </div>
      ) : (
        (course.modules ?? []).map((mod) => {
          const modTitle =
            (mod.title as Record<string, string>).en ?? "Untitled";
          const isExpanded = expandedModules.has(mod.id);
          return (
            <Card key={mod.id}>
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="flex items-center gap-2 flex-1 text-left"
                    onClick={() => toggleModule(mod.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
                    )}
                    {moduleEditId === mod.id ? (
                      <Input
                        autoFocus
                        value={moduleTitle}
                        className="h-7 text-sm"
                        onChange={(e) => setModuleTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            updateMod({
                              id: mod.id,
                              data: { title: mlObj(["en"], moduleTitle) },
                            });
                          if (e.key === "Escape") setModuleEditId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="font-medium text-sm text-foreground">
                        {modTitle}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-1">
                      {t("admin_academy.module_lesson_count", {
                        count: mod.lessons.length,
                      })}
                    </span>
                  </button>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setModuleEditId(mod.id);
                        setModuleTitle(modTitle);
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() =>
                        setDeleteTarget({
                          type: "module",
                          id: mod.id,
                          name: modTitle,
                        })
                      }
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-3">
                  <div className="space-y-1.5 mb-3">
                    {mod.lessons.map((lesson) => {
                      const lTitle =
                        (lesson.title as Record<string, string>).en ??
                        "Untitled";
                      return (
                        <div
                          key={lesson.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-sm font-medium text-foreground truncate">
                              {lTitle}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className={`h-1.5 w-1.5 rounded-full ${lesson.isPublished ? "bg-success" : "bg-muted-foreground/50"}`} />
                              {lesson.isPublished
                                ? t("admin_academy.published_badge")
                                : t("admin_academy.draft_badge")}
                            </span>
                            {lesson.durationSeconds > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {fmtDuration(lesson.durationSeconds)}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() =>
                                setLessonModal({
                                  open: true,
                                  moduleId: mod.id,
                                  lesson,
                                })
                              }
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  type: "lesson",
                                  id: lesson.id,
                                  name: lTitle,
                                })
                              }
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 w-full"
                    onClick={() =>
                      setLessonModal({ open: true, moduleId: mod.id })
                    }
                  >
                    <Plus className="w-3.5 h-3.5" />{" "}
                    {t("admin_academy.add_lesson")}
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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminAcademy() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courseModal, setCourseModal] = useState<{
    open: boolean;
    course?: AdminCourse | null;
  }>({ open: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [showBunny, setShowBunny] = useState(false);

  const { data, isLoading } = useListAdminCourses({
    q: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const courses = ((data as { items?: AdminCourse[] })?.items ??
    []) as AdminCourse[];

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });

  const { mutate: deleteCourse } = useDeleteAdminCourse({
    mutation: {
      onSuccess: () => {
        toast({ title: t("admin_academy.toast_course_deleted") });
        invalidate();
        setDeleteId(null);
      },
    },
  });

  const { mutate: duplicate } = useDuplicateAdminCourse({
    mutation: {
      onSuccess: () => {
        toast({ title: t("admin_academy.toast_course_dup") });
        invalidate();
      },
    },
  });

  const { mutate: updateCourseStatus } = useUpdateAdminCourse({
    mutation: {
      onSuccess: () => {
        toast({ title: t("admin_academy.toast_course_status_updated") });
        invalidate();
      },
      onError: () =>
        toast({
          title: t("admin_academy.toast_course_update_fail"),
          variant: "destructive",
        }),
    },
  });

  if (showBunny) {
    return <AdminBunnyImporter onBack={() => setShowBunny(false)} />;
  }

  if (selectedCourseId) {
    return (
      <CourseDetailView
        courseId={selectedCourseId}
        onBack={() => setSelectedCourseId(null)}
      />
    );
  }

  const filterLabels: Record<string, string> = {
    all: t("admin_academy.filter_all"),
    published: t("admin_academy.filter_published"),
    draft: t("admin_academy.filter_archived"),
  };

  return (
    <div className="space-y-8">
      <CourseFormModal
        open={courseModal.open}
        onClose={() => setCourseModal({ open: false })}
        course={courseModal.course}
        onCreated={(id) => setSelectedCourseId(id)}
      />

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("admin_academy.delete_course_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin_academy.delete_course_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin_academy.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteId && deleteCourse({ id: deleteId })}
            >
              {t("admin_academy.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PageHeader
        title={t("admin_academy.title")}
        description={t("admin_academy.subtitle")}
        actions={
          <>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowBunny(true)}
            >
              <Video className="w-4 h-4 stroke-[1.75]" /> {t("admin_bunny.title")}
            </Button>
            <Button
              className="gap-1.5"
              onClick={() => setCourseModal({ open: true })}
            >
              <Plus className="w-4 h-4 stroke-[1.75]" /> {t("admin_academy.new_course")}
            </Button>
          </>
        }
      />

      <div className="flex gap-2 items-center flex-wrap">
        <Input
          className="max-w-xs"
          placeholder={t("admin_academy.search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {["all", "published", "draft"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-md text-xs transition-colors ${statusFilter === s ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {filterLabels[s] ?? s}
            </button>
          ))}
        </div>
      </div>

      <StatGrid className="grid-cols-2 md:grid-cols-4">
        {[
          { labelKey: "admin_academy.stat_total", value: courses.length },
          {
            labelKey: "admin_academy.stat_published",
            value: courses.filter((c) => c.isPublished).length,
          },
          {
            labelKey: "admin_academy.stat_archived",
            value: courses.filter((c) => !c.isPublished).length,
          },
          {
            labelKey: "admin_academy.stat_lessons",
            value: courses.reduce((s, c) => s + c.lessonCount, 0),
          },
        ].map((s) => (
          <Stat
            key={s.labelKey}
            label={t(s.labelKey as Parameters<typeof t>[0])}
            value={s.value}
          />
        ))}
      </StatGrid>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState icon={GraduationCap} text={t("admin_academy.no_courses")}>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setCourseModal({ open: true })}
          >
            <Plus className="w-4 h-4 stroke-[1.75]" /> {t("admin_academy.create_first")}
          </Button>
        </EmptyState>
      ) : (
        <ul className="rounded-xl border border-border bg-card divide-y divide-border">
          {courses.map((course) => {
            const titleEn =
              (course.title as Record<string, string>).en ?? "Untitled";
            return (
              <li
                key={course.id}
                className="px-4 py-3 flex items-center gap-4 hover:bg-muted/50 transition-colors"
              >
                  {course.thumbnailUrl ? (
                    <img
                      src={course.thumbnailUrl}
                      alt=""
                      className="w-14 h-10 rounded object-cover shrink-0 bg-muted"
                    />
                  ) : (
                    <div className="w-14 h-10 rounded bg-muted shrink-0 flex items-center justify-center">
                      <GraduationCap className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground">
                        {titleEn}
                      </span>
                      {course.isFeatured && (
                        <Star className="w-3.5 h-3.5 stroke-[1.75] text-warning fill-warning" />
                      )}
                      <Badge
                        variant="outline"
                        className="gap-1.5 text-xs font-normal"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_COLORS[course.level] ?? "bg-muted-foreground/50"}`} />
                        {course.level}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="gap-1.5 text-xs font-normal"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${course.isPublished ? "bg-success" : "bg-muted-foreground/50"}`} />
                        {course.isPublished
                          ? t("admin_academy.published_badge")
                          : t("admin_academy.archived_badge")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {course.category}
                      {course.instructorName
                        ? ` · ${course.instructorName}`
                        : ""}
                      {` · `}
                      {t("admin_academy.modules_lessons", {
                        modules: course.moduleCount,
                        lessons: course.lessonCount,
                      })}
                      {course.estimatedDuration
                        ? ` · ${course.estimatedDuration}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setSelectedCourseId(course.id)}
                    >
                      <BookOpen className="w-3.5 h-3.5 stroke-[1.75]" />{" "}
                      {t("admin_academy.manage")}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4 stroke-[1.75]" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setSelectedCourseId(course.id)}
                        >
                          <BookOpen className="w-4 h-4 mr-2" />{" "}
                          {t("admin_academy.manage_modules")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setCourseModal({ open: true, course })}
                        >
                          <Pencil className="w-4 h-4 mr-2" />{" "}
                          {t("admin_academy.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => duplicate({ id: course.id })}
                        >
                          <Copy className="w-4 h-4 mr-2" />{" "}
                          {t("admin_academy.duplicate")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            updateCourseStatus({
                              id: course.id,
                              data: { isPublished: !course.isPublished },
                            })
                          }
                        >
                          {course.isPublished ? (
                            <Archive className="w-4 h-4 mr-2" />
                          ) : (
                            <RotateCcw className="w-4 h-4 mr-2" />
                          )}
                          {course.isPublished
                            ? t("admin_academy.archive")
                            : t("admin_academy.restore")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteId(course.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />{" "}
                          {t("admin_academy.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
