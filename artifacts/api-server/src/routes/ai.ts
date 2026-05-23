import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc, desc } from "drizzle-orm";
import { db, aiConversations, aiMessages, aiSuggestedQuestions } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

const KB_RESPONSES: Record<string, string> = {
  pricing: "Our pricing depends on the package you choose. Standard packages start at $800 for 3 hours, with premium options up to $2,400+ for corporate events. We offer custom quotes for multi-booth setups. Would you like me to walk you through our package options?",
  booking: "To book HaloLight for your event, you can start by submitting a lead through our CRM, then we'll send you a custom quote. Once accepted, we'll prepare a contract and invoice. Our team typically responds within 24 hours. Is there a specific event you're planning?",
  equipment: "HaloLight offers professional photobooth units with 360° capabilities, ring-light setups, and AI-powered filter systems. Each unit includes unlimited prints, digital delivery via QR code, and a custom branded overlay. What type of event are you setting it up for?",
  setup: "Setup typically takes 1.5–2 hours before the event. We handle all the technical work — you just need to provide a standard power outlet (110V) and a 8×8 ft space minimum. Our attendant stays throughout the event to ensure everything runs smoothly.",
  print: "We offer 4×6 instant prints as standard, with 2×6 strip options available. Our printers use dye-sublimation technology for photo-quality output. Most packages include unlimited prints during the event.",
  digital: "All our packages include a digital gallery accessible via QR code, delivered within 24–48 hours after the event. Standard gallery access is 90 days, with extended options available. Guests can also share directly to social media from the booth.",
  cancel: "Our cancellation policy: cancellations 30+ days before the event receive a full deposit refund. 14–30 days before: 50% deposit retained. Less than 14 days: full deposit retained. We understand things happen — please contact us as early as possible.",
  default: "That's a great question! Our team specializes in photobooth and event equipment solutions. I can help you with information about our packages, pricing, booking process, equipment specs, and support topics. What would you like to know more about?",
};

function generateAiResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  if (lower.includes("price") || lower.includes("cost") || lower.includes("how much")) return KB_RESPONSES.pricing!;
  if (lower.includes("book") || lower.includes("reserve") || lower.includes("schedule")) return KB_RESPONSES.booking!;
  if (lower.includes("equipment") || lower.includes("booth") || lower.includes("unit") || lower.includes("device")) return KB_RESPONSES.equipment!;
  if (lower.includes("setup") || lower.includes("install") || lower.includes("space") || lower.includes("power")) return KB_RESPONSES.setup!;
  if (lower.includes("print") || lower.includes("photo")) return KB_RESPONSES.print!;
  if (lower.includes("digital") || lower.includes("gallery") || lower.includes("online") || lower.includes("download")) return KB_RESPONSES.digital!;
  if (lower.includes("cancel") || lower.includes("refund") || lower.includes("policy")) return KB_RESPONSES.cancel!;
  return KB_RESPONSES.default!;
}

// GET /ai/conversations
router.get("/ai/conversations", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const items = await db.select().from(aiConversations)
    .where(eq(aiConversations.userId, user.id))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(50);

  res.json({ items });
});

// POST /ai/conversations
router.post("/ai/conversations", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [conv] = await db.insert(aiConversations).values({
    userId: user.id,
    title: "New Conversation",
  }).returning();

  res.status(201).json(conv);
});

// GET /ai/conversations/:id
router.get("/ai/conversations/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [conv] = await db.select().from(aiConversations).where(
    eq(aiConversations.id, id)
  );
  if (!conv || conv.userId !== user.id) { res.status(404).json({ error: "Not found" }); return; }

  const messages = await db.select().from(aiMessages)
    .where(eq(aiMessages.conversationId, id))
    .orderBy(asc(aiMessages.createdAt));

  res.json({ ...conv, messages });
});

// DELETE /ai/conversations/:id
router.delete("/ai/conversations/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [conv] = await db.select().from(aiConversations).where(eq(aiConversations.id, id));
  if (!conv || conv.userId !== user.id) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(aiConversations).where(eq(aiConversations.id, id));
  res.status(204).send();
});

// POST /ai/conversations/:id/messages
router.post("/ai/conversations/:id/messages", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [conv] = await db.select().from(aiConversations).where(eq(aiConversations.id, id));
  if (!conv || conv.userId !== user.id) { res.status(404).json({ error: "Not found" }); return; }

  const { content } = req.body as { content: string };
  if (!content) { res.status(400).json({ error: "content required" }); return; }

  const [userMessage] = await db.insert(aiMessages).values({
    conversationId: id,
    role: "user",
    content,
  }).returning();

  const aiReply = generateAiResponse(content);
  const [assistantMessage] = await db.insert(aiMessages).values({
    conversationId: id,
    role: "assistant",
    content: aiReply,
  }).returning();

  const isFirstMessage = conv.title === "New Conversation";
  if (isFirstMessage) {
    const newTitle = content.length > 50 ? content.slice(0, 47) + "..." : content;
    await db.update(aiConversations).set({ title: newTitle, updatedAt: new Date() }).where(eq(aiConversations.id, id));
  } else {
    await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, id));
  }

  res.status(201).json({ userMessage, assistantMessage });
});

// GET /ai/suggested-questions
router.get("/ai/suggested-questions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const items = await db.select().from(aiSuggestedQuestions).orderBy(asc(aiSuggestedQuestions.order));
  res.json({ items });
});

export default router;
