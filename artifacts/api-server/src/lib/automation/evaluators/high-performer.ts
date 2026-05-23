import { db, usersTable, quotes, events } from "@workspace/db";
import { eq, gte, and } from "drizzle-orm";
import type { Evaluator, EvalMatch } from "../types";

export const evaluateHighPerformer: Evaluator = async (rule) => {
  const config = rule.triggerConfig;
  const minQuotes = config.minQuotes ?? 5;
  const minEvents = config.minEvents ?? 3;
  const periodDays = config.periodDays ?? 30;

  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const users = await db.select().from(usersTable).where(eq(usersTable.role, "client"));
  const matches: EvalMatch[] = [];

  for (const user of users) {
    const userQuotes = await db.select({ id: quotes.id })
      .from(quotes)
      .where(and(eq(quotes.userId, user.id), gte(quotes.createdAt, since)));

    const userEvents = await db.select({ id: events.id })
      .from(events)
      .where(and(eq(events.userId, user.id), gte(events.createdAt, since)));

    const quoteCount = userQuotes.length;
    const eventCount = userEvents.length;

    if (quoteCount >= minQuotes || eventCount >= minEvents) {
      matches.push({
        targetUserId: user.id,
        detail: {
          userName: user.fullName,
          quotesInPeriod: quoteCount,
          eventsInPeriod: eventCount,
          periodDays,
          minQuotes,
          minEvents,
        },
      });
    }
  }

  return matches;
};
