// ─── Anthropic Claude Provider ────────────────────────────────────────────────
// Uses the Anthropic Messages API with streaming.
// Requires ANTHROPIC_API_KEY environment variable.

import type { AIProvider, AIMessage, AIStreamChunk, RAGSource, SuggestedAction, AIProviderOptions } from "./provider";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export class ClaudeProvider implements AIProvider {
  readonly name: string;
  readonly modelId: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model = "claude-3-5-haiku-20241022") {
    this.apiKey = apiKey;
    this.modelId = model;
    this.name = `Claude ${model}`;
  }

  async *chat(
    messages: AIMessage[],
    systemPrompt: string,
    sources: RAGSource[],
    options?: AIProviderOptions
  ): AsyncGenerator<AIStreamChunk> {
    // Anthropic requires alternating user/assistant messages starting with user
    const filteredMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Ensure conversation starts with user role
    if (filteredMessages.length === 0 || filteredMessages[0]?.role !== "user") {
      yield { type: "error", error: "Conversation must start with a user message" };
      return;
    }

    const payload = {
      model: this.modelId,
      max_tokens: options?.maxTokens ?? 1024,
      system: systemPrompt,
      messages: filteredMessages,
      stream: true,
    };

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      yield { type: "error", error: "Failed to connect to Anthropic API" };
      return;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      yield { type: "error", error: `Anthropic API error ${response.status}: ${body.slice(0, 200)}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body from Anthropic" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          try {
            const event = JSON.parse(data) as {
              type?: string;
              delta?: { type?: string; text?: string };
              index?: number;
            };
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              if (event.delta.text) yield { type: "content", content: event.delta.text };
            } else if (event.type === "message_stop") {
              if (sources.length > 0) yield { type: "sources", sources };
              yield { type: "done" };
              return;
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (sources.length > 0) yield { type: "sources", sources };
    yield { type: "done" };
  }
}
