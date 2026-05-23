import { db, notificationsTable } from "@workspace/db";
import type { ActionHandler } from "../types";

export const actionConsumableReorder: ActionHandler = async (rule, match, _executionId) => {
  const { targetUserId, targetEntityId, detail } = match;
  if (!targetUserId) return { success: false, detail: { error: "No targetUserId" } };

  const catalogName = String(detail.catalogName ?? "Consumable");
  const sku = String(detail.sku ?? "");
  const daysRemaining = Number(detail.daysRemaining ?? 0);

  // Create an in-app notification with a direct link to consumables
  await db.insert(notificationsTable).values({
    userId: targetUserId,
    type: "consumable_reorder",
    title: `Reorder Recommended: ${catalogName}`,
    body: `${catalogName} (${sku}) has approximately ${daysRemaining} days of stock remaining. Tap to review and place a reorder.`,
    link: "/consumables",
    isRead: false,
    deliveredEmail: false,
    deliveredPush: false,
  });

  const recommendation = {
    userId: targetUserId,
    stockId: targetEntityId,
    catalogName,
    sku,
    daysRemaining,
    currentQuantity: detail.currentQuantity,
    recommendedAction: "Place reorder now",
    urgency: daysRemaining <= 7 ? "critical" : daysRemaining <= 14 ? "high" : "medium",
    generatedAt: new Date().toISOString(),
  };

  return {
    success: true,
    detail: { recommendation },
  };
};
