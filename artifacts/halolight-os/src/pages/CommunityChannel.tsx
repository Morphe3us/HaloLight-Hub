import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "wouter";
import {
  useListChannelPosts, useCreatePost, useGetCurrentUser, useTogglePostPin,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, MessageSquare, Pin, Eye, Hash,
  Lock, Megaphone, ChevronRight, ThumbsUp,
} from "lucide-react";
import { EmptyState } from "@/components/page";

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
    <div className="max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/community">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 stroke-[1.75]" /> {t("community_channel.back")}
          </Button>
        </Link>
        <span className="text-muted-foreground/60">/</span>
        <div className="flex items-center gap-2">
          {channel?.type === "announcement" ? (
            <Megaphone className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
          ) : channel?.type === "private" ? (
            <Lock className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
          ) : (
            <Hash className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">{channel?.name ?? t("community_channel.channel_fallback")}</span>
          <span className="text-[13px] text-muted-foreground tabular-nums">{t("community_channel.posts_count", { count: total })}</span>
        </div>
      </div>

      {channel?.description && (
        <p className="text-sm text-muted-foreground max-w-2xl">{channel.description}</p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">{t("community_channel.posts_title")}</h2>
        {canPost && (
          <Button onClick={() => setShowCreate(true)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> {t("community_channel.new_post")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 px-4 py-3"><div className="h-full bg-muted rounded-md animate-pulse" /></div>)}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState icon={MessageSquare} text={t("community_channel.no_posts")}>
          {canPost && <p className="text-[13px] text-muted-foreground -mt-2">{t("community_channel.no_posts_hint")}</p>}
        </EmptyState>
      ) : (
        <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/community/posts/${post.id}`} className="group block px-4 py-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {post.isPinned && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Pin className="w-3 h-3 stroke-[1.75] text-warning" /> {t("community_channel.pinned")}
                      </div>
                    )}
                    <h3 className="text-sm font-medium text-foreground mb-1 line-clamp-1">
                      {post.title}
                    </h3>
                    <p className="text-[13px] text-muted-foreground line-clamp-2 mb-2">{post.content}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5 shrink-0">
                        <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium text-[10px]">
                          {((post as unknown as { userName?: string }).userName ?? t("community_channel.user_fallback")).charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate max-w-[100px]">{(post as unknown as { userName?: string }).userName ?? t("community_channel.user_fallback")}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">{formatDate(post.createdAt)}</span>
                      <span className="flex items-center gap-1 shrink-0 tabular-nums"><Eye className="w-3 h-3 stroke-[1.75]" />{post.views}</span>
                      <span className="flex items-center gap-1 shrink-0 tabular-nums">
                        <MessageSquare className="w-3 h-3 stroke-[1.75]" />
                        {t("community_channel.replies", { count: (post as unknown as { replyCount?: number }).replyCount ?? 0 })}
                      </span>
                      <span className="flex items-center gap-1 shrink-0 tabular-nums">
                        <ThumbsUp className="w-3 h-3 stroke-[1.75]" />
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
                        <Pin className={`w-3.5 h-3.5 stroke-[1.75] ${post.isPinned ? "text-warning" : "text-muted-foreground"}`} />
                      </Button>
                    )}
                    <ChevronRight className="w-4 h-4 stroke-[1.75] text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
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
