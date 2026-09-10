import type {
  AIProvider,
  AIMessage,
  AIStreamChunk,
  RAGSource,
  AIProviderOptions,
} from "./provider";
import { safetyResponse, redactSensitiveText } from "./supportPolicy";

export function generateMockResponse(
  query: string,
  sources: RAGSource[],
  language = "en",
): string {
  const guarded = safetyResponse(query, language);
  if (guarded) return guarded;
  const fr = language.startsWith("fr");
  const introduction = fr
    ? "Je suis l'assistant de demonstration, sans diagnostic technique valide. Vous pouvez preparer un ticket de support ; cette reponse n'en cree pas."
    : "I am the demo assistant, without a verified technical diagnosis. You can prepare a support ticket; this reply does not create one.";
  if (!sources.length)
    return (
      introduction +
      (fr
        ? " Je n'ai pas de source approuvee applicable. Quel est le modele exact concerne ?"
        : " I have no applicable approved source. What is the exact model concerned?")
    );
  const references = sources
    .slice(0, 3)
    .map(
      (s) =>
        `- ${redactSensitiveText(s.title)} [${s.id}; ${s.meta?.language ?? "unknown"}${s.meta?.sourceRevision ? `; ${s.meta.sourceRevision}` : ""}]`,
    )
    .join("\n");
  return `${introduction}\n\n${references}`;
}

export class MockAIProvider implements AIProvider {
  readonly name = "Mock (Demo)";
  readonly modelId = "mock-v1";

  async *chat(
    messages: AIMessage[],
    _systemPrompt: string,
    sources: RAGSource[],
    options?: AIProviderOptions,
  ): AsyncGenerator<AIStreamChunk> {
    const query =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    yield {
      type: "content",
      content: generateMockResponse(query, sources, options?.language),
    };
    if (sources.length) yield { type: "sources", sources };
    yield { type: "done" };
  }
}
