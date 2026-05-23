import { db, usersTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import type { Evaluator, EvalMatch } from "../types";

export const evaluateInactiveUser: Evaluator = async (rule) => {
  const config = rule.triggerConfig;
  const inactiveDays = config.inactiveDays ?? 7;

  const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

  const users = await db.select().from(usersTable).where(
    eq(usersTable.role, "client")
  );

  const matches: EvalMatch[] = [];

  for (const user of users) {
    const lastActivity = user.updatedAt ?? user.createdAt;
    if (new Date(lastActivity) < cutoff) {
      const daysSince = Math.floor(
        (Date.now() - new Date(lastActivity).getTime()) / 86400000
      );
      matches.push({
        targetUserId: user.id,
        detail: {
          userName: user.fullName,
          lastActivityAt: lastActivity,
          daysSinceActivity: daysSince,
          inactiveDaysThreshold: inactiveDays,
        },
      });
    }
  }

  return matches;
};
