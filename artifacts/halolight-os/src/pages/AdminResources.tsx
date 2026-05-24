import { useState } from "react";
import {
  useListResources, useCreateResource, useUpdateResource, useDeleteResource,
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
  Plus, Pencil, Trash2, ExternalLink, FileText, Loader2,
  FileCheck, Megaphone, Layout, Scroll, ListChecks, BookMarked,
} from "lucide-react";

type ResourceItem = {
  id: string; title: string; category: string; language: string;
  fileUrl: string; description?: string | null; status: string;
  createdAt: string; updatedAt?: string;
};

const CATEGORIES = [
  { value: "pdf", label: "PDF", icon: FileText, color: "text-destructive" },
  { value: "marketing", label: "Marketing", icon: Megaphone, color: "text-info" },
  { value: "template", label: "Template", icon: Layout, color: "text-primary" },
  { value: "contract", label: "Contract", icon: Scroll, color: "text-warning" },
  { value: "checklist", label: "Checklist", icon: ListChecks, color: "text-success" },
  { value: "guide", label: "Guide", icon: BookMarked, color: "text-muted-foreground" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "nl", label: "Nederlands" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "pl", label: "Polski" },
];

function catCfg(cat: string) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[0]!;
}

const EMPTY_FORM = { title: "", category: "pdf", language: "en", fileUrl: "", description: "", status: "draft" };

function ResourceFormModal({
  open, onClose, resource,
}: {
  open: boolean; onClose: () => void; resource?: ResourceItem | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!resource;

  const [form, setForm] = useState(resource ? {
    title: resource.title,
    category: resource.category,
    language: resource.language,
    fileUrl: resource.fileUrl,
    description: resource.description ?? "",
    status: resource.status,
  } : { ...EMPTY_FORM });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/admin/resources"] });

  const { mutate: create, isPending: creating } = useCreateResource({
    mutation: {
      onSuccess: () => { toast({ title: "Resource created" }); invalidate(); onClose(); },
      onError: () => toast({ title: "Failed to create resource", variant: "destructive" }),
    },
  });

  const { mutate: update, isPending: updating } = useUpdateResource({
    mutation: {
      onSuccess: () => { toast({ title: "Resource updated" }); invalidate(); onClose(); },
      onError: () => toast({ title: "Failed to update resource", variant: "destructive" }),
    },
  });

  const isPending = creating || updating;

  const set = (k: keyof typeof EMPTY_FORM) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.category || !form.language || !form.fileUrl) return;
    const category = form.category as "pdf" | "marketing" | "template" | "contract" | "checklist" | "guide";
    const status = form.status as "draft" | "published";
    const payload = {
      title: form.title,
      category,
      language: form.language,
      fileUrl: form.fileUrl,
      description: form.description || null,
      status,
    };
    if (isEdit) update({ id: resource!.id, data: payload });
    else create({ data: payload });
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Resource" : "Add Resource"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input value={form.title} onChange={e => set("title")(e.target.value)} placeholder="Resource title…" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category <span className="text-destructive">*</span></Label>
              <Select value={form.category} onValueChange={set("category")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Language <span className="text-destructive">*</span></Label>
              <Select value={form.language} onValueChange={set("language")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>File URL <span className="text-destructive">*</span></Label>
            <Input value={form.fileUrl} onChange={e => set("fileUrl")(e.target.value)} placeholder="https://…" required />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} value={form.description} onChange={e => set("description")(e.target.value)} placeholder="Brief description…" />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={set("status")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending || !form.title || !form.fileUrl}>
              {isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving…</> : isEdit ? "Save Changes" : "Add Resource"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminResources() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [langFilter, setLangFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState<{ open: boolean; resource?: ResourceItem | null }>({ open: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useListResources({
    q: search || undefined,
    category: categoryFilter === "all" ? undefined : categoryFilter,
    language: langFilter === "all" ? undefined : langFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const items = ((data as { items?: ResourceItem[] })?.items ?? []) as ResourceItem[];

  const { mutate: deleteResource } = useDeleteResource({
    mutation: {
      onSuccess: () => { toast({ title: "Resource deleted" }); qc.invalidateQueries({ queryKey: ["/api/admin/resources"] }); setDeleteId(null); },
    },
  });

  return (
    <div className="space-y-5">
      <ResourceFormModal open={modal.open} onClose={() => setModal({ open: false })} resource={modal.resource} />

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete resource?</AlertDialogTitle>
            <AlertDialogDescription>This resource will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteId && deleteResource({ id: deleteId })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resource Library</h1>
          <p className="text-sm text-muted-foreground mt-0.5">PDFs, templates, contracts, and marketing assets</p>
        </div>
        <Button className="gap-1.5" onClick={() => setModal({ open: true })}>
          <Plus className="w-4 h-4" /> Add Resource
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {CATEGORIES.map(cat => {
          const CatIcon = cat.icon;
          const count = items.filter(r => r.category === cat.value).length;
          return (
            <button key={cat.value}
              onClick={() => setCategoryFilter(categoryFilter === cat.value ? "all" : cat.value)}
              className={`rounded-xl border p-3 text-center transition-colors ${categoryFilter === cat.value ? "bg-primary/8 border-primary/30" : "bg-card border-border hover:border-border/80"}`}>
              <CatIcon className={`w-5 h-5 mx-auto mb-1 ${cat.color}`} />
              <p className="text-lg font-bold text-foreground">{count}</p>
              <p className="text-xs text-muted-foreground">{cat.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <Input
          className="max-w-xs"
          placeholder="Search resources…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Select value={langFilter} onValueChange={setLangFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Language" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Languages</SelectItem>
            {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          {["all", "published", "draft"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">No resources found</p>
            <Button size="sm" className="gap-1.5 mt-3" onClick={() => setModal({ open: true })}>
              <Plus className="w-4 h-4" /> Add first resource
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3 font-medium">Title</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Category</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Language</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const cfg = catCfg(item.category);
                  const CatIcon = cfg.icon;
                  const langLabel = LANGUAGES.find(l => l.value === item.language)?.label ?? item.language;
                  return (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CatIcon className={`w-4 h-4 shrink-0 ${cfg.color}`} />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate max-w-[200px]">{item.title}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Badge variant="outline" className="text-xs capitalize">{item.category}</Badge>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{langLabel}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.status === "published" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                          {item.status === "published" ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a href={item.fileUrl} target="_blank" rel="noreferrer">
                            <Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink className="w-3.5 h-3.5" /></Button>
                          </a>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, resource: item })}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
