import { db, usersTable, events } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Evaluator, EvalMatch } from "../types";

export const evaluateNoEvents: Evaluator = async (rule) => {
  const config = rule.triggerConfig;
  const noEventsAfterDays = config.noEventsAfterDays ?? 7;

  const cutoff = new Date(Date.now() - noEventsAfterDays * 24 * 60 * 60 * 1000);

  const users = await db.select().from(usersTable).where(eq(usersTable.role, "client"));
  const matches: EvalMatch[] = [];

  for (const user of users) {
    if (new Date(user.createdAt) > cutoff) continue;

    const userEvents = await db.select({ id: events.id })
      .from(events)
      .where(eq(events.userId, user.id));

    if (userEvents.length === 0) {
      matches.push({
        targetUserId: user.id,
        detail: {
          userName: user.fullName,
          daysSinceSignup: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000),
          noEventsAfterDays,
        },
      });
    }
  }

  return matches;
};
