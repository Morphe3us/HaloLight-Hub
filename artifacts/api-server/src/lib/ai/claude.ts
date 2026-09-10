// ─── Anthropic Claude Provider ────────────────────────────────────────────────
// Uses the Anthropic Messages API with streaming.
// Requires ANTHROPIC_API_KEY environment variable.

import type {
  AIProvider,
  AIMessage,
  AIStreamChunk,
  RAGSource,
  SuggestedAction,
  AIProviderOptions,
} from "./provider";

import { redactSensitiveText } from "./supportPolicy";
import { streamProviderResponse } from "./providerStream";

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
    options?: AIProviderOptions,
  ): AsyncGenerator<AIStreamChunk> {
    // Anthropic requires alternating user/assistant messages starting with user
    const filteredMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: redactSensitiveText(m.content),
      }));

    // Ensure conversation starts with user role
    if (filteredMessages.length === 0 || filteredMessages[0]?.role !== "user") {
      yield {
        type: "error",
        error: "Conversation must start with a user message",
      };
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
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      yield { type: "error", error: "Failed to connect to Anthropic API" };
      return;
    }

    if (!response.ok) {
      yield { type: "error", error: `Anthropic API error ${response.status}` };
      return;
    }

    yield* streamProviderResponse(response, "Anthropic", sources);
  }
}
