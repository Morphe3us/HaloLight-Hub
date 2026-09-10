import { desc, eq } from "drizzle-orm";
import { db, userConsentEvents } from "@workspace/db";
import { hasCurrentAcceptance, publishedLegalDocuments } from "./userConsentPolicy";

export async function userConsentStatus(userId: string) {
  const documents = publishedLegalDocuments();
  if (!documents) return { configured: false as const, required: false, documents: null, acceptance: null };
  const [acceptance] = await db.select().from(userConsentEvents)
    .where(eq(userConsentEvents.userId, userId))
    .orderBy(desc(userConsentEvents.acceptedAt), desc(userConsentEvents.id)).limit(1);
  return {
    configured: true as const, required: !hasCurrentAcceptance(documents, acceptance ?? null),
    documents, acceptance: acceptance ?? null,
  };
}
