// ─── OpenAI Provider ─────────────────────────────────────────────────────────
// Uses the OpenAI Chat Completions API with streaming.
// Requires OPENAI_API_KEY environment variable.

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

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAIProvider implements AIProvider {
  readonly name: string;
  readonly modelId: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    this.apiKey = apiKey;
    this.modelId = model;
    this.name = `OpenAI ${model}`;
  }

  async *chat(
    messages: AIMessage[],
    systemPrompt: string,
    sources: RAGSource[],
    options?: AIProviderOptions,
  ): AsyncGenerator<AIStreamChunk> {
    const payload = {
      model: this.modelId,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role,
            content: redactSensitiveText(m.content),
          })),
      ],
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    };

    let response: Response;
    try {
      response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      yield { type: "error", error: "Failed to connect to OpenAI API" };
      return;
    }

    if (!response.ok) {
      yield { type: "error", error: `OpenAI API error ${response.status}` };
      return;
    }

    yield* streamProviderResponse(response, "OpenAI", sources);
  }
}
