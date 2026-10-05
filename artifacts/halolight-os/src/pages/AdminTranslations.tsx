import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListTranslations, useEnsureTranslationRecords, useUpdateTranslationRecord,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  Languages, RefreshCw, Loader2, Filter, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, Meter, PageHeader } from "@/components/page";

const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "nl", label: "Nederlands" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "pl", label: "Polski" },
];

const CONTENT_TYPES = [
  { value: "course", labelKey: "admin_translations.type_course" },
  { value: "module", labelKey: "admin_translations.type_module" },
  { value: "lesson", labelKey: "admin_translations.type_lesson" },
  { value: "kb_article", labelKey: "admin_translations.type_kb_article" },
  { value: "resource", labelKey: "admin_translations.type_resource" },
  { value: "ai_knowledge_doc", labelKey: "admin_translations.type_ai_knowledge_doc" },
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
  const STATUS_CONFIG: Record<string, { dot: string; key: string }> = {
    draft:        { dot: "bg-muted-foreground/50", key: "admin_translations.status_draft" },
    needs_review: { dot: "bg-warning",             key: "admin_translations.status_needs_review" },
    approved:     { dot: "bg-success",             key: "admin_translations.status_approved" },
    published:    { dot: "bg-info",                key: "admin_translations.status_published" },
    missing:      { dot: "bg-destructive",         key: "admin_translations.status_missing" },
  };
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["draft"]!;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", cfg.dot)} /> {t(cfg.key as Parameters<typeof t>[0])}
    </span>
  );
}

function CompletenessBar({ score, lang }: { score: number; lang: string }) {
  const langLabel = LANGUAGES.find(l => l.code === lang)?.label ?? lang.toUpperCase();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{langLabel}</span>
        <span className="text-foreground tabular-nums">{score}%</span>
      </div>
      <Meter value={score} />
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
    <div className="space-y-8 max-w-[1400px]">
      <PageHeader
        title={t("admin_translations.title")}
        description={t("admin_translations.subtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={handleEnsure} disabled={ensuring}>
            {ensuring ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 stroke-[1.75] mr-2" />}
            {t("admin_translations.sync_btn")}
          </Button>
        }
      />

      {Object.keys(completenessScore).length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-foreground mb-3">{t("admin_translations.completeness_title")}</h2>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-x-6 gap-y-4">
              {LANGUAGES.map(lang => (
                <CompletenessBar key={lang.code} lang={lang.code} score={completenessScore[lang.code] ?? 0} />
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 stroke-[1.75] text-muted-foreground" />
              <Input className="pl-9" placeholder={t("admin_translations.search_placeholder")} value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <Select value={contentType || "all"} onValueChange={v => setContentType(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("admin_translations.all_types")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin_translations.all_types")}</SelectItem>
                {CONTENT_TYPES.map(ct => (
                  <SelectItem key={ct.value} value={ct.value}>{t(ct.labelKey)}</SelectItem>
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
              <Filter className="w-4 h-4 stroke-[1.75] mr-1" /> {t("admin_translations.clear_btn")}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 rounded-xl border border-border bg-card">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={Languages} text={t("admin_translations.no_records")}>
              <p className="text-[13px] text-muted-foreground">{t("admin_translations.no_records_hint")}</p>
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-[13px] font-normal text-muted-foreground">{t("admin_translations.col_content")}</th>
                    <th className="text-left px-4 py-3 text-[13px] font-normal text-muted-foreground">{t("admin_translations.col_type")}</th>
                    {LANGUAGES.map(l => (
                      <th key={l.code} className="text-center px-2 py-3 text-[13px] font-normal text-muted-foreground w-20">
                        {l.code.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr key={item.contentId} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">
                        {item.sourceTitle}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs font-normal capitalize">
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
                              className="rounded-md px-1.5 py-1 hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
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
      </div>

      <Dialog open={!!editId} onOpenChange={open => !open && setEditId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin_translations.edit_title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-normal text-muted-foreground">{t("admin_translations.label_status")}</Label>
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
              <Label className="text-[13px] font-normal text-muted-foreground">{t("admin_translations.label_translated_title")}</Label>
              <Input
                placeholder={t("admin_translations.placeholder_title")}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-normal text-muted-foreground">{t("admin_translations.label_translated_body")}</Label>
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
