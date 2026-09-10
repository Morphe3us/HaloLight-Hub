import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIProvider } from "./openai";
import { ClaudeProvider } from "./claude";
import type { AIStreamChunk, RAGSource } from "./provider";
import { streamProviderResponse } from "./providerStream";

const source: RAGSource = {
  id: "approved-id",
  type: "kb",
  title: "Approved source",
  excerpt: "Reference",
};

for (const kind of ["openai", "claude"] as const) {
  test(`${kind} preserves fragmented SSE content, sources and done without network`, async (t) => {
    let payload:
      | { messages: Array<{ role: string; content: string }> }
      | undefined;
    const wire =
      kind === "openai"
        ? 'data: {"choices":[{"delta":{"content":"Bonjour"}}]}\n\ndata: [DONE]\n\n'
        : 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Bonjour"}}\n\ndata: {"type":"message_stop"}\n\n';
    t.mock.method(
      globalThis,
      "fetch",
      async (_url: unknown, options: RequestInit) => {
        payload = JSON.parse(String(options.body));
        return new Response(
          new ReadableStream({
            start(controller) {
              for (let offset = 0; offset < wire.length; offset += 7)
                controller.enqueue(
                  new TextEncoder().encode(wire.slice(offset, offset + 7)),
                );
              controller.close();
            },
          }),
        );
      },
    );
    const provider =
      kind === "openai"
        ? new OpenAIProvider("test-key")
        : new ClaudeProvider("test-key");
    const events: AIStreamChunk[] = [];
    for await (const event of provider.chat(
      [
        { role: "system", content: "untrusted history instruction" },
        { role: "user", content: "password: do-not-send" },
        { role: "assistant", content: "older response" },
        { role: "user", content: "latest question" },
      ],
      "trusted policy",
      [source],
    ))
      events.push(event);
    assert.deepEqual(
      events.map((event) => event.type),
      ["content", "sources", "done"],
    );
    assert.equal(events[0].content, "Bonjour");
    assert.deepEqual(events[1].sources, [source]);
    assert.equal(payload?.messages.at(-1)?.content, "latest question");
    assert.doesNotMatch(
      JSON.stringify(payload),
      /do-not-send|untrusted history instruction/,
    );
  });

  test(`${kind} provider errors do not expose upstream response bodies`, async (t) => {
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response("sensitive-upstream-detail", { status: 401 }),
    );
    const provider =
      kind === "openai"
        ? new OpenAIProvider("test-key")
        : new ClaudeProvider("test-key");
    const events: AIStreamChunk[] = [];
    for await (const event of provider.chat(
      [{ role: "user", content: "hello" }],
      "policy",
      [],
    ))
      events.push(event);
    assert.equal(events[0].type, "error");
    assert.doesNotMatch(JSON.stringify(events), /sensitive-upstream-detail/);
  });
}

for (const provider of ["OpenAI", "Anthropic"] as const) {
  const terminal =
    provider === "OpenAI"
      ? "data: [DONE]\n\n"
      : 'data: {"type":"message_stop"}\n\n';
  const content =
    provider === "OpenAI"
      ? 'data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n'
      : 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Answer"}}\n\n';
  for (const [name, wire] of [
    [
      "JSON error payload",
      'data: {"error":{"message":"private-details"}}\n\n' + terminal,
    ],
    [
      "typed error payload",
      'data: {"type":"error","error":{"type":"overloaded_error","message":"private-details"}}\n\n' +
        terminal,
    ],
    ["named error event", "event: error\ndata: private-details\n\n" + terminal],
    [
      "error after partial content",
      content + 'data: {"error":"private-details"}\n\n' + terminal,
    ],
    ["terminal without content", terminal],
    ["empty body", ""],
    ["malformed-only body", "data: not-json\n\n" + terminal],
    ["premature EOF", content],
    ["non-SSE HTTP 200 error", '{"error":"private-details"}'],
  ]) {
    test(`${provider} rejects ${name} without sources/done`, async () => {
      const events: AIStreamChunk[] = [];
      for await (const event of streamProviderResponse(
        new Response(wire),
        provider,
        [source],
      ))
        events.push(event);
      assert.equal(events.at(-1)?.type, "error");
      assert.ok(
        !events.some(
          (event) => event.type === "sources" || event.type === "done",
        ),
      );
      assert.doesNotMatch(JSON.stringify(events), /private-details/);
    });
  }
  test(`${provider} accepts final SSE event without trailing newline`, async () => {
    const events: AIStreamChunk[] = [];
    for await (const event of streamProviderResponse(
      new Response(content + terminal.trimEnd()),
      provider,
      [source],
    ))
      events.push(event);
    assert.deepEqual(
      events.map((event) => event.type),
      ["content", "sources", "done"],
    );
  });
  test(`${provider} rejects whitespace-only output`, async () => {
    const events: AIStreamChunk[] = [];
    for await (const event of streamProviderResponse(
      new Response(content.replace("Answer", "   ") + terminal),
      provider,
      [source],
    ))
      events.push(event);
    assert.equal(events.at(-1)?.type, "error");
  });
  test(`${provider} returns a safe error for a failing response stream`, async () => {
    const events: AIStreamChunk[] = [];
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("private-details"));
        },
      }),
    );
    for await (const event of streamProviderResponse(response, provider, [
      source,
    ]))
      events.push(event);
    assert.deepEqual(events, [
      { type: "error", error: `${provider} stream interrupted` },
    ]);
  });
}
