import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  useListChannelPosts, useCreatePost, useGetCurrentUser, useTogglePostPin,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, MessageSquare, Pin, Eye, Hash,
  Lock, Megaphone, ChevronRight, ThumbsUp, Clock,
} from "lucide-react";

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type ChannelInfo = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
};

export default function CommunityChannel() {
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
        toast({ title: "Post created" });
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
            <ArrowLeft className="w-4 h-4" />
            Community
          </Button>
        </Link>
        <span className="text-gray-400">/</span>
        <div className="flex items-center gap-2">
          {channel?.type === "announcement" ? (
            <Megaphone className="w-4 h-4 text-amber-500" />
          ) : channel?.type === "private" ? (
            <Lock className="w-4 h-4 text-gray-400" />
          ) : (
            <Hash className="w-4 h-4 text-blue-500" />
          )}
          <span className="font-semibold text-gray-800">{channel?.name ?? "Channel"}</span>
          <span className="text-sm text-gray-400">({total} posts)</span>
        </div>
      </div>

      {channel?.description && (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-2">{channel.description}</p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-medium text-gray-700">Posts</h2>
        {canPost && (
          <Button onClick={() => setShowCreate(true)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            New Post
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No posts yet</p>
            {canPost && <p className="text-sm text-gray-400 mt-1">Be the first to post in this channel</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="relative">
              {post.isPinned ? (
                <div className="absolute -top-1.5 left-4 flex items-center gap-1 bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full z-10">
                  <Pin className="w-3 h-3" />
                  Pinned
                </div>
              ) : null}
              <Link href={`/community/posts/${post.id}`}>
                <Card className={`hover:shadow-md transition-all cursor-pointer group ${post.isPinned ? "border-amber-200 mt-2" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 group-hover:text-primary transition-colors mb-1 line-clamp-1">
                          {post.title}
                        </h3>
                        <p className="text-sm text-gray-500 line-clamp-2 mb-2">{post.content}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                              {((post as unknown as { userName?: string }).userName ?? "U").charAt(0).toUpperCase()}
                            </div>
                            {(post as unknown as { userName?: string }).userName ?? "User"}
                          </span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(post.createdAt)}</span>
                          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{post.views}</span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {(post as unknown as { replyCount?: number }).replyCount ?? 0} replies
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
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100"
                            onClick={(e) => { e.preventDefault(); post.id && togglePin({ id: post.id }); }}
                            title={post.isPinned ? "Unpin" : "Pin"}
                          >
                            <Pin className={`w-3.5 h-3.5 ${post.isPinned ? "text-amber-500" : "text-gray-400"}`} />
                          </Button>
                        )}
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
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
            <DialogTitle>New Post in #{channel?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                placeholder="Post title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea
                placeholder="Share your thoughts, questions, or updates..."
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={5}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createPost({ id: channelId!, data: { title: form.title, content: form.content } })}
              disabled={!form.title || !form.content || isPending}
            >
              Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
