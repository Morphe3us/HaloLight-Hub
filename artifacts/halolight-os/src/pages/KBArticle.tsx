import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetKbArticle } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Eye, Clock, FileText, ChevronRight } from "lucide-react";
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
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-border rounded animate-pulse" />
        <div className="h-6 w-3/4 bg-border rounded animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p role="alert" className="text-muted-foreground">{(error as { status?: number })?.status === 404 || !isError ? t("kb.article_not_found") : t("kb.load_error", { defaultValue: "Unable to load documentation." })}</p>
        {isError && <Button variant="outline" className="mt-4 mr-2" onClick={() => void refetch()}>{t("kb.retry", { defaultValue: "Retry" })}</Button>}
        <Link href="/kb"><Button variant="outline" className="mt-4">{t("kb.back_to_kb")}</Button></Link>
      </div>
    );
  }

  const related = (article as unknown as { related?: Array<{ id: string; title: string; excerpt?: string }> }).related ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/kb">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t("kb.title")}
          </Button>
        </Link>
      </div>

      <article lang={article.language} className="py-4 min-w-0 break-words">
        <div className="mb-6">
          {article.tags?.map((tag) => (
            <Badge key={tag} variant="secondary" className="mr-1.5 mb-1.5 text-xs">{tag}</Badge>
          ))}
          <Badge variant="outline">{article.language?.toUpperCase()}</Badge>
          <h1 className="text-2xl font-bold text-foreground mt-2 mb-3">{article.title}</h1>
          {(article.sourceKey || article.sourceRevision) && <div className="text-xs text-muted-foreground space-y-1 mb-3 break-all">
            {article.sourceKey && <p>{t("kb.source", { defaultValue: "Source" })}: {article.sourceKey}</p>}
            {article.sourceRevision && <p>{t("kb.revision", { defaultValue: "Revision" })}: {article.sourceRevision}</p>}
          </div>}
          {article.excerpt && <p className="text-lg text-muted-foreground mb-4">{article.excerpt}</p>}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground border-b pb-4">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatDate(article.publishedAt ?? article.createdAt, i18n.language)}</span>
            <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {article.views} {t("kb.views")}</span>
          </div>
        </div>
        <div className="prose-sm max-w-none">
          <KBMarkdown content={article.content ?? ""} />
        </div>
      </article>

      {related.length > 0 && (
        <div>
          <h2 className="font-semibold text-foreground mb-3">{t("kb.related_articles")}</h2>
          <div className="space-y-2">
            {related.map((r) => (
              <Link key={r.id} href={`/kb/articles/${r.id}`}>
                <Card className="hover:shadow-sm cursor-pointer group transition-shadow">
                  <CardContent className="p-3 flex items-center gap-3">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{r.title}</p>
                      {r.excerpt && <p className="text-xs text-muted-foreground truncate">{r.excerpt}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
