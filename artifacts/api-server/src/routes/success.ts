import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, customerSuccessScores, coachingRecommendations, upsellOpportunities } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { computeAndStoreScore } from "../lib/scoreEngine";

const router: IRouter = Router();

// GET /success/score — get current user's score
router.get("/success/score", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Compute and store fresh score
  await computeAndStoreScore(user.id);

  const [score] = await db.select().from(customerSuccessScores).where(eq(customerSuccessScores.userId, user.id));
  const coaching = await db.select().from(coachingRecommendations).where(eq(coachingRecommendations.userId, user.id));
  const upsells = await db.select().from(upsellOpportunities).where(eq(upsellOpportunities.userId, user.id));

  res.json({ score, coaching, upsells });
});

export default router;
