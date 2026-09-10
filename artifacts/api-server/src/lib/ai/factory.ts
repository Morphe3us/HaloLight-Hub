// ─── AI Provider Factory ──────────────────────────────────────────────────────
// Selects the appropriate provider based on available environment variables.
// Priority: OPENAI_API_KEY → ANTHROPIC_API_KEY → Mock
// Override with AI_PROVIDER env var: "openai" | "claude" | "mock"

import type { AIProvider } from "./provider";
import { OpenAIProvider } from "./openai";
import { ClaudeProvider } from "./claude";
import { MockAIProvider } from "./mock";
import { UnavailableAIProvider } from "./unavailable";

// Singleton — provider is resolved once per process lifecycle
let _provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  _provider ??= resolveAIProvider(process.env);
  return _provider;
}

export function resolveAIProvider(
  env: Record<string, string | undefined>,
): AIProvider {
  const forceProvider = env.AI_PROVIDER?.trim().toLowerCase();
  const openaiKey = env.OPENAI_API_KEY?.trim();
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();

  if (forceProvider === "mock") {
    return new MockAIProvider();
  }

  if (forceProvider === "openai" || (!forceProvider && openaiKey)) {
    if (!openaiKey) {
      return new UnavailableAIProvider();
    } else {
      const model = env.OPENAI_MODEL ?? "gpt-4o-mini";
      return new OpenAIProvider(openaiKey, model);
    }
  }

  if (forceProvider === "claude" || (!forceProvider && anthropicKey)) {
    if (!anthropicKey) {
      return new UnavailableAIProvider();
    } else {
      const model = env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022";
      return new ClaudeProvider(anthropicKey, model);
    }
  }

  if (forceProvider || env.NODE_ENV === "production")
    return new UnavailableAIProvider();
  // Unconfigured development remains an explicitly labelled documentation demo.
  return new MockAIProvider();
}

/** Reset the provider singleton — useful in tests or when env vars change */
export function resetAIProvider(): void {
  _provider = null;
}

export type { AIProvider } from "./provider";
