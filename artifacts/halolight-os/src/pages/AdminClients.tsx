import { useState } from "react";
import { Link } from "wouter";
import { useListAdminClients } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Users, ChevronRight, AlertTriangle, Activity, Heart, Award,
  Calendar, FileText, LifeBuoy, Lightbulb, TrendingUp, Loader2,
} from "lucide-react";

const tierConfig: Record<string, { label: string; bg: string; text: string; border: string; icon: React.ComponentType<{ className?: string }> }> = {
  champion:   { label: "Champion",   bg: "bg-muted",  text: "text-foreground",  border: "border-border", icon: Award },
  healthy:    { label: "Healthy",    bg: "bg-success/10",   text: "text-success",   border: "border-green-200",  icon: Heart },
  developing: { label: "Developing", bg: "bg-warning/10",  text: "text-yellow-700",  border: "border-yellow-200", icon: Activity },
  at_risk:    { label: "At Risk",    bg: "bg-destructive/10",     text: "text-destructive",     border: "border-destructive/30",    icon: AlertTriangle },
};

function ScoreBadge({ score, tier }: { score?: number | null; tier?: string | null }) {
  if (score === null || score === undefined || !tier) {
    return <Badge variant="secondary" className="text-xs">Unscored</Badge>;
  }
  const cfg = tierConfig[tier] ?? tierConfig.developing!;
  const TierIcon = cfg.icon;
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
      <TierIcon className="w-3 h-3" />
      <span>{score}</span>
      <span className="opacity-70">· {cfg.label}</span>
    </div>
  );
}

export default function AdminClients() {
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
    champion: clients.filter((c) => c.tier === "champion").length,
    healthy: clients.filter((c) => c.tier === "healthy").length,
    developing: clients.filter((c) => c.tier === "developing").length,
    at_risk: clients.filter((c) => c.tier === "at_risk").length,
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Success</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Monitor health scores, coaching needs, and upsell opportunities</p>
        </div>
        <Link href="/admin/analytics">
          <Button variant="outline" className="gap-2 text-sm">
            <TrendingUp className="w-4 h-4" />
            Analytics Dashboard
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {(["champion", "healthy", "developing", "at_risk"] as const).map((tier) => {
          const cfg = tierConfig[tier]!;
          const TierIcon = cfg.icon;
          return (
            <Card
              key={tier}
              className={`cursor-pointer transition-all ${tierFilter === tier ? `${cfg.border} border-2` : "border"}`}
              onClick={() => setTierFilter(tierFilter === tier ? "all" : tier)}
            >
              <CardContent className={`p-4 ${cfg.bg} rounded-lg`}>
                <div className="flex items-center justify-between mb-1">
                  <TierIcon className={`w-4 h-4 ${cfg.text}`} />
                  <span className={`text-2xl font-bold ${cfg.text}`}>{stats[tier]}</span>
                </div>
                <p className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="champion">Champion</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="developing">Developing</SelectItem>
            <SelectItem value="at_risk">At Risk</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Users className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No clients found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((client) => (
            <Link key={client.id} href={`/admin/clients/${client.id}`}>
              <Card className="hover:shadow-md transition-all cursor-pointer group">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0 font-bold text-primary">
                    {(client.fullName ?? client.email ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-foreground truncate">
                        {client.fullName ?? client.email}
                      </p>
                      {client.companyName && (
                        <span className="text-xs text-muted-foreground">· {client.companyName}</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{client.email}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <ScoreBadge score={client.score} tier={client.tier} />
                    <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{client.eventsCount ?? 0}</span>
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{client.quotesCount ?? 0}</span>
                      <span className="flex items-center gap-1"><LifeBuoy className="w-3 h-3" />{client.ticketsCount ?? 0}</span>
                      {(client.coachingCount ?? 0) > 0 && (
                        <Badge className="bg-warning/15 text-warning text-xs px-1.5 py-0 border-0 gap-1">
                          <Lightbulb className="w-3 h-3" />
                          {client.coachingCount} coaching
                        </Badge>
                      )}
                      {(client.upsellCount ?? 0) > 0 && (
                        <Badge className="bg-info/15 text-info text-xs px-1.5 py-0 border-0 gap-1">
                          <TrendingUp className="w-3 h-3" />
                          {client.upsellCount} upsell
                        </Badge>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
