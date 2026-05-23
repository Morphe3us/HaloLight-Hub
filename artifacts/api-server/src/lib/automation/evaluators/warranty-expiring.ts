import { db, equipment, usersTable } from "@workspace/db";
import { isNotNull, eq } from "drizzle-orm";
import type { Evaluator, EvalMatch } from "../types";

export const evaluateWarrantyExpiring: Evaluator = async (rule) => {
  const config = rule.triggerConfig;
  const daysWarning = config.daysWarning ?? 30;

  const now = new Date();
  const warningCutoff = new Date(now.getTime() + daysWarning * 24 * 60 * 60 * 1000);

  const items = await db.select({
    equipId: equipment.id,
    userId: equipment.userId,
    productModel: equipment.productModel,
    serialNumber: equipment.serialNumber,
    warrantyExpiration: equipment.warrantyExpiration,
  })
    .from(equipment)
    .where(isNotNull(equipment.warrantyExpiration));

  const matches: EvalMatch[] = [];

  for (const item of items) {
    if (!item.warrantyExpiration) continue;
    const expiry = new Date(item.warrantyExpiration);
    if (expiry > now && expiry <= warningCutoff) {
      const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / 86400000);

      const [user] = await db.select({ fullName: usersTable.fullName })
        .from(usersTable)
        .where(eq(usersTable.id, item.userId));

      matches.push({
        targetUserId: item.userId,
        targetEntityId: item.equipId,
        detail: {
          userName: user?.fullName ?? "Unknown",
          productModel: item.productModel,
          serialNumber: item.serialNumber,
          warrantyExpiresAt: item.warrantyExpiration,
          daysUntilExpiry,
          daysWarning,
        },
      });
    }
  }

  return matches;
};
