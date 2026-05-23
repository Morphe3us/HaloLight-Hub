import { db, upsellOpportunities, notificationsTable } from "@workspace/db";
import type { ActionHandler } from "../types";

export const actionUpsellRecommendation: ActionHandler = async (rule, match, _executionId) => {
  const { targetUserId, detail } = match;
  if (!targetUserId) return { success: false, detail: { error: "No targetUserId" } };

  const upsellType = detectUpsellType(detail);
  const title = String(detail.suggestedProduct ?? "Growth Opportunity");
  const description = buildDescription(detail);
  const estimatedValue = estimateValue(detail);

  await db.insert(upsellOpportunities).values({
    userId: targetUserId,
    type: upsellType,
    title,
    description,
    confidence: estimateConfidence(detail),
    estimatedValue,
    isActioned: 0,
  });

  // Also send in-app notification
  await db.insert(notificationsTable).values({
    userId: targetUserId,
    type: "upsell_opportunity",
    title: "Growth Opportunity Available",
    body: `Based on your activity, ${title} may be a great fit for your business.`,
    link: "/support",
    isRead: false,
    deliveredEmail: false,
    deliveredPush: false,
  });

  return {
    success: true,
    detail: {
      upsellType,
      title,
      description,
      estimatedValue,
      targetUserId,
    },
  };
};

function detectUpsellType(detail: Record<string, unknown>): "second_booth" | "additional_products" | "consumables" | "premium_coaching" | "partnership" {
  const equip = Number(detail.equipmentCount ?? 0);
  const quotes = Number(detail.quoteCount ?? 0);
  if (equip >= 3) return "second_booth";
  if (quotes >= 10) return "partnership";
  if (equip >= 2) return "additional_products";
  return "premium_coaching";
}

function estimateConfidence(detail: Record<string, unknown>): "low" | "medium" | "high" {
  const equip = Number(detail.equipmentCount ?? 0);
  const quotes = Number(detail.quoteCount ?? 0);
  if (equip >= 3 || quotes >= 10) return "high";
  if (equip >= 2 || quotes >= 5) return "medium";
  return "low";
}

function estimateValue(detail: Record<string, unknown>): number {
  const equip = Number(detail.equipmentCount ?? 0);
  const quotes = Number(detail.quoteCount ?? 0);
  return Math.round((equip * 500 + quotes * 50) * 10);
}

function buildDescription(detail: Record<string, unknown>): string {
  const parts: string[] = [];
  if (detail.equipmentCount) parts.push(`${detail.equipmentCount} equipment units registered`);
  if (detail.quoteCount) parts.push(`${detail.quoteCount} quotes created`);
  if (detail.signals && Array.isArray(detail.signals)) parts.push(...(detail.signals as string[]));
  return `Client shows strong upsell signals: ${parts.join(", ")}. Recommended: ${detail.suggestedProduct ?? "premium package"}.`;
}
