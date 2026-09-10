import type { AIProvider, AIStreamChunk } from "./provider";

export class UnavailableAIProvider implements AIProvider {
  readonly name = "AI unavailable (configuration required)";
  readonly modelId = "unavailable";

  async *chat(): AsyncGenerator<AIStreamChunk> {
    yield {
      type: "error",
      error:
        "AI_PROVIDER_UNAVAILABLE: No real AI provider is available. Configuration is required.",
    };
  }
}
