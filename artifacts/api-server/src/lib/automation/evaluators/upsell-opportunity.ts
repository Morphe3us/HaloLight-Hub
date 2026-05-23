import { db, usersTable, equipment, quotes } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Evaluator, EvalMatch } from "../types";

export const evaluateUpsellOpportunity: Evaluator = async (rule) => {
  const config = rule.triggerConfig;
  const minEquipmentCount = config.minEquipmentCount ?? 2;
  const minQuotes = config.minQuotes ?? 3;

  const users = await db.select().from(usersTable).where(eq(usersTable.role, "client"));
  const matches: EvalMatch[] = [];

  for (const user of users) {
    const userEquipment = await db.select({ id: equipment.id, productModel: equipment.productModel })
      .from(equipment)
      .where(eq(equipment.userId, user.id));

    const userQuotes = await db.select({ id: quotes.id })
      .from(quotes)
      .where(eq(quotes.userId, user.id));

    const equipCount = userEquipment.length;
    const quoteCount = userQuotes.length;

    if (equipCount >= minEquipmentCount || quoteCount >= minQuotes) {
      const signals: string[] = [];
      if (equipCount >= minEquipmentCount) signals.push(`${equipCount} equipment units`);
      if (quoteCount >= minQuotes) signals.push(`${quoteCount} total quotes`);

      matches.push({
        targetUserId: user.id,
        detail: {
          userName: user.fullName,
          equipmentCount: equipCount,
          quoteCount,
          signals,
          suggestedProduct: equipCount >= 3 ? "Premium Coaching Package" : "Additional Equipment Bundle",
        },
      });
    }
  }

  return matches;
};
