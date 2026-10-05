import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useListAdminClients } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Users, ChevronRight, Calendar, FileText, LifeBuoy, TrendingUp, Loader2,
} from "lucide-react";
import { EmptyState, PageHeader, StatGrid } from "@/components/page";
import { cn } from "@/lib/utils";

const tierConfig: Record<string, { dot: string }> = {
  champion:   { dot: "bg-foreground" },
  healthy:    { dot: "bg-success" },
  developing: { dot: "bg-warning" },
  at_risk:    { dot: "bg-destructive" },
};

function ScoreBadge({ score, tier }: { score?: number | null; tier?: string | null }) {
  const { t } = useTranslation();
  const tierLabels: Record<string, string> = {
    champion:   t("admin_clients.tier_champion"),
    healthy:    t("admin_clients.tier_healthy"),
    developing: t("admin_clients.tier_developing"),
    at_risk:    t("admin_clients.tier_at_risk"),
  };
  if (score === null || score === undefined || !tier) {
    return <Badge variant="outline" className="text-xs font-normal text-muted-foreground">{t("admin_clients.unscored")}</Badge>;
  }
  const cfg = tierConfig[tier] ?? tierConfig.developing!;
  return (
    <Badge variant="outline" className="gap-1.5 text-xs font-normal text-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      <span className="tabular-nums">{score}</span>
      <span className="text-muted-foreground">· {tierLabels[tier] ?? tier}</span>
    </Badge>
  );
}

export default function AdminClients() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  const { data, isLoading } = useListAdminClients();
  const clients = data?.items ?? [];

  const filtered = clients.filter((c) => {
    const matchSearch = !search
      || (c.fullName ?? "").toLowerCase().includes(search.toLowerCase())
      || (c.email ?? "").toLowerCase().includes(search.toLowerCase())
      || (c.companyName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchTier = tierFilter === "all" || c.tier === tierFilter;
    return matchSearch && matchTier;
  });

  const stats = {
    champion:   clients.filter((c) => c.tier === "champion").length,
    healthy:    clients.filter((c) => c.tier === "healthy").length,
    developing: clients.filter((c) => c.tier === "developing").length,
    at_risk:    clients.filter((c) => c.tier === "at_risk").length,
  };

  const tierLabels: Record<string, string> = {
    champion:   t("admin_clients.tier_champion"),
    healthy:    t("admin_clients.tier_healthy"),
    developing: t("admin_clients.tier_developing"),
    at_risk:    t("admin_clients.tier_at_risk"),
  };

  return (
    <div className="space-y-10">
      <PageHeader
        title={t("admin_clients.title")}
        description={t("admin_clients.subtitle")}
        actions={
          <Link href="/admin/analytics">
            <Button variant="outline" size="sm" className="gap-2">
              <TrendingUp className="w-4 h-4 stroke-[1.75]" />
              {t("admin_clients.analytics_btn")}
            </Button>
          </Link>
        }
      />

      <StatGrid className="md:grid-cols-4">
        {(["champion", "healthy", "developing", "at_risk"] as const).map((tier) => {
          const cfg = tierConfig[tier]!;
          const active = tierFilter === tier;
          return (
            <button
              type="button"
              key={tier}
              className={cn(
                "relative flex flex-col justify-between gap-4 p-5 min-h-[116px] text-left shadow-[1px_1px_0_0_hsl(var(--border))] transition-colors hover:bg-muted/50",
                active && "bg-muted/60",
              )}
              onClick={() => setTierFilter(tierFilter === tier ? "all" : tier)}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={cn("text-[13px] leading-snug", active ? "text-foreground" : "text-muted-foreground")}>{tierLabels[tier]}</span>
                <span className={cn("h-1.5 w-1.5 rounded-full mt-1.5 shrink-0", cfg.dot)} />
              </div>
              <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{stats[tier]}</p>
            </button>
          );
        })}
      </StatGrid>

      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 stroke-[1.75] text-muted-foreground" />
            <Input
              placeholder={t("admin_clients.search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t("admin_clients.all_tiers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin_clients.all_tiers")}</SelectItem>
              <SelectItem value="champion">{t("admin_clients.tier_champion")}</SelectItem>
              <SelectItem value="healthy">{t("admin_clients.tier_healthy")}</SelectItem>
              <SelectItem value="developing">{t("admin_clients.tier_developing")}</SelectItem>
              <SelectItem value="at_risk">{t("admin_clients.tier_at_risk")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} text={t("admin_clients.no_clients")} />
        ) : (
          <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {filtered.map((client) => (
              <li key={client.id}>
                <Link href={`/admin/clients/${client.id}`} className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-medium text-foreground">
                    {(client.fullName ?? client.email ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {client.fullName ?? client.email}
                      </p>
                      {client.companyName && (
                        <span className="text-[13px] text-muted-foreground truncate">· {client.companyName}</span>
                      )}
                    </div>
                    <p className="text-[13px] text-muted-foreground truncate">{client.email}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <ScoreBadge score={client.score} tier={client.tier} />
                    <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3 stroke-[1.75]" />{client.eventsCount ?? 0}</span>
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3 stroke-[1.75]" />{client.quotesCount ?? 0}</span>
                      <span className="flex items-center gap-1"><LifeBuoy className="w-3 h-3 stroke-[1.75]" />{client.ticketsCount ?? 0}</span>
                      {(client.coachingCount ?? 0) > 0 && (
                        <Badge variant="outline" className="text-xs font-normal px-1.5 py-0 gap-1.5 text-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
                          {t("admin_clients.coaching_badge", { count: client.coachingCount })}
                        </Badge>
                      )}
                      {(client.upsellCount ?? 0) > 0 && (
                        <Badge variant="outline" className="text-xs font-normal px-1.5 py-0 gap-1.5 text-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-info" aria-hidden="true" />
                          {t("admin_clients.upsell_badge", { count: client.upsellCount })}
                        </Badge>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 stroke-[1.75] text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
