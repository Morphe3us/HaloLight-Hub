import { Router, type IRouter, type Request, type Response } from "express";
import { sql, eq, and, gte, count, isNotNull } from "drizzle-orm";
import {
  db, usersTable, userOnboardingProgressTable, onboardingStepsTable,
  userLessonProgress, events, quotes, invoices, communityPosts, communityReplies,
  supportTickets, customerSuccessScores,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// GET /admin/analytics
router.get("/admin/analytics", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Users
  const [totalUsersRow] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.role, "client"));
  const [activeUsersRow] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(and(eq(usersTable.role, "client"), gte(usersTable.updatedAt, thirtyDaysAgo)));
  const totalUsers = totalUsersRow?.count ?? 0;
  const activeUsers = activeUsersRow?.count ?? 0;
  const inactiveUsers = totalUsers - activeUsers;

  // Onboarding
  const [totalStepsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(onboardingStepsTable);
  const totalSteps = totalStepsRow?.count ?? 1;
  const completionRows = await db.select({ userId: userOnboardingProgressTable.userId, completed: sql<number>`count(case when ${userOnboardingProgressTable.completedAt} is not null then 1 end)::int` })
    .from(userOnboardingProgressTable)
    .groupBy(userOnboardingProgressTable.userId);
  const avgOnboardingPct = completionRows.length > 0
    ? Math.round(completionRows.reduce((sum, r) => sum + (r.completed / totalSteps), 0) / completionRows.length * 100)
    : 0;

  // Academy
  const [totalLessonsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(userLessonProgress).where(isNotNull(userLessonProgress.completedAt));
  const uniqueLearners = await db.selectDistinct({ userId: userLessonProgress.userId }).from(userLessonProgress).where(isNotNull(userLessonProgress.completedAt));
  const academyEngagedCount = uniqueLearners.length;
  const avgLessonsPerLearner = uniqueLearners.length > 0 ? Math.round((totalLessonsRow?.count ?? 0) / uniqueLearners.length) : 0;

  // Sales
  const [totalQuotesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(quotes);
  const [totalEventsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(events);
  const [totalInvoicesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(invoices);
  const [paidInvoicesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(eq(invoices.status, "paid"));

  // Revenue (sum of paid invoice amounts)
  const revenueRows = await db.select({ amount: invoices.total }).from(invoices).where(eq(invoices.status, "paid"));
  const totalRevenue = revenueRows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

  // Community
  const [totalPostsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(communityPosts);
  const [totalRepliesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(communityReplies);
  const [recentPostsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(communityPosts).where(gte(communityPosts.createdAt, thirtyDaysAgo));

  // Support
  const [totalTicketsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(supportTickets);
  const [openTicketsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(supportTickets).where(eq(supportTickets.status, "open"));
  const [resolvedTicketsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(supportTickets).where(eq(supportTickets.status, "resolved"));

  // Score distribution
  const scoreDist = await db.select({
    tier: customerSuccessScores.tier,
    count: sql<number>`count(*)::int`,
  }).from(customerSuccessScores).groupBy(customerSuccessScores.tier);

  const tierMap: Record<string, number> = { at_risk: 0, developing: 0, healthy: 0, champion: 0 };
  for (const row of scoreDist) tierMap[row.tier] = row.count;

  // Avg score
  const [avgScoreRow] = await db.select({ avg: sql<number>`round(avg(score))::int` }).from(customerSuccessScores);

  res.json({
    users: {
      total: totalUsers,
      active: activeUsers,
      inactive: inactiveUsers,
      activeRate: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0,
    },
    onboarding: {
      avgCompletionPct: avgOnboardingPct,
      usersWithProgress: completionRows.length,
    },
    academy: {
      engagedLearners: academyEngagedCount,
      totalLessonsCompleted: totalLessonsRow?.count ?? 0,
      avgLessonsPerLearner,
    },
    sales: {
      totalQuotes: totalQuotesRow?.count ?? 0,
      totalEvents: totalEventsRow?.count ?? 0,
      totalInvoices: totalInvoicesRow?.count ?? 0,
      paidInvoices: paidInvoicesRow?.count ?? 0,
      totalRevenue: Math.round(totalRevenue),
      conversionRate: (totalQuotesRow?.count ?? 0) > 0
        ? Math.round(((paidInvoicesRow?.count ?? 0) / (totalQuotesRow?.count ?? 1)) * 100)
        : 0,
    },
    community: {
      totalPosts: totalPostsRow?.count ?? 0,
      totalReplies: totalRepliesRow?.count ?? 0,
      recentPosts: recentPostsRow?.count ?? 0,
    },
    support: {
      totalTickets: totalTicketsRow?.count ?? 0,
      openTickets: openTicketsRow?.count ?? 0,
      resolvedTickets: resolvedTicketsRow?.count ?? 0,
      resolutionRate: (totalTicketsRow?.count ?? 0) > 0
        ? Math.round(((resolvedTicketsRow?.count ?? 0) / (totalTicketsRow?.count ?? 1)) * 100)
        : 0,
    },
    successScores: {
      avgScore: avgScoreRow?.avg ?? 0,
      tierDistribution: tierMap,
    },
  });
});

export default router;
