// ─── AI Provider Factory ──────────────────────────────────────────────────────
// Selects the appropriate provider based on available environment variables.
// Priority: OPENAI_API_KEY → ANTHROPIC_API_KEY → Mock
// Override with AI_PROVIDER env var: "openai" | "claude" | "mock"

import type { AIProvider } from "./provider";
import { OpenAIProvider } from "./openai";
import { ClaudeProvider } from "./claude";
import { MockAIProvider } from "./mock";

// Singleton — provider is resolved once per process lifecycle
let _provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (_provider) return _provider;

  const forceProvider = process.env.AI_PROVIDER?.toLowerCase();
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (forceProvider === "mock") {
    _provider = new MockAIProvider();
    return _provider;
  }

  if (forceProvider === "openai" || (!forceProvider && openaiKey)) {
    if (!openaiKey) {
      console.warn("[AI] AI_PROVIDER=openai but OPENAI_API_KEY is not set — falling back to mock");
      _provider = new MockAIProvider();
    } else {
      const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      _provider = new OpenAIProvider(openaiKey, model);
    }
    return _provider;
  }

  if (forceProvider === "claude" || (!forceProvider && anthropicKey)) {
    if (!anthropicKey) {
      console.warn("[AI] AI_PROVIDER=claude but ANTHROPIC_API_KEY is not set — falling back to mock");
      _provider = new MockAIProvider();
    } else {
      const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022";
      _provider = new ClaudeProvider(anthropicKey, model);
    }
    return _provider;
  }

  // Default: mock provider (no API keys configured)
  _provider = new MockAIProvider();
  return _provider;
}

/** Reset the provider singleton — useful in tests or when env vars change */
export function resetAIProvider(): void {
  _provider = null;
}

export type { AIProvider } from "./provider";
