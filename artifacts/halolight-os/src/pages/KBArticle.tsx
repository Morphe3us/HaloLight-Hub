import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetKbArticle } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, Clock, ChevronRight } from "lucide-react";
import { Section } from "@/components/page";
import { KBMarkdown } from "./KBMarkdown";

function formatDate(d: string | Date | null | undefined, language: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(language, { month: "long", day: "numeric", year: "numeric" });
}


export default function KBArticle() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { data: article, isLoading, isError, error, refetch } = useGetKbArticle(id!);

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-8 w-48 bg-muted rounded-md animate-pulse" />
        <div className="h-6 w-3/4 bg-muted rounded-md animate-pulse" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="max-w-3xl mx-auto rounded-xl border border-dashed border-border px-6 py-10 text-center">
        <p role="alert" className="text-sm text-muted-foreground">{(error as { status?: number })?.status === 404 || !isError ? t("kb.article_not_found") : t("kb.load_error", { defaultValue: "Unable to load documentation." })}</p>
        {isError && <Button variant="outline" size="sm" className="mt-4 mr-2" onClick={() => void refetch()}>{t("kb.retry", { defaultValue: "Retry" })}</Button>}
        <Link href="/kb"><Button variant="outline" size="sm" className="mt-4">{t("kb.back_to_kb")}</Button></Link>
      </div>
    );
  }

  const related = (article as unknown as { related?: Array<{ id: string; title: string; excerpt?: string }> }).related ?? [];

  return (
    <div className="max-w-3xl space-y-10">
      <div className="flex items-center gap-3">
        <Link href="/kb">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 stroke-[1.75]" />
            {t("kb.title")}
          </Button>
        </Link>
      </div>

      <article lang={article.language} className="min-w-0 break-words">
        <div className="mb-6">
          {article.tags?.map((tag) => (
            <Badge key={tag} variant="outline" className="mr-1.5 mb-1.5 text-[11px] font-normal text-muted-foreground">{tag}</Badge>
          ))}
          <Badge variant="outline" className="text-[11px] font-normal uppercase">{article.language?.toUpperCase()}</Badge>
          <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight text-foreground mt-3 mb-3">{article.title}</h1>
          {(article.sourceKey || article.sourceRevision) && <div className="text-xs text-muted-foreground space-y-1 mb-3 break-all">
            {article.sourceKey && <p>{t("kb.source", { defaultValue: "Source" })}: {article.sourceKey}</p>}
            {article.sourceRevision && <p>{t("kb.revision", { defaultValue: "Revision" })}: {article.sourceRevision}</p>}
          </div>}
          {article.excerpt && <p className="text-base text-muted-foreground mb-4">{article.excerpt}</p>}
          <div className="flex flex-wrap items-center gap-4 text-[13px] text-muted-foreground border-b border-border pb-4">
            <span className="flex items-center gap-1.5 tabular-nums"><Clock className="w-3.5 h-3.5 stroke-[1.75]" /> {formatDate(article.publishedAt ?? article.createdAt, i18n.language)}</span>
            <span className="flex items-center gap-1.5 tabular-nums"><Eye className="w-3.5 h-3.5 stroke-[1.75]" /> {article.views} {t("kb.views")}</span>
          </div>
        </div>
        <div className="prose-sm max-w-none">
          <KBMarkdown content={article.content ?? ""} />
        </div>
      </article>

      {related.length > 0 && (
        <Section title={t("kb.related_articles")}>
          <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/kb/articles/${r.id}`} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{r.title}</p>
                    {r.excerpt && <p className="text-xs text-muted-foreground truncate">{r.excerpt}</p>}
                  </div>
                  <ChevronRight className="w-4 h-4 stroke-[1.75] text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
