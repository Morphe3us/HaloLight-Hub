import test from "node:test";
import assert from "node:assert/strict";
import { resolveAIProvider } from "./factory";
import { generateMockResponse, MockAIProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import { ClaudeProvider } from "./claude";
import { UnavailableAIProvider } from "./unavailable";
import { supportChat } from "./supportPolicy";

test("missing explicitly selected credentials never silently fall back to a demo or other provider", async () => {
  for (const env of [
    { AI_PROVIDER: "openai" },
    { AI_PROVIDER: "claude" },
    {
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "   ",
      ANTHROPIC_API_KEY: "fixture",
    },
    { AI_PROVIDER: "claude", OPENAI_API_KEY: "fixture" },
    { AI_PROVIDER: "typo", OPENAI_API_KEY: "fixture" },
    { NODE_ENV: "production" },
    { NODE_ENV: "production", AI_PROVIDER: "", OPENAI_API_KEY: " " },
  ]) {
    const provider = resolveAIProvider(env);
    assert.ok(provider instanceof UnavailableAIProvider);
    const events = [];
    for await (const event of supportChat(
      provider,
      [{ role: "user", content: "Printer paper" }],
      "",
      [],
      "en",
      "Printer paper",
    ))
      events.push(event);
    assert.deepEqual(
      events.map((e) => e.type),
      ["error"],
    );
    assert.match(events[0].error!, /^AI_PROVIDER_UNAVAILABLE:/);
  }
});

test("normal provider priority and explicit overrides are preserved without network calls", () => {
  assert.ok(
    resolveAIProvider({
      OPENAI_API_KEY: "fixture",
      ANTHROPIC_API_KEY: "fixture",
    }) instanceof OpenAIProvider,
  );
  assert.ok(
    resolveAIProvider({ ANTHROPIC_API_KEY: "fixture" }) instanceof
      ClaudeProvider,
  );
  assert.ok(
    resolveAIProvider({
      AI_PROVIDER: "claude",
      OPENAI_API_KEY: "fixture",
      ANTHROPIC_API_KEY: "fixture",
    }) instanceof ClaudeProvider,
  );
  assert.equal(
    resolveAIProvider({
      OPENAI_API_KEY: "fixture",
      OPENAI_MODEL: "configured-model",
    }).modelId,
    "configured-model",
  );
});

test("explicit demo and unconfigured development clearly disclose no real AI provider", () => {
  assert.ok(
    resolveAIProvider({ NODE_ENV: "development" }) instanceof MockAIProvider,
  );
  assert.ok(
    resolveAIProvider({
      NODE_ENV: "production",
      AI_PROVIDER: "mock",
    }) instanceof MockAIProvider,
  );
  assert.match(
    generateMockResponse("printer", [], "fr"),
    /aucun fournisseur IA reel/,
  );
  assert.match(
    generateMockResponse("printer", [], "en"),
    /no real AI provider/,
  );
});

test("unavailable provider never suppresses immediate physical danger guidance", async () => {
  const events = [];
  for await (const event of supportChat(
    new UnavailableAIProvider(),
    [],
    "",
    [],
    "en",
    "Smoke from printer",
  ))
    events.push(event);
  assert.deepEqual(
    events.map((e) => e.type),
    ["content", "done"],
  );
  assert.match(events[0].content!, /Stop using and troubleshooting/);
});
