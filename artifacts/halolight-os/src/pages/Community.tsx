import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useListCommunityChannels } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Hash, Lock, Megaphone, MessageSquare, ChevronRight,
  Users, TrendingUp,
} from "lucide-react";

const channelTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  public: Hash,
  private: Lock,
  announcement: Megaphone,
};

const channelTypeColors: Record<string, string> = {
  public: "text-info bg-info/10",
  private: "text-muted-foreground bg-muted",
  announcement: "text-warning bg-warning/8",
};

const channelTypeBadge: Record<string, string> = {
  public: "bg-info/15 text-info",
  private: "bg-muted text-muted-foreground",
  announcement: "bg-warning/15 text-warning",
};

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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("community.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("community.connect_subtitle")}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <>
          {announcementChannels.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
                {t("community.announcements_section")}
              </h2>
              <div className="space-y-2">
                {announcementChannels.map((channel) => {
                  const TypeIcon = channelTypeIcons[channel.type ?? "public"] ?? Hash;
                  const CustomIcon = getChannelIcon(channel.icon ?? "Hash");
                  return (
                    <Link key={channel.id} href={`/community/${channel.id}`}>
                      <Card className="hover:shadow-md transition-all cursor-pointer group border-warning/20 bg-warning/5">
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
                            <CustomIcon className="w-5 h-5 text-warning" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="font-semibold text-foreground">{channel.name}</h3>
                              <Badge className={`text-xs px-1.5 py-0 ${channelTypeBadge[channel.type ?? "public"] ?? ""}`}>
                                <TypeIcon className="w-2.5 h-2.5 mr-0.5" />
                                {t(`community.type_${channel.type ?? "public"}`, { defaultValue: channel.type ?? "public" })}
                              </Badge>
                            </div>
                            {channel.description && <p className="text-sm text-muted-foreground">{channel.description}</p>}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                            <MessageSquare className="w-4 h-4" />
                            <span>{(channel as unknown as { postCount?: number }).postCount ?? 0}</span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {publicChannels.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
                {t("community.channels_section")}
              </h2>
              <div className="grid gap-3">
                {publicChannels.map((channel) => {
                  const TypeIcon = channelTypeIcons[channel.type ?? "public"] ?? Hash;
                  const CustomIcon = getChannelIcon(channel.icon ?? "Hash");
                  return (
                    <Link key={channel.id} href={`/community/${channel.id}`}>
                      <Card className="hover:shadow-md transition-all cursor-pointer group">
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${channelTypeColors[channel.type ?? "public"] ?? ""}`}>
                            <CustomIcon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="font-semibold text-foreground">{channel.name}</h3>
                              {channel.type === "private" && (
                                <Badge className={`text-xs px-1.5 py-0 ${channelTypeBadge[channel.type] ?? ""}`}>
                                  <Lock className="w-2.5 h-2.5 mr-0.5" />
                                  {t("community.private_badge")}
                                </Badge>
                              )}
                            </div>
                            {channel.description && <p className="text-sm text-muted-foreground">{channel.description}</p>}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                            <MessageSquare className="w-4 h-4" />
                            <span>{(channel as unknown as { postCount?: number }).postCount ?? 0} {t("community.posts")}</span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {channels.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground font-medium">{t("community.coming_soon_title")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("community.coming_soon_desc")}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
