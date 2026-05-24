import { useState, useCallback } from "react";
import { Link } from "wouter";
import { useAdminSearch } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search, Users, GraduationCap, BookOpen, FileText,
  LifeBuoy, Monitor, Loader2, FileCheck,
} from "lucide-react";

type ResultItem = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

const TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  user: { label: "User", icon: Users, color: "text-info", bg: "bg-info/10" },
  course: { label: "Course", icon: GraduationCap, color: "text-primary", bg: "bg-primary/10" },
  lesson: { label: "Lesson", icon: BookOpen, color: "text-primary", bg: "bg-primary/10" },
  resource: { label: "Resource", icon: FileCheck, color: "text-success", bg: "bg-success/10" },
  article: { label: "Article", icon: FileText, color: "text-muted-foreground", bg: "bg-muted" },
  ticket: { label: "Ticket", icon: LifeBuoy, color: "text-warning", bg: "bg-warning/10" },
  equipment: { label: "Equipment", icon: Monitor, color: "text-foreground", bg: "bg-muted" },
};

export default function AdminSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => setDebouncedQ(val), 400);
    setTimer(t);
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
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Search</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Search across users, courses, lessons, resources, articles, tickets, and equipment</p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          autoFocus
          className="pl-10 h-12 text-base"
          placeholder="Search everything…"
          value={query}
          onChange={handleChange}
        />
        {isFetching && (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {debouncedQ.length < 2 && (
        <div className="py-12 text-center text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Start typing to search</p>
          <p className="text-sm mt-1 opacity-70">Searches users, courses, lessons, resources, articles, tickets, and equipment</p>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto">
            {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={type} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${cfg.bg}`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                  <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}s</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {debouncedQ.length >= 2 && !isFetching && results.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No results for "{debouncedQ}"</p>
          <p className="text-sm mt-1">Try a different keyword</p>
        </div>
      )}

      {results.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            {total} result{total !== 1 ? "s" : ""} for "{debouncedQ}"
          </p>

          {Object.entries(grouped).map(([type, typeResults]) => {
            const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.user!;
            const Icon = cfg.icon;
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                  <h3 className="text-sm font-semibold text-foreground">{cfg.label}s</h3>
                  <Badge variant="outline" className="text-xs">{typeResults.length}</Badge>
                </div>
                <Card>
                  <CardContent className="p-0">
                    {typeResults.map((item, idx) => (
                      <Link key={item.id} href={item.href}>
                        <div className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer ${idx < typeResults.length - 1 ? "border-b border-border" : ""}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cfg.bg}`}>
                            <Icon className={`w-4 h-4 ${cfg.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${cfg.bg} ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
