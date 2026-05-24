import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "wouter";
import {
  useListChannelPosts, useCreatePost, useGetCurrentUser, useTogglePostPin,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, MessageSquare, Pin, Eye, Hash,
  Lock, Megaphone, ChevronRight, ThumbsUp, Clock,
} from "lucide-react";

type ChannelInfo = { id: string; name: string; description?: string | null; type: string };

export default function CommunityChannel() {
  const { t } = useTranslation();
  const { id: channelId } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", content: "" });

  const { data, isLoading } = useListChannelPosts(channelId!);
  const { data: currentUser } = useGetCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  const { mutate: createPost, isPending } = useCreatePost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/community/channels/${channelId}/posts`] });
        setShowCreate(false);
        setForm({ title: "", content: "" });
        toast({ title: t("community_channel.toast_created") });
      },
    },
  });

  const { mutate: togglePin } = useTogglePostPin({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/community/channels/${channelId}/posts`] });
      },
    },
  });

  function formatDate(d: string | Date | null | undefined) {
    if (!d) return "";
    const date = new Date(d);
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return t("community_channel.just_now");
    if (diff < 3600000) return t("community_channel.ago_minutes", { n: Math.floor(diff / 60000) });
    if (diff < 86400000) return t("community_channel.ago_hours", { n: Math.floor(diff / 3600000) });
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  const channel = (data as unknown as { channel?: ChannelInfo })?.channel;
  const posts = data?.items ?? [];
  const total = data?.total ?? 0;

  const isAnnouncement = channel?.type === "announcement";
  const canPost = !isAnnouncement || isAdmin;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/community">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> {t("community_channel.back")}
          </Button>
        </Link>
        <span className="text-muted-foreground">/</span>
        <div className="flex items-center gap-2">
          {channel?.type === "announcement" ? (
            <Megaphone className="w-4 h-4 text-warning" />
          ) : channel?.type === "private" ? (
            <Lock className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Hash className="w-4 h-4 text-info" />
          )}
          <span className="font-semibold text-foreground">{channel?.name ?? t("community_channel.channel_fallback")}</span>
          <span className="text-sm text-muted-foreground">{t("community_channel.posts_count", { count: total })}</span>
        </div>
      </div>

      {channel?.description && (
        <p className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-2">{channel.description}</p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-medium text-foreground">{t("community_channel.posts_title")}</h2>
        {canPost && (
          <Button onClick={() => setShowCreate(true)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> {t("community_channel.new_post")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">{t("community_channel.no_posts")}</p>
            {canPost && <p className="text-sm text-muted-foreground mt-1">{t("community_channel.no_posts_hint")}</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="relative">
              {post.isPinned && (
                <div className="absolute -top-1.5 left-4 flex items-center gap-1 bg-warning/15 text-warning text-xs px-2 py-0.5 rounded-full z-10">
                  <Pin className="w-3 h-3" /> {t("community_channel.pinned")}
                </div>
              )}
              <Link href={`/community/posts/${post.id}`}>
                <Card className={`hover:shadow-md transition-all cursor-pointer group ${post.isPinned ? "border-amber-200 mt-2" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1 line-clamp-1">
                          {post.title}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{post.content}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                              {((post as unknown as { userName?: string }).userName ?? t("community_channel.user_fallback")).charAt(0).toUpperCase()}
                            </div>
                            {(post as unknown as { userName?: string }).userName ?? t("community_channel.user_fallback")}
                          </span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(post.createdAt)}</span>
                          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{post.views}</span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {t("community_channel.replies", { count: (post as unknown as { replyCount?: number }).replyCount ?? 0 })}
                          </span>
                          <span className="flex items-center gap-1">
                            <ThumbsUp className="w-3 h-3" />
                            {(post as unknown as { reactionCount?: number }).reactionCount ?? 0}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isAdmin && (
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100"
                            onClick={(e) => { e.preventDefault(); post.id && togglePin({ id: post.id }); }}
                            title={post.isPinned ? t("community_channel.unpin") : t("community_channel.pin")}
                          >
                            <Pin className={`w-3.5 h-3.5 ${post.isPinned ? "text-warning" : "text-muted-foreground"}`} />
                          </Button>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("community_channel.dialog_title", { channel: channel?.name ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("community_channel.label_title")}</Label>
              <Input
                placeholder={t("community_channel.placeholder_title")}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t("community_channel.label_content")}</Label>
              <Textarea
                placeholder={t("community_channel.placeholder_content")}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={5}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t("community_channel.cancel")}</Button>
            <Button
              onClick={() => createPost({ id: channelId!, data: { title: form.title, content: form.content } })}
              disabled={!form.title || !form.content || isPending}
            >
              {t("community_channel.post_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
