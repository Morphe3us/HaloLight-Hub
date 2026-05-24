// ─── AI Provider Abstraction Layer ───────────────────────────────────────────
// Swap provider implementations without touching application code.
// All providers implement AIProvider and stream AIStreamChunk events.

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface RAGSource {
  id: string;
  type: "kb" | "academy" | "support" | "product" | "knowledge";
  title: string;
  url?: string;
  excerpt: string;
}

export interface SuggestedAction {
  type: "escalate" | "navigate" | "reorder" | "book_service";
  label: string;
  data?: Record<string, unknown>;
}

export interface AIStreamChunk {
  type: "content" | "sources" | "actions" | "done" | "error";
  content?: string;
  sources?: RAGSource[];
  actions?: SuggestedAction[];
  error?: string;
}

export interface AIProviderOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface AIProvider {
  readonly name: string;
  readonly modelId: string;
  /**
   * Stream a chat completion.
   * Yields content chunks, then sources, then actions, then done.
   * The system prompt is pre-built by the caller (includes RAG context).
   */
  chat(
    messages: AIMessage[],
    systemPrompt: string,
    sources: RAGSource[],
    options?: AIProviderOptions
  ): AsyncGenerator<AIStreamChunk>;
}

// ─── System Prompt Builder ────────────────────────────────────────────────────

export function buildSystemPrompt(
  sources: RAGSource[],
  userName?: string
): string {
  const contextBlock =
    sources.length > 0
      ? sources
          .map(
            (s, i) =>
              `[SOURCE ${i + 1}] ${s.type.toUpperCase()}: ${s.title}\n${s.excerpt}`
          )
          .join("\n\n")
      : "No specific documentation retrieved for this query.";

  return `You are the HaloLight OS AI Assistant — a knowledgeable, friendly assistant for photobooth and event equipment operators.${userName ? ` You are helping ${userName}.` : ""}

You help clients with:
- Equipment operation, maintenance, and troubleshooting
- Consumables management (paper, ribbon, accessories)
- Business growth: bookings, quotes, events, CRM
- Academy learning content and onboarding
- Support issue resolution

RETRIEVED CONTEXT (use these to answer accurately):
${contextBlock}

RESPONSE GUIDELINES:
- Be concise, practical, and actionable
- Reference specific content from the retrieved sources when relevant
- If the answer involves a specific article or lesson, mention it by name
- For technical issues you cannot resolve, recommend escalating to support
- For consumable reorders, suggest using the Consumables page
- Format responses with short paragraphs; use line breaks for readability
- Never fabricate product details or pricing not in the context
- If context is insufficient, say so honestly and offer to escalate

CITATION FORMAT: When referencing a source, write it naturally (e.g., "According to the [Article Title] guide...") — do not use numbered citations.`;
}
