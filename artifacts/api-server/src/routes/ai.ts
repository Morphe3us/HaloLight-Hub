import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc, desc } from "drizzle-orm";
import {
  db,
  aiConversations,
  aiMessages,
  aiSuggestedQuestions,
  supportTickets,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { getAIProvider } from "../lib/ai/factory";
import { chatInputError } from "../lib/ai/chatLimits";
import {
  enqueueTicketMail,
  dispatchTicketMail,
} from "../lib/mail/ticketOutbox";
import { buildSystemPrompt } from "../lib/ai/provider";
import { retrieveContext, buildSuggestedActions } from "../lib/ai/rag";
import type { RAGSource, SuggestedAction } from "../lib/ai/provider";
import {
  classifySupport,
  recentSupportContext,
  prepareChatHistory,
  redactSensitiveText,
  safetyResponse,
  supportChat,
} from "../lib/ai/supportPolicy";

const router: IRouter = Router();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readConversationId(req: Request, res: Response): string | null {
  const id = String(req.params.id);
  if (!UUID_PATTERN.test(id)) {
    res.status(404).json({ error: "Not found" });
    return null;
  }
  return id;
}

// ─── Conversations ────────────────────────────────────────────────────────────

// GET /ai/conversations
router.get(
  "/ai/conversations",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const items = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, user.id))
      .orderBy(desc(aiConversations.updatedAt))
      .limit(50);

    res.json({ items });
  },
);

// POST /ai/conversations
router.post(
  "/ai/conversations",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const provider = getAIProvider();
    const [conv] = await db
      .insert(aiConversations)
      .values({
        userId: user.id,
        title: "New Conversation",
        providerName: provider.name,
      })
      .returning();

    res.status(201).json(conv);
  },
);

// GET /ai/conversations/:id
router.get(
  "/ai/conversations/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = readConversationId(req, res);
    if (!id) return;

    const [conv] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, id));
    if (!conv || conv.userId !== user.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const messages = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, id))
      .orderBy(asc(aiMessages.createdAt));

    res.json({ ...conv, messages });
  },
);

// DELETE /ai/conversations/:id
router.delete(
  "/ai/conversations/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = readConversationId(req, res);
    if (!id) return;

    const [conv] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, id));
    if (!conv || conv.userId !== user.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db.delete(aiConversations).where(eq(aiConversations.id, id));
    res.status(204).send();
  },
);

// ─── Streaming Chat — POST /ai/conversations/:id/stream ────────────────────
// Uses Server-Sent Events (SSE) to stream the AI response token-by-token.
// Event types: content | sources | actions | done | error
router.post(
  "/ai/conversations/:id/stream",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = readConversationId(req, res);
    if (!id) return;

    const [conv] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, id));
    if (!conv || conv.userId !== user.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { content: rawContent } = req.body as { content?: string };
    const inputError = chatInputError(rawContent);
    if (inputError || typeof rawContent !== "string") {
      res.status(400).json({ error: inputError });
      return;
    }
    const content = redactSensitiveText(rawContent.trim());

    // ── Set up SSE ────────────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // ── 1. Persist user message ──────────────────────────────────────────────
      const [userMessage] = await db
        .insert(aiMessages)
        .values({
          conversationId: id,
          role: "user",
          content: content.trim(),
        })
        .returning();

      sendEvent({ type: "user_message", message: userMessage });

      // ── 2. Load conversation history (last 12 messages for context window) ──
      const history = await db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, id))
        .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
        .limit(14);

      const chatMessages = prepareChatHistory(history, userMessage);
      const supportQuery = recentSupportContext([
        ...chatMessages.slice(0, -1),
        { role: "user", content: rawContent },
      ]);

      // ── 3. RAG retrieval ─────────────────────────────────────────────────────
      const { sources } = safetyResponse(supportQuery, user.language)
        ? { sources: [] as RAGSource[] }
        : await retrieveContext(content, user.language);
      const suggestedActions = buildSuggestedActions(
        supportQuery,
        sources,
        user.language,
      );
      if (suggestedActions.some((action) => action.type === "escalate"))
        sendEvent({ type: "actions", actions: suggestedActions });

      // ── 4. Build system prompt with injected context ─────────────────────────
      const systemPrompt = buildSystemPrompt(
        sources,
        user.fullName ?? undefined,
        user.language,
      );

      // ── 5. Stream AI response ────────────────────────────────────────────────
      const provider = getAIProvider();
      let fullContent = "";
      let streamedSources: RAGSource[] = sources;

      for await (const chunk of supportChat(
        provider,
        chatMessages,
        systemPrompt,
        sources,
        user.language,
        supportQuery,
      )) {
        if (chunk.type === "content") {
          fullContent += chunk.content ?? "";
          sendEvent(chunk);
        } else if (chunk.type === "sources") {
          streamedSources = chunk.sources ?? sources;
          sendEvent(chunk);
        } else if (chunk.type === "error") {
          sendEvent(chunk);
          return;
        } else if (chunk.type === "done") {
          break;
        }
      }

      // ── 6. Persist assistant message with sources & actions ──────────────────
      const [assistantMessage] = await db
        .insert(aiMessages)
        .values({
          conversationId: id,
          role: "assistant",
          content: fullContent,
          sources: streamedSources.length > 0 ? streamedSources : null,
          suggestedActions:
            suggestedActions.length > 0 ? suggestedActions : null,
        })
        .returning();

      // ── 7. Auto-title conversation from first exchange ───────────────────────
      if (conv.title === "New Conversation") {
        const newTitle =
          content.length > 52 ? content.slice(0, 49) + "…" : content;
        await db
          .update(aiConversations)
          .set({
            title: newTitle,
            updatedAt: new Date(),
            providerName: provider.name,
          })
          .where(eq(aiConversations.id, id));
      } else {
        await db
          .update(aiConversations)
          .set({ updatedAt: new Date() })
          .where(eq(aiConversations.id, id));
      }

      // ── 8. Send final envelope ───────────────────────────────────────────────
      sendEvent({ type: "actions", actions: suggestedActions });
      sendEvent({
        type: "done",
        message: {
          ...assistantMessage,
          sources: streamedSources,
          suggestedActions,
        },
      });
    } catch (err) {
      req.log?.error(err, "AI stream error");
      sendEvent({
        type: "error",
        error: "An unexpected error occurred. Please try again.",
      });
    } finally {
      res.end();
    }
  },
);

// ─── Legacy non-streaming endpoint (kept for backwards compatibility) ─────────
// POST /ai/conversations/:id/messages
router.post(
  "/ai/conversations/:id/messages",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = readConversationId(req, res);
    if (!id) return;

    const [conv] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, id));
    if (!conv || conv.userId !== user.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { content: rawContent } = req.body as { content?: string };
    const inputError = chatInputError(rawContent);
    if (inputError || typeof rawContent !== "string") {
      res.status(400).json({ error: inputError });
      return;
    }
    const content = redactSensitiveText(rawContent.trim());

    // Persist user message
    const [userMessage] = await db
      .insert(aiMessages)
      .values({
        conversationId: id,
        role: "user",
        content: content.trim(),
      })
      .returning();

    // Load history
    const history = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, id))
      .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
      .limit(14);

    const chatMessages = prepareChatHistory(history, userMessage);
    const supportQuery = recentSupportContext([
      ...chatMessages.slice(0, -1),
      { role: "user", content: rawContent },
    ]);

    // RAG + system prompt
    const { sources } = safetyResponse(supportQuery, user.language)
      ? { sources: [] as RAGSource[] }
      : await retrieveContext(content, user.language);
    const suggestedActions = buildSuggestedActions(
      supportQuery,
      sources,
      user.language,
    );
    const systemPrompt = buildSystemPrompt(
      sources,
      user.fullName ?? undefined,
      user.language,
    );

    // Collect full response (non-streaming)
    const provider = getAIProvider();
    let fullContent = "";
    let finalSources: RAGSource[] = sources;
    for await (const chunk of supportChat(
      provider,
      chatMessages,
      systemPrompt,
      sources,
      user.language,
      supportQuery,
    )) {
      if (chunk.type === "error") {
        res.status(502).json({ error: chunk.error ?? "AI provider failed" });
        return;
      }
      if (chunk.type === "content") fullContent += chunk.content ?? "";
      if (chunk.type === "sources") finalSources = chunk.sources ?? sources;
    }

    // Persist assistant message
    const [assistantMessage] = await db
      .insert(aiMessages)
      .values({
        conversationId: id,
        role: "assistant",
        content: fullContent,
        sources: finalSources.length > 0 ? finalSources : null,
        suggestedActions: suggestedActions.length > 0 ? suggestedActions : null,
      })
      .returning();

    if (conv.title === "New Conversation") {
      const newTitle =
        content.length > 52 ? content.slice(0, 49) + "…" : content;
      await db
        .update(aiConversations)
        .set({ title: newTitle, updatedAt: new Date() })
        .where(eq(aiConversations.id, id));
    } else {
      await db
        .update(aiConversations)
        .set({ updatedAt: new Date() })
        .where(eq(aiConversations.id, id));
    }

    res.status(201).json({
      userMessage,
      assistantMessage: {
        ...assistantMessage,
        sources: finalSources,
        suggestedActions,
      },
    });
  },
);

// ─── Escalate conversation to support ticket ──────────────────────────────────
// POST /ai/conversations/:id/escalate
router.post(
  "/ai/conversations/:id/escalate",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = readConversationId(req, res);
    if (!id) return;

    const [conv] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, id));
    if (!conv || conv.userId !== user.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const messages = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, id))
      .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
      .limit(20);

    // Build a transcript for the ticket body
    const transcript = messages
      .slice(0, 10)
      .reverse()
      .map(
        (m) =>
          `**${m.role === "user" ? "You" : "AI Assistant"}:** ${redactSensitiveText(m.content)}`,
      )
      .join("\n\n");

    const { subject, priority = "medium" } = req.body as {
      subject?: string;
      priority?: string;
    };
    const liveFailure = classifySupport(
      recentSupportContext([...messages].reverse()),
    ).liveFailure;

    const ticketTitle = redactSensitiveText(
      subject ?? `AI Chat: ${conv.title}`,
    );
    const ticketBody = `This support ticket was escalated from an AI Assistant conversation.\n\n---\n\n${transcript}\n\n---\n\n*Conversation ID: ${id}*`;

    const ticketNumber = `AI-${Date.now().toString(36).toUpperCase().slice(-6)}`;

    const ticket = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(supportTickets)
        .values({
          userId: user.id,
          ticketNumber,
          title: ticketTitle,
          description: ticketBody,
          priority: (liveFailure
            ? "urgent"
            : ["low", "medium", "high", "urgent"].includes(priority)
              ? priority
              : "medium") as "low" | "medium" | "high" | "urgent",
          status: "open",
          category: "technical",
        })
        .returning();
      await enqueueTicketMail(tx, created!, user);
      return created!;
    });
    void dispatchTicketMail(ticket.id).catch((error) =>
      req.log?.error(error, "AI ticket mail dispatch failed"),
    );

    res.status(201).json({ ticket });
  },
);

// ─── Suggested questions ──────────────────────────────────────────────────────
// GET /ai/suggested-questions
router.get(
  "/ai/suggested-questions",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const items = await db
      .select()
      .from(aiSuggestedQuestions)
      .orderBy(asc(aiSuggestedQuestions.order));
    res.json({ items });
  },
);

// ─── Provider info ────────────────────────────────────────────────────────────
// GET /ai/provider
router.get(
  "/ai/provider",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const provider = getAIProvider();
    res.json({ name: provider.name, modelId: provider.modelId });
  },
);

export default router;
