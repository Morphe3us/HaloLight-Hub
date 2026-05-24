import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListAIKnowledgeDocs, useCreateAIKnowledgeDoc, useUpdateAIKnowledgeDoc,
  useDeleteAIKnowledgeDoc, useReindexAIKnowledgeDoc, useGetAIKnowledgeDoc,
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Brain, Plus, Pencil, Trash2, RefreshCw, Loader2, Search, Filter,
  CheckCircle2, AlertCircle, Archive, Clock, Layers, Tag, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "faq", label: "FAQ" },
  { value: "troubleshooting", label: "Troubleshooting" },
  { value: "printer_manual", label: "Printer Manual" },
  { value: "camera_manual", label: "Camera Manual" },
  { value: "software_guide", label: "Software Guide" },
  { value: "business_guide", label: "Business Guide" },
  { value: "pricing_guide", label: "Pricing Guide" },
  { value: "event_guide", label: "Event Guide" },
  { value: "product_guide", label: "Product Guide" },
  { value: "academy_lesson", label: "Academy Lesson" },
  { value: "support_article", label: "Support Article" },
];

const STATUSES = [
  { value: "draft",        icon: <Clock className="w-3 h-3" />,         color: "bg-muted text-muted-foreground" },
  { value: "indexed",      icon: <CheckCircle2 className="w-3 h-3" />,  color: "bg-success/10 text-success border-success/30" },
  { value: "needs_review", icon: <AlertCircle className="w-3 h-3" />,   color: "bg-warning/10 text-warning border-warning/30" },
  { value: "archived",     icon: <Archive className="w-3 h-3" />,        color: "bg-muted text-muted-foreground" },
];

const LANGUAGES = [
  { code: "en", label: "English" }, { code: "fr", label: "French" },
  { code: "de", label: "German" }, { code: "nl", label: "Dutch" },
  { code: "es", label: "Spanish" }, { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" }, { code: "pl", label: "Polish" },
];

type AIDoc = {
  id: string; title: string; language: string; category: string;
  productModel?: string | null; sourceUrl?: string | null; content: string;
  tags: string[]; aiActive: boolean; lastIndexedAt?: string | null;
  status: string; createdAt: string; updatedAt: string;
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const statusLabels: Record<string, string> = {
    draft:        t("admin_ai.status_draft"),
    indexed:      t("admin_ai.status_indexed"),
    needs_review: t("admin_ai.status_needs_review"),
    archived:     t("admin_ai.status_archived"),
  };
  const cfg = STATUSES.find(s => s.value === status) ?? STATUSES[0]!;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", cfg.color)}>
      {cfg.icon} {statusLabels[status] ?? status}
    </span>
  );
}

const EMPTY_FORM = {
  title: "", language: "en", category: "", productModel: "", sourceUrl: "",
  content: "", tags: "", aiActive: true, status: "draft",
};

export default function AdminAIKnowledge() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterLang, setFilterLang] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<AIDoc | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState<string | null>(null);

  const { data, isLoading } = useListAIKnowledgeDocs({
    category: filterCat || undefined,
    language: filterLang || undefined,
    status: filterStatus || undefined,
    aiActive: filterActive || undefined,
    q: q || undefined,
  });
  const { data: detailData } = useGetAIKnowledgeDoc(detailId ?? "");
  const createMutation = useCreateAIKnowledgeDoc();
  const updateMutation = useUpdateAIKnowledgeDoc();
  const deleteMutation = useDeleteAIKnowledgeDoc();
  const reindexMutation = useReindexAIKnowledgeDoc();

  const items: AIDoc[] = (data?.items as AIDoc[] | undefined) ?? [];
  const activeCount = items.filter(i => i.aiActive).length;
  const needsReviewCount = items.filter(i => i.status === "needs_review").length;
  const indexedCount = items.filter(i => i.status === "indexed").length;

  function openCreate() {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(item: AIDoc) {
    setEditItem(item);
    setForm({
      title: item.title,
      language: item.language,
      category: item.category,
      productModel: item.productModel ?? "",
      sourceUrl: item.sourceUrl ?? "",
      content: item.content,
      tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
      aiActive: item.aiActive,
      status: item.status,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title || !form.category) {
      toast({ title: t("admin_ai.toast_required"), variant: "destructive" });
      return;
    }
    setSaving(true);
    const tags = form.tags.split(",").map(s => s.trim()).filter(Boolean);
    try {
      if (editItem) {
        await updateMutation.mutateAsync({
          id: editItem.id,
          data: {
            title: form.title,
            language: form.language,
            category: form.category as "faq",
            productModel: form.productModel || undefined,
            sourceUrl: form.sourceUrl || undefined,
            content: form.content,
            tags,
            aiActive: form.aiActive,
            status: form.status as "draft",
          },
        });
        toast({ title: t("admin_ai.toast_updated") });
      } else {
        await createMutation.mutateAsync({
          data: {
            title: form.title,
            language: form.language,
            category: form.category as "faq",
            productModel: form.productModel || undefined,
            sourceUrl: form.sourceUrl || undefined,
            content: form.content,
            tags,
            aiActive: form.aiActive,
            status: form.status as "draft",
          },
        });
        toast({ title: t("admin_ai.toast_created") });
      }
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ["/admin/ai-knowledge"] });
    } catch {
      toast({ title: t("admin_ai.toast_save_fail"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      toast({ title: t("admin_ai.toast_deleted") });
      setDeleteId(null);
      void qc.invalidateQueries({ queryKey: ["/admin/ai-knowledge"] });
    } catch {
      toast({ title: t("admin_ai.toast_delete_fail"), variant: "destructive" });
    }
  }

  async function handleReindex(id: string) {
    setReindexing(id);
    try {
      const result = await reindexMutation.mutateAsync({ id });
      toast({ title: t("admin_ai.toast_reindexed", { count: result.chunksCreated }) });
      void qc.invalidateQueries({ queryKey: ["/admin/ai-knowledge"] });
    } catch {
      toast({ title: t("admin_ai.toast_reindex_fail"), variant: "destructive" });
    } finally {
      setReindexing(null);
    }
  }

  async function handleToggleActive(item: AIDoc) {
    try {
      await updateMutation.mutateAsync({ id: item.id, data: { aiActive: !item.aiActive } });
      void qc.invalidateQueries({ queryKey: ["/admin/ai-knowledge"] });
    } catch {
      toast({ title: t("admin_ai.toast_update_fail"), variant: "destructive" });
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-6 h-6 text-[var(--accent)]" /> {t("admin_ai.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("admin_ai.subtitle")}</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="w-4 h-4 mr-2" /> {t("admin_ai.add_btn")}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold text-foreground">{items.length}</div>
            <div className="text-xs text-muted-foreground">{t("admin_ai.stat_total")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold text-success">{activeCount}</div>
            <div className="text-xs text-muted-foreground">{t("admin_ai.stat_active")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold text-info">{indexedCount}</div>
            <div className="text-xs text-muted-foreground">{t("admin_ai.stat_indexed")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold text-warning">{needsReviewCount}</div>
            <div className="text-xs text-muted-foreground">{t("admin_ai.stat_review")}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder={t("admin_ai.search_placeholder")} value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <Select value={filterCat || "all"} onValueChange={v => setFilterCat(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t("admin_ai.label_category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin_ai.all_categories")}</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterLang || "all"} onValueChange={v => setFilterLang(v === "all" ? "" : v)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder={t("admin_ai.label_language")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin_ai.all_languages")}</SelectItem>
                {LANGUAGES.map(l => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus || "all"} onValueChange={v => setFilterStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t("admin_ai.label_status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin_ai.all_statuses")}</SelectItem>
                {STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>
                    <StatusBadge status={s.value} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterActive || "all"} onValueChange={v => setFilterActive(v === "all" ? "" : v)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder={t("admin_ai.ai_active_label")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin_ai.filter_all")}</SelectItem>
                <SelectItem value="true">{t("admin_ai.filter_active")}</SelectItem>
                <SelectItem value="false">{t("admin_ai.filter_inactive")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); setFilterCat(""); setFilterLang(""); setFilterStatus(""); setFilterActive(""); }}>
              <Filter className="w-4 h-4 mr-1" /> {t("admin_ai.clear")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Brain className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">{t("admin_ai.no_docs")}</p>
              <p className="text-sm mt-1">{t("admin_ai.no_docs_hint")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map(item => (
                <div key={item.id} className="flex items-start gap-4 px-4 py-4 hover:bg-muted/20 transition-colors">
                  <div className="flex-shrink-0 mt-1">
                    <Switch
                      checked={item.aiActive}
                      onCheckedChange={() => handleToggleActive(item)}
                      title={item.aiActive ? t("admin_ai.filter_inactive") : t("admin_ai.filter_active")}
                    />
                  </div>

                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetailId(detailId === item.id ? null : item.id)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{item.title}</span>
                      <StatusBadge status={item.status} />
                      {!item.aiActive && (
                        <span className="text-xs text-muted-foreground italic">{t("admin_ai.inactive")}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize">
                        {CATEGORIES.find(c => c.value === item.category)?.label ?? item.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{item.language.toUpperCase()}</span>
                      {item.productModel && (
                        <span className="text-xs text-muted-foreground">· {item.productModel}</span>
                      )}
                      {Array.isArray(item.tags) && item.tags.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Tag className="w-3 h-3" />
                          {item.tags.slice(0, 3).join(", ")}
                          {item.tags.length > 3 && ` +${item.tags.length - 3}`}
                        </span>
                      )}
                      {item.lastIndexedAt && (
                        <span className="text-xs text-muted-foreground">
                          {t("admin_ai.indexed_date")} {new Date(item.lastIndexedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {item.content && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{item.content}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {item.sourceUrl && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => handleReindex(item.id)}
                      disabled={reindexing === item.id}
                    >
                      {reindexing === item.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RefreshCw className="w-4 h-4" />}
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

      {detailId && detailData && (
        <Card className="border-[var(--accent)]/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4" /> {t("admin_ai.chunks_for")} {(detailData as { title: string }).title}
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {t("admin_ai.chunks_count", { count: ((detailData as { chunks?: unknown[] }).chunks ?? []).length })}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {((detailData as { chunks?: Array<{ id: string; chunkIndex: number; content: string }> }).chunks ?? []).map((chunk) => (
                <div key={chunk.id} className="bg-muted/30 rounded-lg p-3 text-xs">
                  <span className="text-muted-foreground font-mono">#{chunk.chunkIndex + 1} · </span>
                  {chunk.content}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? t("admin_ai.dialog_edit") : t("admin_ai.dialog_add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>{t("admin_ai.label_title")} <span className="text-destructive">*</span></Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin_ai.label_category")} <span className="text-destructive">*</span></Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin_ai.label_language")}</Label>
                <Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin_ai.label_product_model")}</Label>
                <Input value={form.productModel} onChange={e => setForm(f => ({ ...f, productModel: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin_ai.label_source_url")}</Label>
                <Input value={form.sourceUrl} onChange={e => setForm(f => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://…" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin_ai.label_status")}</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s.value} value={s.value}><StatusBadge status={s.value} /></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin_ai.label_tags")}</Label>
                <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="tag1, tag2, tag3" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{t("admin_ai.label_content")}</Label>
                <Textarea rows={8} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder={t("admin_ai.content_hint")} />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={form.aiActive} onCheckedChange={v => setForm(f => ({ ...f, aiActive: v }))} />
              <Label>{t("admin_ai.ai_active_label")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>{t("admin_ai.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !form.title || !form.category}>
              {saving
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{t("admin_ai.saving")}</>
                : editItem ? t("admin_ai.update") : t("admin_ai.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin_ai.delete_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin_ai.delete_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin_ai.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={handleDelete}>
              {t("admin_ai.delete_btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
