import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useListKbCategories, useListKbArticles, useGetCurrentUser } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initialKbLanguage, kbLanguages, type KbLanguage } from "@/lib/kbLanguage";
import { Search, ChevronLeft, ChevronRight, Settings, RotateCw, AlertCircle } from "lucide-react";
import { Notice, PageHeader } from "@/components/page";

const PAGE_SIZE = 20;

export default function KnowledgeBase() {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState<KbLanguage>(() => initialKbLanguage(i18n.resolvedLanguage ?? i18n.language));
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (search.trim() === debouncedSearch) return;
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setOffset(0); }, 300);
    return () => window.clearTimeout(timer);
  }, [search, debouncedSearch]);

  const cats = useListKbCategories({ language });
  const articlesQuery = useListKbArticles({ language, categoryId: selectedCategory || undefined,
    search: debouncedSearch || undefined, status: "published", limit: PAGE_SIZE, offset });
  const { data: currentUser } = useGetCurrentUser();
  const articles = articlesQuery.data?.items ?? [];
  const total = articlesQuery.data?.total ?? 0;
  useEffect(() => {
    if (articlesQuery.data && offset >= total && offset > 0) setOffset(Math.max(0, Math.ceil(total / PAGE_SIZE) - 1) * PAGE_SIZE);
  }, [articlesQuery.data, offset, total]);
  const pending = articlesQuery.isFetching || search.trim() !== debouncedSearch;
  const changeLanguage = (value: KbLanguage) => {
    setLanguage(value); setSelectedCategory(""); setOffset(0);
  };

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader
        title={t("kb.title")}
        actions={currentUser?.role === "admin" && <Link href="/kb/admin"><Button variant="outline" className="gap-2">
          <Settings className="w-4 h-4 stroke-[1.75]" />{t("kb.manage_articles")}
        </Button></Link>}
      />
      <div className="flex flex-wrap gap-3 items-end">
        <label className="space-y-1.5 text-sm">
          <span className="block text-[13px] text-muted-foreground">{t("kb.content_language", { defaultValue: "Content language" })}</span>
          <select className="h-10 rounded-md border border-input bg-background px-3" value={language}
            onChange={e => changeLanguage(e.target.value as KbLanguage)}>
            {Object.entries(kbLanguages).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm max-w-full">
          <span className="block text-[13px] text-muted-foreground">{t("kb_admin.label_category")}</span>
          <select className="h-10 rounded-md border border-input bg-background px-3 max-w-full" value={selectedCategory}
            disabled={cats.isLoading || cats.isError} onChange={e => { setSelectedCategory(e.target.value); setOffset(0); }}>
            <option value="">{t("kb_admin.all_categories")}</option>
            {cats.data?.items?.map(cat => <option key={cat.id} value={cat.id}>{cat.name} ({cat.articleCount ?? 0})</option>)}
          </select>
        </label>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-3 h-4 w-4 stroke-[1.75] text-muted-foreground" />
          <Input aria-label={t("kb.search_placeholder2")} placeholder={t("kb.search_placeholder2")}
            value={search} maxLength={200} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>
      {language !== "fr" && <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
        <p>{t("kb.french_fallback", { defaultValue: "French documentation is available; choose French to consult it" })}</p>
        <Button variant="link" onClick={() => changeLanguage("fr")}>Français</Button>
      </div>}
      {cats.isError && <Notice tone="warning" icon={AlertCircle} title={t("kb.load_error", { defaultValue: "Unable to load documentation." })}
        action={<Button variant="outline" size="sm" onClick={() => void cats.refetch()}><RotateCw className="w-4 h-4 mr-2" />{t("kb.retry", { defaultValue: "Retry" })}</Button>} />}
      <section aria-busy={pending} className="space-y-3">
        {articlesQuery.isError ? <Notice icon={AlertCircle} title={t("kb.load_error", { defaultValue: "Unable to load documentation." })}
          action={<Button variant="outline" size="sm" onClick={() => void articlesQuery.refetch()}><RotateCw className="w-4 h-4 mr-2" />{t("kb.retry", { defaultValue: "Retry" })}</Button>} />
        : articlesQuery.isLoading ? <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {[1, 2, 3].map(i => <div key={i} className="h-20 px-4 py-3"><div className="h-full bg-muted rounded-md animate-pulse" /></div>)}
        </div> : articles.length === 0 ? <div role="status" className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">{t("kb.no_articles_found")}</div> : (
          <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {articles.map(article => (
              <li key={article.id}>
                <Link href={`/kb/articles/${article.id}`} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground break-words">{article.title}</p>
                    {article.excerpt && <p className="text-[13px] text-muted-foreground line-clamp-2 break-words mt-0.5">{article.excerpt}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge variant="outline" className="text-[11px] font-normal uppercase">{article.language?.toUpperCase()}</Badge>
                      {article.tags?.slice(0, 3).map(tag => <Badge key={tag} variant="outline" className="max-w-full break-all text-[11px] font-normal text-muted-foreground">{tag}</Badge>)}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0 stroke-[1.75] text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {!articlesQuery.isError && total > 0 && <nav className="flex flex-wrap items-center justify-between gap-3" aria-label={t("kb.title")}>
        <span className="text-[13px] text-muted-foreground tabular-nums" role="status">{t("kb.page_status", { defaultValue: "{{from}}–{{to}} of {{total}}", from: offset + 1, to: Math.min(offset + PAGE_SIZE, total), total })}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" disabled={offset === 0 || pending} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}
            aria-label={t("kb.previous_page", { defaultValue: "Previous page" })} title={t("kb.previous_page", { defaultValue: "Previous page" })}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" disabled={offset + PAGE_SIZE >= total || pending} onClick={() => setOffset(value => value + PAGE_SIZE)}
            aria-label={t("kb.next_page", { defaultValue: "Next page" })} title={t("kb.next_page", { defaultValue: "Next page" })}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </nav>}
    </div>
  );
}
