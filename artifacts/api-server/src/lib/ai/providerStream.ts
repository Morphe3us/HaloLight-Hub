import type { AIStreamChunk, RAGSource } from "./provider";

async function* readEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "";
  let data: string[] = [];
  try {
    while (true) {
      const result = await reader.read();
      buffer += result.done
        ? decoder.decode()
        : decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      if (result.done && buffer) {
        lines.push(buffer);
        buffer = "";
      }
      for (const raw of lines) {
        const line = raw.replace(/\r$/, "");
        if (!line) {
          if (data.length || event === "error")
            yield { event, data: data.join("\n") };
          event = "";
          data = [];
        } else if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (result.done) {
        if (data.length || event === "error")
          yield { event, data: data.join("\n") };
        return;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function* streamProviderResponse(
  response: Response,
  provider: "OpenAI" | "Anthropic",
  sources: RAGSource[],
): AsyncGenerator<AIStreamChunk> {
  if (!response.body) {
    yield { type: "error", error: `No response body from ${provider}` };
    return;
  }
  let hasContent = false;
  try {
    for await (const frame of readEvents(response.body)) {
      if (frame.event === "error") {
        yield { type: "error", error: `${provider} stream error` };
        return;
      }
      let payload: Record<string, unknown> = {};
      if (frame.data !== "[DONE]") {
        try {
          const parsed: unknown = JSON.parse(frame.data);
          if (parsed && typeof parsed === "object")
            payload = parsed as Record<string, unknown>;
        } catch {
          continue;
        }
      }
      if (payload.error != null || payload.type === "error") {
        yield { type: "error", error: `${provider} stream error` };
        return;
      }
      const finish =
        provider === "OpenAI"
          ? (
              payload.choices as Array<{ finish_reason?: string }> | undefined
            )?.[0]?.finish_reason
          : (payload.delta as { stop_reason?: string } | undefined)
              ?.stop_reason;
      if (
        finish === "length" ||
        finish === "max_tokens" ||
        finish === "content_filter"
      ) {
        yield { type: "error", error: `${provider} response incomplete` };
        return;
      }
      const complete =
        provider === "OpenAI"
          ? frame.data === "[DONE]"
          : payload.type === "message_stop";
      if (complete) {
        if (!hasContent)
          yield {
            type: "error",
            error: `${provider} returned an empty response`,
          };
        else {
          if (sources.length) yield { type: "sources", sources };
          yield { type: "done" };
        }
        return;
      }
      const choices = payload.choices as
        | Array<{ delta?: { content?: unknown } }>
        | undefined;
      const delta = payload.delta as
        | { type?: string; text?: unknown }
        | undefined;
      const content =
        provider === "OpenAI"
          ? choices?.[0]?.delta?.content
          : payload.type === "content_block_delta" &&
              delta?.type === "text_delta"
            ? delta.text
            : undefined;
      if (typeof content === "string" && content) {
        hasContent ||= content.trim().length > 0;
        yield { type: "content", content };
      }
    }
    yield {
      type: "error",
      error: hasContent
        ? `${provider} stream ended before completion`
        : `${provider} returned an empty response`,
    };
  } catch {
    yield { type: "error", error: `${provider} stream interrupted` };
  }
}
