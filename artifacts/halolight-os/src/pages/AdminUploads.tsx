import { useState, useRef, useCallback } from "react";
import {
  useListUploads, useCreateUpload, useUpdateUpload, useDeleteUpload,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Plus, Pencil, Trash2, ExternalLink, Loader2,
  FileText, Image, Video, FileArchive, Search, Filter, FolderUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "academy", label: "Academy" },
  { value: "knowledge_base", label: "Knowledge Base" },
  { value: "resources", label: "Resources" },
  { value: "marketing", label: "Marketing" },
  { value: "contracts", label: "Contracts" },
  { value: "product_manuals", label: "Product Manuals" },
  { value: "ai_knowledge_base", label: "AI Knowledge Base" },
  { value: "support_documentation", label: "Support Documentation" },
];

const VISIBILITY = [
  { value: "admin_only", label: "Admin Only" },
  { value: "client_visible", label: "Client Visible" },
  { value: "ai_only", label: "AI Only" },
  { value: "public_resource", label: "Public Resource" },
];

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "nl", label: "Dutch" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "pl", label: "Polish" },
];

function getFileIcon(mimeType?: string | null) {
  if (!mimeType) return <FileText className="w-5 h-5 text-muted-foreground" />;
  if (mimeType.startsWith("image/")) return <Image className="w-5 h-5 text-info" />;
  if (mimeType.startsWith("video/")) return <Video className="w-5 h-5 text-warning" />;
  if (mimeType.includes("zip") || mimeType.includes("archive")) return <FileArchive className="w-5 h-5 text-[var(--accent)]" />;
  return <FileText className="w-5 h-5 text-muted-foreground" />;
}

function visibilityColor(v: string) {
  if (v === "admin_only") return "bg-destructive/10 text-destructive border-destructive/30";
  if (v === "client_visible") return "bg-success/10 text-success border-success/30";
  if (v === "ai_only") return "bg-info/10 text-info border-info/30";
  return "bg-muted text-muted-foreground";
}

type UploadItem = {
  id: string; title: string; language: string; category: string;
  fileUrl: string; fileName?: string | null; mimeType?: string | null;
  fileSize?: number | null; visibility: string; status: string;
  relatedProduct?: string | null; description?: string | null;
  createdAt: string;
};

const EMPTY_FORM = {
  title: "", language: "en", category: "", fileUrl: "", fileName: "",
  mimeType: "", fileSize: "", visibility: "admin_only", relatedProduct: "",
  relatedCourseId: "", relatedLessonId: "", description: "",
};

export default function AdminUploads() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterVis, setFilterVis] = useState("");
  const [filterLang, setFilterLang] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<UploadItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { data, isLoading } = useListUploads({
    category: filterCat || undefined,
    visibility: filterVis || undefined,
    language: filterLang || undefined,
    q: q || undefined,
  });
  const createMutation = useCreateUpload();
  const updateMutation = useUpdateUpload();
  const deleteMutation = useDeleteUpload();

  const items: UploadItem[] = (data?.items as UploadItem[] | undefined) ?? [];

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

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    setForm(f => ({
      ...f,
      fileName: file.name,
      mimeType: file.type,
      fileSize: String(file.size),
      title: f.title || file.name.replace(/\.[^/.]+$/, ""),
    }));
    toast({ title: "File info captured — paste the file URL below to complete the upload" });
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({
      ...f,
      fileName: file.name,
      mimeType: file.type,
      fileSize: String(file.size),
      title: f.title || file.name.replace(/\.[^/.]+$/, ""),
    }));
    toast({ title: "File info captured — paste the file URL below to complete the upload" });
  }

  async function handleSave() {
    if (!form.title || !form.category || !form.fileUrl) {
      toast({ title: "Title, category and file URL are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editItem) {
        await updateMutation.mutateAsync({
          id: editItem.id,
          data: {
            title: form.title,
            language: form.language,
            category: form.category as "academy",
            fileUrl: form.fileUrl,
            fileName: form.fileName || undefined,
            mimeType: form.mimeType || undefined,
            fileSize: form.fileSize ? Number(form.fileSize) : undefined,
            visibility: form.visibility as "admin_only",
            relatedProduct: form.relatedProduct || undefined,
            description: form.description || undefined,
          },
        });
        toast({ title: "Upload updated" });
      } else {
        await createMutation.mutateAsync({
          data: {
            title: form.title,
            language: form.language,
            category: form.category as "academy",
            fileUrl: form.fileUrl,
            fileName: form.fileName || undefined,
            mimeType: form.mimeType || undefined,
            fileSize: form.fileSize ? Number(form.fileSize) : undefined,
            visibility: form.visibility as "admin_only",
            relatedCourseId: form.relatedCourseId || undefined,
            relatedLessonId: form.relatedLessonId || undefined,
            relatedProduct: form.relatedProduct || undefined,
            description: form.description || undefined,
          },
        });
        toast({ title: "Upload record created" });
      }
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ["/admin/uploads"] });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      toast({ title: "Upload deleted" });
      setDeleteId(null);
      void qc.invalidateQueries({ queryKey: ["/admin/uploads"] });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  }

  const formatBytes = (bytes?: number | null) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FolderUp className="w-6 h-6 text-[var(--accent)]" /> Upload Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage files and documents across all content areas</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="w-4 h-4 mr-2" /> Add Upload
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {CATEGORIES.slice(0, 4).map(cat => {
          const count = (data?.items as UploadItem[] | undefined)?.filter(i => i.category === cat.value).length ?? 0;
          return (
            <Card key={cat.value} className="cursor-pointer hover:border-[var(--accent)] transition-colors"
              onClick={() => setFilterCat(filterCat === cat.value ? "" : cat.value)}>
              <CardContent className="pt-4 pb-3">
                <div className="text-xl font-bold text-foreground">{count}</div>
                <div className="text-xs text-muted-foreground">{cat.label}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search uploads…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <Select value={filterCat || "all"} onValueChange={v => setFilterCat(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterVis || "all"} onValueChange={v => setFilterVis(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All visibility</SelectItem>
                {VISIBILITY.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterLang || "all"} onValueChange={v => setFilterLang(v === "all" ? "" : v)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                {LANGUAGES.map(l => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); setFilterCat(""); setFilterVis(""); setFilterLang(""); }}>
              <Filter className="w-4 h-4 mr-1" /> Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Upload className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">No uploads yet</p>
              <p className="text-sm mt-1">Add your first upload using the button above</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className="flex-shrink-0">{getFileIcon(item.mimeType)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground truncate">{item.title}</span>
                      {item.fileName && (
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">{item.fileName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize">
                        {item.category.replace("_", " ")}
                      </Badge>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", visibilityColor(item.visibility))}>
                        {VISIBILITY.find(v => v.value === item.visibility)?.label ?? item.visibility}
                      </span>
                      <span className="text-xs text-muted-foreground">{item.language.toUpperCase()}</span>
                      {item.fileSize && (
                        <span className="text-xs text-muted-foreground">{formatBytes(item.fileSize)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                      <a href={item.fileUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(item.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Upload" : "Add Upload"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Drop zone (create only) */}
            {!editItem && (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                  dragOver ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-border hover:border-[var(--accent)]/50"
                )}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Drop a file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Captures file metadata — enter the URL below</p>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Title *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Document title" />
              </div>
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>File URL *</Label>
                <Input value={form.fileUrl} onChange={e => setForm(f => ({ ...f, fileUrl: e.target.value }))}
                  placeholder="https://files.example.com/document.pdf" />
              </div>
              <div className="space-y-1.5">
                <Label>File Name</Label>
                <Input value={form.fileName} onChange={e => setForm(f => ({ ...f, fileName: e.target.value }))}
                  placeholder="document.pdf" />
              </div>
              <div className="space-y-1.5">
                <Label>MIME Type</Label>
                <Input value={form.mimeType} onChange={e => setForm(f => ({ ...f, mimeType: e.target.value }))}
                  placeholder="application/pdf" />
              </div>
              <div className="space-y-1.5">
                <Label>Visibility</Label>
                <Select value={form.visibility} onValueChange={v => setForm(f => ({ ...f, visibility: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VISIBILITY.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Related Product</Label>
                <Input value={form.relatedProduct} onChange={e => setForm(f => ({ ...f, relatedProduct: e.target.value }))}
                  placeholder="DNP DS-RX1HS" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Description</Label>
                <Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of the file…" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete upload record?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the record. The actual file at the URL will not be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
