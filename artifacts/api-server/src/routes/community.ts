import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, asc, sql, or } from "drizzle-orm";
import { db, communityChannels, communityPosts, communityReplies, communityReactions, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { isExplicitDevelopment, parseBooleanEnv } from "../lib/env";

const router: IRouter = Router();

type CommunityUser = typeof usersTable.$inferSelect;
type CommunityChannel = typeof communityChannels.$inferSelect;

function communityEnabledFor(user: CommunityUser): boolean {
  if (user.role === "admin") return true;
  const configured = parseBooleanEnv(process.env.ENABLE_COMMUNITY);
  if (configured !== null) return configured;
  return isExplicitDevelopment();
}

function canReadChannel(user: CommunityUser, channel: CommunityChannel): boolean {
  if (!communityEnabledFor(user)) return false;
  if (user.role === "admin") return true;
  return channel.type === "public" || channel.type === "announcement";
}

// GET /community/channels
router.get("/community/channels", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!communityEnabledFor(user)) {
    res.json({ items: [] });
    return;
  }

  const query = db.select({
    id: communityChannels.id,
    createdBy: communityChannels.createdBy,
    name: communityChannels.name,
    slug: communityChannels.slug,
    description: communityChannels.description,
    type: communityChannels.type,
    icon: communityChannels.icon,
    order: communityChannels.order,
    createdAt: communityChannels.createdAt,
    postCount: sql<number>`(select count(*) from community_posts where channel_id = ${communityChannels.id})::int`,
  }).from(communityChannels);
  const items = user.role === "admin"
    ? await query.orderBy(asc(communityChannels.order))
    : await query
        .where(or(
          eq(communityChannels.type, "public"),
          eq(communityChannels.type, "announcement"),
        ))
        .orderBy(asc(communityChannels.order));

  res.json({ items });
});

// POST /community/channels
router.post("/community/channels", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, slug, description, type, icon, order } = req.body as {
    name: string; slug: string; description?: string;
    type?: typeof communityChannels.type._.data; icon?: string; order?: number;
  };
  if (!name || !slug) { res.status(400).json({ error: "name and slug required" }); return; }

  const [channel] = await db.insert(communityChannels).values({
    createdBy: user.id,
    name,
    slug,
    description: description ?? null,
    type: type ?? "public",
    icon: icon ?? "Hash",
    order: order ?? 0,
  }).returning();

  res.status(201).json(channel);
});

// GET /community/channels/:id/posts
router.get("/community/channels/:id/posts", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const channelId = String(req.params.id);

  const { limit = "50", offset = "0" } = req.query as Record<string, string>;

  const [channel] = await db.select().from(communityChannels).where(eq(communityChannels.id, channelId));
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }
  if (!canReadChannel(user, channel)) { res.status(404).json({ error: "Channel not found" }); return; }

  const [rows, countRow] = await Promise.all([
    db.select({
      id: communityPosts.id,
      channelId: communityPosts.channelId,
      userId: communityPosts.userId,
      title: communityPosts.title,
      content: communityPosts.content,
      isPinned: communityPosts.isPinned,
      isLocked: communityPosts.isLocked,
      views: communityPosts.views,
      createdAt: communityPosts.createdAt,
      updatedAt: communityPosts.updatedAt,
      userName: usersTable.fullName,
      userRole: usersTable.role,
      replyCount: sql<number>`(select count(*) from community_replies where post_id = ${communityPosts.id})::int`,
      reactionCount: sql<number>`(select count(*) from community_reactions where post_id = ${communityPosts.id})::int`,
    }).from(communityPosts)
      .leftJoin(usersTable, eq(communityPosts.userId, usersTable.id))
      .where(eq(communityPosts.channelId, channelId))
      .orderBy(desc(communityPosts.isPinned), desc(communityPosts.createdAt))
      .limit(Number(limit))
      .offset(Number(offset)),
    db.select({ count: sql<number>`count(*)::int` }).from(communityPosts).where(eq(communityPosts.channelId, channelId)),
  ]);

  res.json({ items: rows, total: countRow[0]?.count ?? 0, channel });
});

// POST /community/channels/:id/posts
router.post("/community/channels/:id/posts", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const channelId = String(req.params.id);

  const [channel] = await db.select().from(communityChannels).where(eq(communityChannels.id, channelId));
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }
  if (!canReadChannel(user, channel)) { res.status(404).json({ error: "Channel not found" }); return; }

  if (channel.type === "announcement" && user.role !== "admin") {
    res.status(403).json({ error: "Only admins can post in announcement channels" }); return;
  }

  const { title, content } = req.body as { title: string; content: string };
  if (!title || !content) { res.status(400).json({ error: "title and content required" }); return; }

  const [post] = await db.insert(communityPosts).values({
    channelId,
    userId: user.id,
    title,
    content,
  }).returning();

  res.status(201).json(post);
});

// GET /community/posts/:id
router.get("/community/posts/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [post] = await db.select({
    id: communityPosts.id,
    channelId: communityPosts.channelId,
    userId: communityPosts.userId,
    title: communityPosts.title,
    content: communityPosts.content,
    isPinned: communityPosts.isPinned,
    isLocked: communityPosts.isLocked,
    views: communityPosts.views,
    createdAt: communityPosts.createdAt,
    updatedAt: communityPosts.updatedAt,
    userName: usersTable.fullName,
    userRole: usersTable.role,
  }).from(communityPosts)
    .leftJoin(usersTable, eq(communityPosts.userId, usersTable.id))
    .where(eq(communityPosts.id, id));

  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  const [channel] = await db.select().from(communityChannels).where(eq(communityChannels.id, post.channelId));
  if (!channel || !canReadChannel(user, channel)) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(communityPosts).set({ views: post.views + 1 }).where(eq(communityPosts.id, id));

  const replies = await db.select({
    id: communityReplies.id,
    postId: communityReplies.postId,
    userId: communityReplies.userId,
    content: communityReplies.content,
    createdAt: communityReplies.createdAt,
    updatedAt: communityReplies.updatedAt,
    userName: usersTable.fullName,
    userRole: usersTable.role,
  }).from(communityReplies)
    .leftJoin(usersTable, eq(communityReplies.userId, usersTable.id))
    .where(eq(communityReplies.postId, id))
    .orderBy(asc(communityReplies.createdAt));

  const reactions = await db.select().from(communityReactions).where(eq(communityReactions.postId!, id));

  res.json({ ...post, views: post.views + 1, replies, reactions });
});

// DELETE /community/posts/:id
router.delete("/community/posts/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, id));
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  const [channel] = await db.select().from(communityChannels).where(eq(communityChannels.id, post.channelId));
  if (!channel || !canReadChannel(user, channel)) { res.status(404).json({ error: "Not found" }); return; }

  if (post.userId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  await db.delete(communityPosts).where(eq(communityPosts.id, id));
  res.status(204).send();
});

// POST /community/posts/:id/replies
router.post("/community/posts/:id/replies", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, id));
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  const [channel] = await db.select().from(communityChannels).where(eq(communityChannels.id, post.channelId));
  if (!channel || !canReadChannel(user, channel)) { res.status(404).json({ error: "Not found" }); return; }
  if (post.isLocked && user.role !== "admin") { res.status(403).json({ error: "Post is locked" }); return; }

  const { content } = req.body as { content: string };
  if (!content) { res.status(400).json({ error: "content required" }); return; }

  const [reply] = await db.insert(communityReplies).values({
    postId: id,
    userId: user.id,
    content,
  }).returning();

  res.status(201).json(reply);
});

// POST /community/posts/:id/reactions
router.post("/community/posts/:id/reactions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const { emoji } = req.body as { emoji: string };
  if (!emoji) { res.status(400).json({ error: "emoji required" }); return; }

  const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, id));
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  const [channel] = await db.select().from(communityChannels).where(eq(communityChannels.id, post.channelId));
  if (!channel || !canReadChannel(user, channel)) { res.status(404).json({ error: "Not found" }); return; }

  const [existing] = await db.select().from(communityReactions).where(
    and(
      sql`${communityReactions.postId} = ${id}`,
      eq(communityReactions.userId, user.id),
      eq(communityReactions.emoji, emoji)
    )
  );

  if (existing) {
    await db.delete(communityReactions).where(eq(communityReactions.id, existing.id));
    res.json({ added: false });
  } else {
    await db.insert(communityReactions).values({ postId: id, userId: user.id, emoji });
    res.json({ added: true });
  }
});

// PATCH /community/posts/:id/pin
router.patch("/community/posts/:id/pin", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = String(req.params.id);

  const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, id));
  if (!post) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db.update(communityPosts)
    .set({ isPinned: post.isPinned ? 0 : 1, updatedAt: new Date() })
    .where(eq(communityPosts.id, id))
    .returning();

  res.json(updated);
});

// DELETE /community/replies/:id
router.delete("/community/replies/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [reply] = await db.select().from(communityReplies).where(eq(communityReplies.id, id));
  if (!reply) { res.status(404).json({ error: "Not found" }); return; }
  const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, reply.postId));
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  const [channel] = await db.select().from(communityChannels).where(eq(communityChannels.id, post.channelId));
  if (!channel || !canReadChannel(user, channel)) { res.status(404).json({ error: "Not found" }); return; }

  if (reply.userId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  await db.delete(communityReplies).where(eq(communityReplies.id, id));
  res.status(204).send();
});

export default router;
