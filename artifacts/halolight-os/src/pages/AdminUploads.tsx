import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListUploads,
  useCreateUpload,
  useUpdateUpload,
  useDeleteUpload,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { openAuthenticatedFile } from "@/lib/authenticatedFile";
import { apiErrorMessage } from "@/lib/apiErrorMessage";
import {
  Upload,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  FileText,
  Image,
  Video,
  FileArchive,
  Search,
  Filter,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, Notice, PageHeader, StatGrid } from "@/components/page";

const CATEGORIES = [
  { value: "academy" },
  { value: "knowledge_base" },
  { value: "resources" },
  { value: "marketing" },
  { value: "contracts" },
  { value: "product_manuals" },
  { value: "ai_knowledge_base" },
  { value: "support_documentation" },
];

const VISIBILITY = [
  { value: "admin_only" },
  { value: "client_visible" },
  { value: "ai_only" },
  { value: "public_resource" },
];

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "nl", label: "Nederlands" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "pl", label: "Polski" },
];

function getFileIcon(mimeType?: string | null) {
  const cls = "w-4 h-4 stroke-[1.75] text-muted-foreground";
  if (!mimeType) return <FileText className={cls} />;
  if (mimeType.startsWith("image/"))
    return <Image className={cls} />;
  if (mimeType.startsWith("video/"))
    return <Video className={cls} />;
  if (mimeType.includes("zip") || mimeType.includes("archive"))
    return <FileArchive className={cls} />;
  return <FileText className={cls} />;
}

function visibilityColor(v: string) {
  if (v === "admin_only") return "bg-destructive";
  if (v === "client_visible") return "bg-success";
  if (v === "ai_only") return "bg-info";
  return "bg-muted-foreground/50";
}

type UploadItem = {
  id: string;
  title: string;
  language: string;
  category: string;
  fileUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  visibility: string;
  status: string;
  relatedProduct?: string | null;
  description?: string | null;
  createdAt: string;
};

const EMPTY_FORM = {
  title: "",
  language: "en",
  category: "",
  fileUrl: "",
  fileName: "",
  mimeType: "",
  fileSize: "",
  visibility: "admin_only",
  relatedProduct: "",
  relatedCourseId: "",
  relatedLessonId: "",
  description: "",
};

export default function AdminUploads() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterVis, setFilterVis] = useState("");
  const [filterLang, setFilterLang] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<UploadItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, isError, error, refetch } = useListUploads({
    category: filterCat || undefined,
    visibility: filterVis || undefined,
    language: filterLang || undefined,
    q: q || undefined,
  });
  const createMutation = useCreateUpload();
  const updateMutation = useUpdateUpload();
  const deleteMutation = useDeleteUpload();

  const items: UploadItem[] = (data?.items as UploadItem[] | undefined) ?? [];

  const catLabel = (value: string): string => {
    const key = `admin_uploads.cat_${value}` as Parameters<typeof t>[0];
    return t(key);
  };

  const visLabel = (value: string): string => {
    const key = `admin_uploads.vis_${value}` as Parameters<typeof t>[0];
    const result = t(key);
    return result === key ? value : result;
  };

  function openCreate() {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(item: UploadItem) {
    setEditItem(item);
    setForm({
      title: item.title,
      language: item.language,
      category: item.category,
      fileUrl: item.fileUrl,
      fileName: item.fileName ?? "",
      mimeType: item.mimeType ?? "",
      fileSize: item.fileSize ? String(item.fileSize) : "",
      visibility: item.visibility,
      relatedProduct: item.relatedProduct ?? "",
      relatedCourseId: "",
      relatedLessonId: "",
      description: item.description ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title || !form.category || !form.fileUrl) {
      toast({
        title: t("admin_uploads.toast_required"),
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      let fileUrl = form.fileUrl;
      let fileName = form.fileName || undefined;
      let mimeType = form.mimeType || undefined;
      let fileSize = form.fileSize ? Number(form.fileSize) : undefined;

      if (editItem) {
        await updateMutation.mutateAsync({
          id: editItem.id,
          data: {
            title: form.title,
            language: form.language,
            category: form.category as "academy",
            fileUrl,
            fileName,
            mimeType,
            fileSize,
            visibility: form.visibility as "admin_only",
            relatedProduct: form.relatedProduct || undefined,
            description: form.description || undefined,
          },
        });
        toast({ title: t("admin_uploads.toast_updated") });
      } else {
        await createMutation.mutateAsync({
          data: {
            title: form.title,
            language: form.language,
            category: form.category as "academy",
            fileUrl,
            fileName,
            mimeType,
            fileSize,
            visibility: form.visibility as "admin_only",
            relatedCourseId: form.relatedCourseId || undefined,
            relatedLessonId: form.relatedLessonId || undefined,
            relatedProduct: form.relatedProduct || undefined,
            description: form.description || undefined,
          },
        });
        toast({ title: t("admin_uploads.toast_created") });
      }
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ["/api/admin/uploads"] });
    } catch (error) {
      toast({
        title: t("admin_uploads.toast_save_failed"),
        description: apiErrorMessage(
          error,
          t("admin_uploads.toast_save_failed"),
        ),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      toast({ title: t("admin_uploads.toast_deleted") });
      setDeleteId(null);
      void qc.invalidateQueries({ queryKey: ["/api/admin/uploads"] });
    } catch {
      toast({
        title: t("admin_uploads.toast_delete_failed"),
        variant: "destructive",
      });
    }
  }

  async function handleOpenFile(item: UploadItem) {
    try {
      await openAuthenticatedFile(item.fileUrl, item.fileName ?? item.title);
    } catch {
      toast({
        title: t("admin_uploads.toast_open_failed"),
        variant: "destructive",
      });
    }
  }

  const formatBytes = (bytes?: number | null) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-8 max-w-[1400px]">
      <PageHeader
        title={t("admin_uploads.title")}
        description={t("admin_uploads.subtitle")}
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 stroke-[1.75] mr-2" /> {t("admin_uploads.add_btn")}
          </Button>
        }
      />

      <StatGrid className="grid-cols-2 md:grid-cols-4">
        {CATEGORIES.slice(0, 4).map((cat) => {
          const count =
            (data?.items as UploadItem[] | undefined)?.filter(
              (i) => i.category === cat.value,
            ).length ?? 0;
          return (
            <button
              type="button"
              key={cat.value}
              className={cn(
                "flex flex-col justify-between gap-4 p-5 min-h-[116px] text-left shadow-[1px_1px_0_0_hsl(var(--border))] transition-colors",
                filterCat === cat.value ? "bg-muted" : "hover:bg-muted/50",
              )}
              onClick={() =>
                setFilterCat(filterCat === cat.value ? "" : cat.value)
              }
            >
              <span className="text-[13px] leading-snug text-muted-foreground">
                {catLabel(cat.value)}
              </span>
              <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{count}</span>
            </button>
          );
        })}
      </StatGrid>

      <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 stroke-[1.75] text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t("admin_uploads.search_placeholder")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select
              value={filterCat || "all"}
              onValueChange={(v) => setFilterCat(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t("admin_uploads.label_category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("admin_uploads.all_categories")}
                </SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {catLabel(c.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterVis || "all"}
              onValueChange={(v) => setFilterVis(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-40">
                <SelectValue
                  placeholder={t("admin_uploads.label_visibility")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("admin_uploads.all_visibility")}
                </SelectItem>
                {VISIBILITY.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {visLabel(v.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterLang || "all"}
              onValueChange={(v) => setFilterLang(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder={t("admin_uploads.all_languages")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("admin_uploads.all_languages")}
                </SelectItem>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ("");
                setFilterCat("");
                setFilterVis("");
                setFilterLang("");
              }}
            >
              <Filter className="w-4 h-4 stroke-[1.75] mr-1" /> {t("admin_uploads.clear")}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 rounded-xl border border-border bg-card">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <Notice
              icon={AlertCircle}
              title={t("admin_uploads.error_loading")}
              action={
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  {t("admin_uploads.retry")}
                </Button>
              }
            >
              {apiErrorMessage(error, t("admin_uploads.error_loading"))}
            </Notice>
          ) : items.length === 0 ? (
            <EmptyState icon={Upload} text={t("admin_uploads.no_uploads")}>
              <p className="text-[13px] text-muted-foreground">
                {t("admin_uploads.no_uploads_hint")}
              </p>
            </EmptyState>
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {getFileIcon(item.mimeType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">
                        {item.title}
                      </span>
                      {item.fileName && (
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {item.fileName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs font-normal">
                        {catLabel(item.category)}
                      </Badge>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            visibilityColor(item.visibility),
                          )}
                        />
                        {visLabel(item.visibility)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.language.toUpperCase()}
                      </span>
                      {item.fileSize && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatBytes(item.fileSize)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => void handleOpenFile(item)}
                    >
                      <ExternalLink className="w-4 h-4 stroke-[1.75]" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="w-4 h-4 stroke-[1.75]" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(item.id)}
                    >
                      <Trash2 className="w-4 h-4 stroke-[1.75]" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editItem
                ? t("admin_uploads.dialog_edit")
                : t("admin_uploads.dialog_add")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editItem && (
              <div className="rounded-lg border border-border px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  {t("admin_uploads.url_only_title")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("admin_uploads.url_only_hint")}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>
                  {t("admin_uploads.label_title")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder={t("admin_uploads.placeholder_title")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  {t("admin_uploads.label_category")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {catLabel(c.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin_uploads.label_language")}</Label>
                <Select
                  value={form.language}
                  onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>
                  {t("admin_uploads.label_file_url")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.fileUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fileUrl: e.target.value }))
                  }
                  placeholder={t("admin_uploads.placeholder_url")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin_uploads.label_file_name")}</Label>
                <Input
                  value={form.fileName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fileName: e.target.value }))
                  }
                  placeholder={t("admin_uploads.placeholder_file_name")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin_uploads.label_mime")}</Label>
                <Input
                  value={form.mimeType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, mimeType: e.target.value }))
                  }
                  placeholder="application/pdf"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin_uploads.label_visibility")}</Label>
                <Select
                  value={form.visibility}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, visibility: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIBILITY.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {visLabel(v.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin_uploads.label_product")}</Label>
                <Input
                  value={form.relatedProduct}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, relatedProduct: e.target.value }))
                  }
                  placeholder="DNP DS-RX1HS"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{t("admin_uploads.label_description")}</Label>
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder={t("admin_uploads.placeholder_desc")}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("admin_uploads.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {saving
                ? t("admin_uploads.saving")
                : editItem
                  ? t("admin_uploads.update")
                  : t("admin_uploads.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("admin_uploads.delete_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin_uploads.delete_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin_uploads.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t("admin_uploads.delete_btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
