import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useListCommunityChannels } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import {
  Hash, Lock, Megaphone, MessageSquare, ChevronRight,
  Users, TrendingUp,
} from "lucide-react";
import { EmptyState, PageHeader, Section } from "@/components/page";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Hash, Lock, Megaphone, MessageSquare, TrendingUp, Users,
};

function getChannelIcon(icon: string) {
  return iconMap[icon] ?? Hash;
}

export default function Community() {
  const { t } = useTranslation();
  const { data, isLoading } = useListCommunityChannels();
  const channels = data?.items ?? [];

  const publicChannels = channels.filter((c) => c.type !== "announcement");
  const announcementChannels = channels.filter((c) => c.type === "announcement");

  const postCountOf = (channel: unknown) => (channel as { postCount?: number }).postCount ?? 0;

  return (
    <div className="max-w-4xl space-y-10">
      <PageHeader title={t("community.title")} description={t("community.connect_subtitle")} />

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-[68px] px-4 py-3"><div className="h-full bg-muted rounded-md animate-pulse" /></div>)}
        </div>
      ) : (
        <>
          {announcementChannels.length > 0 && (
            <Section title={t("community.announcements_section")}>
              <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {announcementChannels.map((channel) => {
                  const CustomIcon = getChannelIcon(channel.icon ?? "Hash");
                  return (
                    <li key={channel.id}>
                      <Link href={`/community/${channel.id}`} className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors">
                        <CustomIcon className="w-4 h-4 stroke-[1.75] text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-sm font-medium text-foreground">{channel.name}</h3>
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                              {t(`community.type_${channel.type ?? "public"}`, { defaultValue: channel.type ?? "public" })}
                            </span>
                          </div>
                          {channel.description && <p className="text-[13px] text-muted-foreground">{channel.description}</p>}
                        </div>
                        <div className="flex items-center gap-2 text-[13px] text-muted-foreground shrink-0">
                          <span className="tabular-nums">{postCountOf(channel)}</span>
                          <ChevronRight className="w-4 h-4 stroke-[1.75] text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {publicChannels.length > 0 && (
            <Section title={t("community.channels_section")}>
              <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {publicChannels.map((channel) => {
                  const CustomIcon = getChannelIcon(channel.icon ?? "Hash");
                  return (
                    <li key={channel.id}>
                      <Link href={`/community/${channel.id}`} className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors">
                        <CustomIcon className="w-4 h-4 stroke-[1.75] text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-sm font-medium text-foreground">{channel.name}</h3>
                            {channel.type === "private" && (
                              <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground px-1.5 py-0 gap-1">
                                <Lock className="w-3 h-3 stroke-[1.75]" />
                                {t("community.private_badge")}
                              </Badge>
                            )}
                          </div>
                          {channel.description && <p className="text-[13px] text-muted-foreground">{channel.description}</p>}
                        </div>
                        <div className="flex items-center gap-2 text-[13px] text-muted-foreground shrink-0">
                          <span className="tabular-nums">{postCountOf(channel)} {t("community.posts")}</span>
                          <ChevronRight className="w-4 h-4 stroke-[1.75] text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {channels.length === 0 && (
            <EmptyState icon={Users} text={t("community.coming_soon_title")}>
              <p className="text-[13px] text-muted-foreground -mt-2">{t("community.coming_soon_desc")}</p>
            </EmptyState>
          )}
        </>
      )}
    </div>
  );
}
