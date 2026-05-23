import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql, count, desc, ne, isNotNull } from "drizzle-orm";
import {
  db, usersTable, customerSuccessScores, coachingRecommendations, upsellOpportunities,
  userOnboardingProgressTable, onboardingStepsTable, userLessonProgress,
  events, quotes, invoices, invoiceItems, supportTickets, supportTicketReplies,
  communityPosts, communityReplies,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { computeAndStoreScore } from "../lib/scoreEngine";

const router: IRouter = Router();

// GET /admin/clients — client list with scores
router.get("/admin/clients", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const clients = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    fullName: usersTable.fullName,
    companyName: usersTable.companyName,
    role: usersTable.role,
    createdAt: usersTable.createdAt,
    updatedAt: usersTable.updatedAt,
    score: customerSuccessScores.score,
    tier: customerSuccessScores.tier,
    computedAt: customerSuccessScores.computedAt,
  })
    .from(usersTable)
    .leftJoin(customerSuccessScores, eq(usersTable.id, customerSuccessScores.userId))
    .where(ne(usersTable.role, "admin"))
    .orderBy(desc(customerSuccessScores.score));

  // Enrich with counts
  const enriched = await Promise.all(clients.map(async (c) => {
    const [eventsRow] = await db.select({ count: count() }).from(events).where(eq(events.userId, c.id));
    const [quotesRow] = await db.select({ count: count() }).from(quotes).where(eq(quotes.userId, c.id));
    const [ticketsRow] = await db.select({ count: count() }).from(supportTickets).where(eq(supportTickets.userId, c.id));
    const coaching = await db.select().from(coachingRecommendations).where(eq(coachingRecommendations.userId, c.id));
    const upsells = await db.select().from(upsellOpportunities).where(eq(upsellOpportunities.userId, c.id));
    return {
      ...c,
      eventsCount: eventsRow?.count ?? 0,
      quotesCount: quotesRow?.count ?? 0,
      ticketsCount: ticketsRow?.count ?? 0,
      coachingCount: coaching.length,
      upsellCount: upsells.length,
    };
  }));

  res.json({ items: enriched, total: enriched.length });
});

// GET /admin/clients/:id — client 360 view
router.get("/admin/clients/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const clientId = String(req.params.id);

  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, clientId));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }

  // Recompute fresh score
  await computeAndStoreScore(clientId);

  const [score] = await db.select().from(customerSuccessScores).where(eq(customerSuccessScores.userId, clientId));
  const coaching = await db.select().from(coachingRecommendations).where(eq(coachingRecommendations.userId, clientId)).orderBy(coachingRecommendations.priority);
  const upsells = await db.select().from(upsellOpportunities).where(eq(upsellOpportunities.userId, clientId));

  // Onboarding
  const [totalStepsRow] = await db.select({ total: count() }).from(onboardingStepsTable);
  const totalSteps = totalStepsRow?.total ?? 1;
  const progressRows = await db.select({
    stepId: userOnboardingProgressTable.stepId,
    completedAt: userOnboardingProgressTable.completedAt,
  }).from(userOnboardingProgressTable).where(eq(userOnboardingProgressTable.userId, clientId));
  const completedSteps = progressRows.filter((p) => p.completedAt !== null).length;
  const onboardingPct = Math.round((completedSteps / totalSteps) * 100);

  // Academy
  const [lessonsRow] = await db.select({ completed: count() }).from(userLessonProgress).where(and(eq(userLessonProgress.userId, clientId), isNotNull(userLessonProgress.completedAt)));
  const lessonsCompleted = lessonsRow?.completed ?? 0;

  // Events
  const clientEvents = await db.select().from(events).where(eq(events.userId, clientId)).orderBy(desc(events.eventDate)).limit(10);

  // Quotes
  const clientQuotes = await db.select().from(quotes).where(eq(quotes.userId, clientId)).orderBy(desc(quotes.createdAt)).limit(10);

  // Invoices
  const clientInvoices = await db.select().from(invoices).where(eq(invoices.userId, clientId)).orderBy(desc(invoices.createdAt)).limit(10);

  // Revenue
  const paidInvoices = clientInvoices.filter((inv) => inv.status === "paid");
  const totalRevenue = paidInvoices.reduce((sum, inv) => sum + Number(inv.total ?? 0), 0);

  // Support tickets
  const clientTickets = await db.select().from(supportTickets).where(eq(supportTickets.userId, clientId)).orderBy(desc(supportTickets.createdAt)).limit(10);

  // Community activity
  const [postsRow] = await db.select({ count: count() }).from(communityPosts).where(eq(communityPosts.userId, clientId));
  const [repliesRow] = await db.select({ count: count() }).from(communityReplies).where(eq(communityReplies.userId, clientId));

  res.json({
    client,
    score,
    coaching,
    upsells,
    onboarding: {
      completedSteps,
      totalSteps,
      pct: onboardingPct,
      progress: progressRows,
    },
    academy: {
      lessonsCompleted,
    },
    events: clientEvents,
    quotes: clientQuotes,
    invoices: clientInvoices,
    revenue: Math.round(totalRevenue),
    support: clientTickets,
    community: {
      postsCount: postsRow?.count ?? 0,
      repliesCount: repliesRow?.count ?? 0,
    },
  });
});

export default router;
