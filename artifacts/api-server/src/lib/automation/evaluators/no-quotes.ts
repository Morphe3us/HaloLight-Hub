import { db, usersTable, quotes } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Evaluator, EvalMatch } from "../types";

export const evaluateNoQuotes: Evaluator = async (rule) => {
  const config = rule.triggerConfig;
  const noQuotesAfterDays = config.noQuotesAfterDays ?? 7;

  const cutoff = new Date(Date.now() - noQuotesAfterDays * 24 * 60 * 60 * 1000);

  const users = await db.select().from(usersTable).where(eq(usersTable.role, "client"));
  const matches: EvalMatch[] = [];

  for (const user of users) {
    if (new Date(user.createdAt) > cutoff) continue;

    const userQuotes = await db.select({ id: quotes.id })
      .from(quotes)
      .where(eq(quotes.userId, user.id));

    if (userQuotes.length === 0) {
      matches.push({
        targetUserId: user.id,
        detail: {
          userName: user.fullName,
          daysSinceSignup: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000),
          noQuotesAfterDays,
        },
      });
    }
  }

  return matches;
};
