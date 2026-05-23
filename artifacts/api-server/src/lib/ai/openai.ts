// ─── OpenAI Provider ─────────────────────────────────────────────────────────
// Uses the OpenAI Chat Completions API with streaming.
// Requires OPENAI_API_KEY environment variable.

import type { AIProvider, AIMessage, AIStreamChunk, RAGSource, SuggestedAction, AIProviderOptions } from "./provider";

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
    options?: AIProviderOptions
  ): AsyncGenerator<AIStreamChunk> {
    const payload = {
      model: this.modelId,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
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
      });
    } catch (err) {
      yield { type: "error", error: "Failed to connect to OpenAI API" };
      return;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      yield { type: "error", error: `OpenAI API error ${response.status}: ${body.slice(0, 200)}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body from OpenAI" };
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
          if (data === "[DONE]") {
            if (sources.length > 0) yield { type: "sources", sources };
            yield { type: "done" };
            return;
          }
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
            };
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield { type: "content", content };
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
