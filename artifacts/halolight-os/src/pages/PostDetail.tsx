import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "wouter";
import {
  useGetCommunityPost, useCreateCommunityReply, useTogglePostReaction,
  useDeleteCommunityPost, useDeleteCommunityReply, useGetCurrentUser,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Send, Trash2, Eye, Lock, ThumbsUp } from "lucide-react";
import { EmptyState } from "@/components/page";

const EMOJI_OPTIONS = ["👍", "❤️", "🎉", "🔥", "👏", "💡"];

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Avatar({ name, role }: { name?: string; role?: string }) {
  const initials = (name ?? "U").charAt(0).toUpperCase();
  return (
    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[13px] font-medium shrink-0 bg-muted ${role === "admin" ? "text-foreground ring-1 ring-foreground/15" : "text-muted-foreground"}`}>
      {initials}
    </div>
  );
}

export default function PostDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const { data: post, isLoading } = useGetCommunityPost(id!);
  const { data: currentUser } = useGetCurrentUser();
  const isAdmin = currentUser?.role === "admin";
  const currentUserId = currentUser?.id;

  const { mutate: addReply, isPending: isReplying } = useCreateCommunityReply({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/community/posts/${id}`] });
        setReply("");
        toast({ title: t("post_detail.toast_reply_posted") });
      },
    },
  });

  const { mutate: toggleReaction } = useTogglePostReaction({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/community/posts/${id}`] }),
    },
  });

  const { mutate: deletePost } = useDeleteCommunityPost({
    mutation: {
      onSuccess: () => {
        toast({ title: t("post_detail.toast_post_deleted") });
        navigate("/community");
      },
    },
  });

  const { mutate: deleteReply } = useDeleteCommunityReply({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/community/posts/${id}`] }),
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-8 w-48 bg-muted rounded-md animate-pulse" />
        <div className="h-48 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl">
        <EmptyState text={t("post_detail.not_found")}>
          <Link href="/community"><Button variant="outline" size="sm">{t("post_detail.back_to_community")}</Button></Link>
        </EmptyState>
      </div>
    );
  }

  type Reply = { id: string; content: string; userId: string; userName?: string; userRole?: string; createdAt: string };
  type Reaction = { id: string; emoji: string; userId: string };

  const postData = post as unknown as {
    userName?: string;
    userRole?: string;
    replies?: Reply[];
    reactions?: Reaction[];
    isLocked?: number;
    channelId?: string;
  };

  const replies = postData.replies ?? [];
  const reactions = postData.reactions ?? [];
  const isLocked = !!postData.isLocked;

  const reactionGroups = reactions.reduce<Record<string, { count: number; userReacted: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, userReacted: false };
    acc[r.emoji]!.count++;
    if (r.userId === currentUserId) acc[r.emoji]!.userReacted = true;
    return acc;
  }, {});

  const canDelete = isAdmin || post.userId === currentUserId;

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center gap-3">
        <Link href={postData.channelId ? `/community/${postData.channelId}` : "/community"}>
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 stroke-[1.75]" />
            {t("post_detail.back")}
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="p-5 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Avatar name={postData.userName} role={postData.userRole} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-foreground">{postData.userName ?? "User"}</span>
                  {postData.userRole === "admin" && (
                    <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground px-1.5 py-0">{t("post_detail.staff_badge")}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums">{formatDate(post.createdAt)}</span>
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">{post.title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums"><Eye className="w-3.5 h-3.5 stroke-[1.75]" />{post.views}</span>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive/70 hover:text-destructive"
                  onClick={() => deletePost({ id: id! })}
                >
                  <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed mb-5">{post.content}</p>

          <div className="flex items-center gap-2 flex-wrap">
            {Object.entries(reactionGroups).map(([emoji, { count, userReacted }]) => (
              <button
                key={emoji}
                onClick={() => toggleReaction({ id: id!, data: { emoji } })}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm tabular-nums border transition-colors ${userReacted ? "bg-muted border-foreground/25 text-foreground" : "bg-card border-border text-muted-foreground hover:bg-muted/50"}`}
              >
                {emoji} {count}
              </button>
            ))}
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-sm border border-dashed border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                <ThumbsUp className="w-3.5 h-3.5 stroke-[1.75]" />
                {t("post_detail.react")}
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-full left-0 mb-1 bg-card border rounded-xl p-2 shadow-lg flex gap-1 z-20">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => { toggleReaction({ id: id!, data: { emoji } }); setShowEmojiPicker(false); }}
                      className="text-xl hover:scale-125 transition-transform p-1"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {replies.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">
            {replies.length === 1 ? `${replies.length} ${t("post_detail.reply_one")}` : `${replies.length} ${t("post_detail.replies_many")}`}
          </h3>
          {replies.map((r) => (
            <div key={r.id} className="flex gap-3">
              <Avatar name={r.userName} role={r.userRole} />
              <div className="flex-1 min-w-0 bg-muted rounded-2xl rounded-tl-md px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">{r.userName ?? "User"}</span>
                    {r.userRole === "admin" && (
                      <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground px-1.5 py-0">{t("post_detail.staff_badge")}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDate(r.createdAt)}</span>
                    {(isAdmin || r.userId === currentUserId) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive/70 hover:text-destructive"
                        onClick={() => deleteReply({ id: r.id })}
                      >
                        <Trash2 className="w-3 h-3 stroke-[1.75]" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{r.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {isLocked && !isAdmin ? (
        <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground rounded-xl border border-dashed border-border">
          <Lock className="w-4 h-4 stroke-[1.75]" />
          <span className="text-sm">{t("post_detail.locked_msg")}</span>
        </div>
      ) : (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-medium text-foreground mb-3">{t("post_detail.write_reply")}</h3>
            <Textarea
              placeholder={t("post_detail.reply_placeholder")}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              className="mb-3"
            />
            <div className="flex justify-end">
              <Button
                onClick={() => addReply({ id: id!, data: { content: reply } })}
                disabled={!reply.trim() || isReplying}
                className="gap-2"
              >
                <Send className="w-4 h-4 stroke-[1.75]" />
                {t("post_detail.reply_btn")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
