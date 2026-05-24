import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useListKbCategories, useListKbArticles, useGetCurrentUser } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Search, ChevronRight, FileText, Eye, Hash,
  Lightbulb, Wrench, CreditCard, Star, Zap, Settings, HelpCircle,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen, FileText, Lightbulb, Wrench, CreditCard, Star, Zap, Settings, HelpCircle, Hash,
};

function getIcon(name: string) {
  return iconMap[name] ?? BookOpen;
}

export default function KnowledgeBase() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: categoriesData, isLoading: catsLoading } = useListKbCategories();
  const { data: articlesData, isLoading: articlesLoading } = useListKbArticles({
    categoryId: selectedCategory ?? undefined,
    search: search || undefined,
    status: "published",
  });
  const { data: currentUser } = useGetCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  const categories = categoriesData?.items ?? [];
  const articles = articlesData?.items ?? [];
  const isSearching = search.length > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("kb.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("kb.find_subtitle")}</p>
        </div>
        {isAdmin && (
          <Link href="/kb/admin">
            <Button variant="outline" className="gap-2">
              <Settings className="w-4 h-4" />
              {t("kb.manage_articles")}
            </Button>
          </Link>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          placeholder={t("kb.search_placeholder2")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-11 h-12 text-base rounded-xl"
        />
      </div>

      {isSearching || selectedCategory ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-foreground">
              {isSearching
                ? t("kb.search_results_for", { query: search })
                : categories.find((c) => c.id === selectedCategory)?.name}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setSelectedCategory(null); }}>
              {t("kb.clear")}
            </Button>
          </div>
          {articlesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
            </div>
          ) : articles.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">{t("kb.no_articles_found")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {articles.map((article) => (
                <Link key={article.id} href={`/kb/articles/${article.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          {article.tags?.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                          ))}
                        </div>
                        <p className="font-medium text-foreground">{article.title}</p>
                        {article.excerpt && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{article.excerpt}</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Eye className="w-3 h-3" />{article.views}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {catsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {categories.map((cat) => {
                const Icon = getIcon(cat.icon ?? "BookOpen");
                return (
                  <Card
                    key={cat.id}
                    className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
                    onClick={() => setSelectedCategory(cat.id ?? null)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground truncate">{cat.name}</h3>
                          {cat.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{cat.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("kb.articles_count_label", { count: (cat as unknown as { articleCount?: number }).articleCount ?? 0 })}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground">{t("kb.recently_published")}</h2>
            </div>
            {articlesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted rounded animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {articles.slice(0, 5).map((article) => (
                  <Link key={article.id} href={`/kb/articles/${article.id}`}>
                    <Card className="hover:shadow-sm transition-shadow cursor-pointer group">
                      <CardContent className="p-3 flex items-center gap-3">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-sm font-medium text-foreground group-hover:text-primary transition-colors">{article.title}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                          <Eye className="w-3 h-3" />{article.views}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
