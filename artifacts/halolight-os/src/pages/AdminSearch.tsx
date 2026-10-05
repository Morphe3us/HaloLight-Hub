import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useAdminSearch } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Users, GraduationCap, BookOpen, FileText,
  LifeBuoy, Monitor, Loader2, FileCheck,
} from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";

type ResultItem = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

const TYPE_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }> }> = {
  user:      { icon: Users },
  course:    { icon: GraduationCap },
  lesson:    { icon: BookOpen },
  resource:  { icon: FileCheck },
  article:   { icon: FileText },
  ticket:    { icon: LifeBuoy },
  equipment: { icon: Monitor },
};

export default function AdminSearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const typeLabels: Record<string, string> = {
    user:      t("admin_search.type_user"),
    course:    t("admin_search.type_course"),
    lesson:    t("admin_search.type_lesson"),
    resource:  t("admin_search.type_resource"),
    article:   t("admin_search.type_article"),
    ticket:    t("admin_search.type_ticket"),
    equipment: t("admin_search.type_equipment"),
  };

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (timer) clearTimeout(timer);
    const t2 = setTimeout(() => setDebouncedQ(val), 400);
    setTimer(t2);
  }, [timer]);

  const { data, isFetching } = useAdminSearch({ q: debouncedQ.trim().length >= 2 ? debouncedQ : "" });

  const results = ((data as { items?: ResultItem[] })?.items ?? []) as ResultItem[];
  const total = (data as { total?: number })?.total ?? 0;

  const grouped = results.reduce<Record<string, ResultItem[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type]!.push(r);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title={t("admin_search.title")} description={t("admin_search.subtitle")} />

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 stroke-[1.75] text-muted-foreground pointer-events-none" />
        <Input
          autoFocus
          className="pl-10 h-11 text-base"
          placeholder={t("admin_search.placeholder")}
          value={query}
          onChange={handleChange}
        />
        {isFetching && (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {debouncedQ.length < 2 && (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <Search className="w-5 h-5 mx-auto mb-3 stroke-[1.75] text-muted-foreground/70" />
          <p className="text-sm text-foreground">{t("admin_search.type_hint")}</p>
          <p className="text-[13px] text-muted-foreground mt-1">{t("admin_search.type_hint_sub")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
            {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={type} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card">
                  <Icon className="w-3.5 h-3.5 stroke-[1.75] text-muted-foreground" />
                  <span className="text-[13px] text-muted-foreground">{typeLabels[type]}s</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {debouncedQ.length >= 2 && !isFetching && results.length === 0 && (
        <EmptyState icon={Search} text={t("admin_search.no_results", { query: debouncedQ })}>
          <p className="text-[13px] text-muted-foreground">{t("admin_search.try_keyword")}</p>
        </EmptyState>
      )}

      {results.length > 0 && (
        <div className="space-y-8">
          <p className="text-[13px] text-muted-foreground">
            {total === 1
              ? t("admin_search.result_one", { count: total, query: debouncedQ })
              : t("admin_search.results_many", { count: total, query: debouncedQ })}
          </p>

          {Object.entries(grouped).map(([type, typeResults]) => {
            const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.user!;
            const Icon = cfg.icon;
            const label = typeLabels[type] ?? type;
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-medium text-foreground">{label}s</h3>
                  <span className="text-[13px] tabular-nums text-muted-foreground">{typeResults.length}</span>
                </div>
                <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                  {typeResults.map((item) => (
                    <li key={item.id}>
                      <Link href={item.href}>
                        <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer">
                          <Icon className="w-4 h-4 stroke-[1.75] text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                            <p className="text-[13px] text-muted-foreground truncate">{item.subtitle}</p>
                          </div>
                          <Badge variant="outline" className="text-xs font-normal text-muted-foreground shrink-0">
                            {label}
                          </Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
