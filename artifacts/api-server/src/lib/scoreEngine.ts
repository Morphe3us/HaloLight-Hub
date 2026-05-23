import { db, usersTable, userOnboardingProgressTable, onboardingStepsTable, userLessonProgress, events, quotes, invoices, communityPosts, communityReplies, supportTickets, customerSuccessScores, coachingRecommendations, upsellOpportunities } from "@workspace/db";
import { eq, and, sql, count, gte, isNotNull } from "drizzle-orm";

export type ScoreBreakdown = {
  score: number;
  tier: "at_risk" | "developing" | "healthy" | "champion";
  loginScore: number;
  onboardingScore: number;
  academyScore: number;
  eventsScore: number;
  quotesScore: number;
  invoicesScore: number;
  communityScore: number;
  supportScore: number;
};

export type CoachingItem = {
  type: string;
  title: string;
  description: string;
  priority: number;
};

export type UpsellItem = {
  type: string;
  title: string;
  description: string;
  confidence: "low" | "medium" | "high";
  estimatedValue: number | null;
};

function computeTier(score: number): "at_risk" | "developing" | "healthy" | "champion" {
  if (score >= 80) return "champion";
  if (score >= 55) return "healthy";
  if (score >= 30) return "developing";
  return "at_risk";
}

export async function computeUserScore(userId: string): Promise<ScoreBreakdown> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) throw new Error("User not found");

  // Login activity (20 pts)
  const now = new Date();
  const lastActivity = user.updatedAt ?? user.createdAt;
  const daysSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
  let loginScore = 0;
  if (daysSinceActivity < 7) loginScore = 20;
  else if (daysSinceActivity < 14) loginScore = 15;
  else if (daysSinceActivity < 30) loginScore = 10;
  else if (daysSinceActivity < 60) loginScore = 5;

  // Onboarding (20 pts)
  const [totalStepsRow] = await db.select({ total: count() }).from(onboardingStepsTable);
  const [completedRow] = await db.select({ completed: count() }).from(userOnboardingProgressTable).where(and(eq(userOnboardingProgressTable.userId, userId), isNotNull(userOnboardingProgressTable.completedAt)));
  const totalSteps = totalStepsRow?.total ?? 1;
  const completedSteps = completedRow?.completed ?? 0;
  const onboardingScore = Math.round((completedSteps / totalSteps) * 20);

  // Academy (15 pts)
  const [lessonsRow] = await db.select({ completed: count() }).from(userLessonProgress).where(and(eq(userLessonProgress.userId, userId), isNotNull(userLessonProgress.completedAt)));
  const lessonsCompleted = lessonsRow?.completed ?? 0;
  const academyScore = Math.min(lessonsCompleted * 3, 15);

  // Events (15 pts)
  const [eventsRow] = await db.select({ total: count() }).from(events).where(eq(events.userId, userId));
  const eventsCount = eventsRow?.total ?? 0;
  const eventsScore = Math.min(eventsCount * 5, 15);

  // Quotes (10 pts)
  const [quotesRow] = await db.select({ total: count() }).from(quotes).where(eq(quotes.userId, userId));
  const quotesCount = quotesRow?.total ?? 0;
  const quotesScore = Math.min(quotesCount * 5, 10);

  // Invoices (5 pts)
  const [invoicesRow] = await db.select({ total: count() }).from(invoices).where(eq(invoices.userId, userId));
  const invoicesCount = invoicesRow?.total ?? 0;
  const invoicesScore = Math.min(invoicesCount * 5, 5);

  // Community (10 pts)
  const [postsRow] = await db.select({ total: count() }).from(communityPosts).where(eq(communityPosts.userId, userId));
  const [repliesRow] = await db.select({ total: count() }).from(communityReplies).where(eq(communityReplies.userId, userId));
  const communityActivity = (postsRow?.total ?? 0) + (repliesRow?.total ?? 0);
  const communityScore = Math.min(communityActivity * 2, 10);

  // Support engagement (5 pts)
  const [ticketsRow] = await db.select({ total: count() }).from(supportTickets).where(eq(supportTickets.userId, userId));
  const ticketsCount = ticketsRow?.total ?? 0;
  const supportScore = ticketsCount > 0 ? 5 : 0;

  const total = loginScore + onboardingScore + academyScore + eventsScore + quotesScore + invoicesScore + communityScore + supportScore;

  return {
    score: total,
    tier: computeTier(total),
    loginScore,
    onboardingScore,
    academyScore,
    eventsScore,
    quotesScore,
    invoicesScore,
    communityScore,
    supportScore,
  };
}

export async function generateCoachingRecommendations(userId: string): Promise<CoachingItem[]> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return [];

  const recommendations: CoachingItem[] = [];

  const now = new Date();
  const daysSinceActivity = (now.getTime() - (user.updatedAt ?? user.createdAt).getTime()) / (1000 * 60 * 60 * 24);

  const [totalStepsRow] = await db.select({ total: count() }).from(onboardingStepsTable);
  const [completedRow] = await db.select({ completed: count() }).from(userOnboardingProgressTable).where(and(eq(userOnboardingProgressTable.userId, userId), isNotNull(userOnboardingProgressTable.completedAt)));
  const totalSteps = totalStepsRow?.total ?? 1;
  const completedSteps = completedRow?.completed ?? 0;
  const onboardingPct = completedSteps / totalSteps;

  const [lessonsRow] = await db.select({ completed: count() }).from(userLessonProgress).where(and(eq(userLessonProgress.userId, userId), isNotNull(userLessonProgress.completedAt)));
  const [quotesRow] = await db.select({ total: count() }).from(quotes).where(eq(quotes.userId, userId));
  const [eventsRow] = await db.select({ total: count() }).from(events).where(eq(events.userId, userId));
  const [postsRow] = await db.select({ total: count() }).from(communityPosts).where(eq(communityPosts.userId, userId));
  const [repliesRow] = await db.select({ total: count() }).from(communityReplies).where(eq(communityReplies.userId, userId));

  if (daysSinceActivity > 14) {
    recommendations.push({
      type: "no_activity",
      title: "Re-engage this client",
      description: `${user.fullName ?? user.email} hasn't been active in ${Math.floor(daysSinceActivity)} days. Consider a personal outreach to check in on their business.`,
      priority: 1,
    });
  }

  if (onboardingPct < 0.4) {
    recommendations.push({
      type: "low_onboarding",
      title: "Incomplete onboarding",
      description: `Client has only completed ${Math.round(onboardingPct * 100)}% of onboarding steps. Schedule a guided onboarding session to unlock full platform value.`,
      priority: 2,
    });
  }

  if ((lessonsRow?.completed ?? 0) === 0) {
    recommendations.push({
      type: "low_academy",
      title: "No academy progress",
      description: "Client hasn't started any Academy courses. Recommend the 'Getting Started' course to improve their photobooth operations.",
      priority: 3,
    });
  }

  if ((eventsRow?.total ?? 0) === 0) {
    recommendations.push({
      type: "no_events",
      title: "No events created",
      description: "Client hasn't created any events yet. Help them set up their first event to start tracking their bookings.",
      priority: 2,
    });
  }

  if ((quotesRow?.total ?? 0) === 0) {
    recommendations.push({
      type: "no_quotes",
      title: "No quotes generated",
      description: "Client hasn't created any quotes. Walk them through the quoting process — this is key to their revenue generation.",
      priority: 2,
    });
  }

  if ((postsRow?.total ?? 0) + (repliesRow?.total ?? 0) === 0) {
    recommendations.push({
      type: "low_community",
      title: "Not engaged in community",
      description: "Client hasn't participated in the community forum. Invite them to join a relevant discussion to boost their network.",
      priority: 4,
    });
  }

  return recommendations;
}

export async function generateUpsellOpportunities(userId: string): Promise<UpsellItem[]> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return [];

  const opportunities: UpsellItem[] = [];

  const [eventsRow] = await db.select({ total: count() }).from(events).where(eq(events.userId, userId));
  const [quotesRow] = await db.select({ total: count() }).from(quotes).where(eq(quotes.userId, userId));
  const [invoicesRow] = await db.select({ total: count() }).from(invoices).where(eq(invoices.userId, userId));
  const [lessonsRow] = await db.select({ completed: count() }).from(userLessonProgress).where(and(eq(userLessonProgress.userId, userId), isNotNull(userLessonProgress.completedAt)));

  const paidInvoicesRow = await db.select({ total: count() }).from(invoices).where(and(eq(invoices.userId, userId), eq(invoices.status, "paid")));
  const paidCount = paidInvoicesRow[0]?.total ?? 0;

  const eventsCount = eventsRow?.total ?? 0;
  const quotesCount = quotesRow?.total ?? 0;
  const lessonsCompleted = lessonsRow?.completed ?? 0;

  const score = await computeUserScore(userId);

  if (eventsCount >= 2 && score.score >= 55) {
    opportunities.push({
      type: "second_booth",
      title: "Ready for a second photobooth",
      description: `${user.fullName ?? user.email} has created ${eventsCount} events and shows strong platform engagement. High likelihood of needing a second unit to service multiple simultaneous bookings.`,
      confidence: "high",
      estimatedValue: 8000,
    });
  }

  if (paidCount >= 2) {
    opportunities.push({
      type: "additional_products",
      title: "Additional product accessories",
      description: "Client has multiple paid invoices and is actively running events. Ideal candidate for add-on equipment (props, backdrops, ring lights).",
      confidence: "medium",
      estimatedValue: 1500,
    });
  }

  if (quotesCount >= 3) {
    opportunities.push({
      type: "consumables",
      title: "Consumables replenishment needed",
      description: `With ${quotesCount} quotes generated and regular event activity, consumables (paper, ink, straps) should be replenished soon.`,
      confidence: quotesCount >= 5 ? "high" : "medium",
      estimatedValue: 400,
    });
  }

  if (score.score >= 65 && lessonsCompleted >= 3) {
    opportunities.push({
      type: "premium_coaching",
      title: "Premium coaching package candidate",
      description: "Client shows strong academy engagement and platform adoption. High probability of ROI on a premium coaching engagement focused on business scaling.",
      confidence: "high",
      estimatedValue: 3000,
    });
  }

  if (score.score >= 80) {
    opportunities.push({
      type: "partnership",
      title: "Partner program candidate",
      description: "Champion-tier client with excellent engagement. Ideal candidate for HaloLight's referral/partner program.",
      confidence: "medium",
      estimatedValue: null,
    });
  }

  return opportunities;
}

export async function computeAndStoreScore(userId: string): Promise<void> {
  const breakdown = await computeUserScore(userId);
  const coaching = await generateCoachingRecommendations(userId);
  const upsells = await generateUpsellOpportunities(userId);

  // Upsert success score
  const existing = await db.select().from(customerSuccessScores).where(eq(customerSuccessScores.userId, userId));
  if (existing.length > 0) {
    await db.update(customerSuccessScores).set({
      score: breakdown.score,
      tier: breakdown.tier,
      loginScore: breakdown.loginScore,
      onboardingScore: breakdown.onboardingScore,
      academyScore: breakdown.academyScore,
      eventsScore: breakdown.eventsScore,
      quotesScore: breakdown.quotesScore,
      invoicesScore: breakdown.invoicesScore,
      communityScore: breakdown.communityScore,
      supportScore: breakdown.supportScore,
      computedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(customerSuccessScores.userId, userId));
  } else {
    await db.insert(customerSuccessScores).values({
      userId,
      ...breakdown,
      computedAt: new Date(),
    });
  }

  // Replace coaching recommendations
  await db.delete(coachingRecommendations).where(eq(coachingRecommendations.userId, userId));
  if (coaching.length > 0) {
    await db.insert(coachingRecommendations).values(
      coaching.map((c) => ({ userId, type: c.type as "low_onboarding", title: c.title, description: c.description, priority: c.priority }))
    );
  }

  // Replace upsell opportunities
  await db.delete(upsellOpportunities).where(eq(upsellOpportunities.userId, userId));
  if (upsells.length > 0) {
    await db.insert(upsellOpportunities).values(
      upsells.map((u) => ({ userId, type: u.type as "second_booth", title: u.title, description: u.description, confidence: u.confidence, estimatedValue: u.estimatedValue }))
    );
  }
}
