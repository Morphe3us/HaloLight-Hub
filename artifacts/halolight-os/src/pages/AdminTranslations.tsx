import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListTranslations, useEnsureTranslationRecords, useUpdateTranslationRecord,
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Languages, RefreshCw, Loader2, CheckCircle2, AlertCircle,
  Clock, Globe, Filter, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "nl", label: "Dutch" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "pl", label: "Polish" },
];

const CONTENT_TYPES = [
  { value: "course", label: "Courses" },
  { value: "module", label: "Modules" },
  { value: "lesson", label: "Lessons" },
  { value: "kb_article", label: "KB Articles" },
  { value: "resource", label: "Resources" },
  { value: "ai_knowledge_doc", label: "AI Knowledge Docs" },
];

type TranslationItem = {
  contentId: string;
  contentType: string;
  sourceTitle: string;
  sourceLanguage: string;
  translations: Record<string, { id: string; status: string }>;
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; key: string }> = {
    draft:        { color: "bg-muted text-muted-foreground",                       icon: <Clock className="w-3 h-3" />,        key: "admin_translations.status_draft" },
    needs_review: { color: "bg-warning/10 text-warning border-warning/30",         icon: <AlertCircle className="w-3 h-3" />,   key: "admin_translations.status_needs_review" },
    approved:     { color: "bg-success/10 text-success border-success/30",         icon: <CheckCircle2 className="w-3 h-3" />,  key: "admin_translations.status_approved" },
    published:    { color: "bg-info/10 text-info border-info/30",                  icon: <Globe className="w-3 h-3" />,         key: "admin_translations.status_published" },
    missing:      { color: "bg-destructive/10 text-destructive border-destructive/30", icon: <AlertCircle className="w-3 h-3" />, key: "admin_translations.status_missing" },
  };
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["draft"]!;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", cfg.color)}>
      {cfg.icon} {t(cfg.key as Parameters<typeof t>[0])}
    </span>
  );
}

function CompletenessBar({ score, lang }: { score: number; lang: string }) {
  const langLabel = LANGUAGES.find(l => l.code === lang)?.label ?? lang.toUpperCase();
  const color = score >= 80 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-destructive";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{langLabel}</span>
        <span className="text-muted-foreground">{score}%</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function AdminTranslations() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [contentType, setContentType] = useState("");
  const [language, setLanguage] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("draft");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [ensuring, setEnsuring] = useState(false);

  const { data, isLoading } = useListTranslations({
    contentType: contentType || undefined,
    language: language || undefined,
    status: status || undefined,
    q: q || undefined,
  });

  const updateMutation = useUpdateTranslationRecord();
  const ensureMutation = useEnsureTranslationRecords();

  const items: TranslationItem[] = (data?.items as TranslationItem[] | undefined) ?? [];
  const completenessScore: Record<string, number> = (data as { completenessScore?: Record<string, number> })?.completenessScore ?? {};

  async function handleEnsure() {
    setEnsuring(true);
    try {
      const result = await ensureMutation.mutateAsync();
      toast({ title: t("admin_translations.toast_synced", { count: result.created }) });
      void qc.invalidateQueries({ queryKey: ["/admin/translations"] });
    } catch {
      toast({ title: t("admin_translations.toast_sync_failed"), variant: "destructive" });
    } finally {
      setEnsuring(false);
    }
  }

  function openEdit(id: string, currentStatus: string) {
    setEditId(id);
    setEditStatus(currentStatus);
    setEditTitle("");
    setEditBody("");
  }

  async function handleSave() {
    if (!editId) return;
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        id: editId,
        data: {
          status: editStatus as "draft" | "needs_review" | "approved" | "published",
          translatedTitle: editTitle || undefined,
          translatedBody: editBody || undefined,
        },
      });
      toast({ title: t("admin_translations.toast_updated") });
      setEditId(null);
      void qc.invalidateQueries({ queryKey: ["/admin/translations"] });
    } catch {
      toast({ title: t("admin_translations.toast_update_failed"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Languages className="w-6 h-6 text-[var(--accent)]" /> {t("admin_translations.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("admin_translations.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleEnsure} disabled={ensuring}>
          {ensuring ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {t("admin_translations.sync_btn")}
        </Button>
      </div>

      {Object.keys(completenessScore).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("admin_translations.completeness_title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
              {LANGUAGES.map(lang => (
                <CompletenessBar key={lang.code} lang={lang.code} score={completenessScore[lang.code] ?? 0} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder={t("admin_translations.search_placeholder")} value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <Select value={contentType || "all"} onValueChange={v => setContentType(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("admin_translations.all_types")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin_translations.all_types")}</SelectItem>
                {CONTENT_TYPES.map(ct => (
                  <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={language || "all"} onValueChange={v => setLanguage(v === "all" ? "" : v)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t("admin_translations.all_languages")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin_translations.all_languages")}</SelectItem>
                {LANGUAGES.map(l => (
                  <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status || "all"} onValueChange={v => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t("admin_translations.all_statuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin_translations.all_statuses")}</SelectItem>
                {["draft", "needs_review", "approved", "published", "missing"].map(s => (
                  <SelectItem key={s} value={s}>{t(`admin_translations.status_${s}` as Parameters<typeof t>[0])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => { setContentType(""); setLanguage(""); setStatus(""); setQ(""); }}>
              <Filter className="w-4 h-4 mr-1" /> {t("admin_translations.clear_btn")}
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
              <Languages className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">{t("admin_translations.no_records")}</p>
              <p className="text-sm mt-1">{t("admin_translations.no_records_hint")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("admin_translations.col_content")}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("admin_translations.col_type")}</th>
                    {LANGUAGES.map(l => (
                      <th key={l.code} className="text-center px-2 py-3 font-medium text-muted-foreground w-20">
                        {l.code.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr key={item.contentId} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">
                        {item.sourceTitle}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs capitalize">
                          {item.contentType.replace("_", " ")}
                        </Badge>
                      </td>
                      {LANGUAGES.map(lang => {
                        const tr = item.translations[lang.code] ?? { id: "", status: "missing" };
                        return (
                          <td key={lang.code} className="px-2 py-3 text-center">
                            <button
                              onClick={() => tr.id ? openEdit(tr.id, tr.status) : undefined}
                              disabled={!tr.id}
                              className="disabled:cursor-default"
                            >
                              <StatusBadge status={tr.status} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editId} onOpenChange={open => !open && setEditId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin_translations.edit_title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("admin_translations.label_status")}</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t("admin_translations.status_draft")}</SelectItem>
                  <SelectItem value="needs_review">{t("admin_translations.status_needs_review")}</SelectItem>
                  <SelectItem value="approved">{t("admin_translations.status_approved")}</SelectItem>
                  <SelectItem value="published">{t("admin_translations.status_published")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin_translations.label_translated_title")}</Label>
              <Input
                placeholder={t("admin_translations.placeholder_title")}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin_translations.label_translated_body")}</Label>
              <Textarea
                rows={5}
                placeholder={t("admin_translations.placeholder_body")}
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>{t("admin_translations.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t("admin_translations.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
