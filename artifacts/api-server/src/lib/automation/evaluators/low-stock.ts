import { db, consumableStock, consumableCatalog, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Evaluator, EvalMatch } from "../types";

export const evaluateLowStock: Evaluator = async (rule) => {
  const config = rule.triggerConfig;
  const daysRemainingThreshold = config.daysRemainingThreshold ?? 14;

  const stockItems = await db
    .select({
      stockId: consumableStock.id,
      userId: consumableStock.userId,
      catalogItemId: consumableStock.catalogItemId,
      currentQuantity: consumableStock.currentQuantity,
      estimatedDailyUsage: consumableStock.estimatedDailyUsage,
      lowStockAlertEnabled: consumableStock.lowStockAlertEnabled,
      catalogName: consumableCatalog.name,
      sku: consumableCatalog.sku,
    })
    .from(consumableStock)
    .innerJoin(consumableCatalog, eq(consumableStock.catalogItemId, consumableCatalog.id))
    .where(eq(consumableStock.lowStockAlertEnabled, true));

  const matches: EvalMatch[] = [];

  for (const item of stockItems) {
    const dailyUsage = item.estimatedDailyUsage ? parseFloat(String(item.estimatedDailyUsage)) : 0;
    if (dailyUsage <= 0) continue;

    const daysRemaining = Math.floor(item.currentQuantity / dailyUsage);

    if (daysRemaining <= daysRemainingThreshold) {
      const [user] = await db.select({ fullName: usersTable.fullName })
        .from(usersTable)
        .where(eq(usersTable.id, item.userId));

      matches.push({
        targetUserId: item.userId,
        targetEntityId: item.stockId,
        detail: {
          userName: user?.fullName ?? "Unknown",
          catalogName: item.catalogName,
          sku: item.sku,
          currentQuantity: item.currentQuantity,
          daysRemaining,
          threshold: daysRemainingThreshold,
        },
      });
    }
  }

  return matches;
};
