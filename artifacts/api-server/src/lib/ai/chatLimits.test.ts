import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chatInputError, MAX_CHAT_CHARACTERS } from "./chatLimits";

test("chat requests reject empty, non-string and oversized input without truncation", () => {
  for (const input of [null, undefined, {}, [], 12, "", "   "])
    assert.equal(chatInputError(input), "content required");
  assert.equal(chatInputError("a".repeat(MAX_CHAT_CHARACTERS)), undefined);
  assert.match(chatInputError("a".repeat(MAX_CHAT_CHARACTERS + 1))!, /exceeds/);
  const route = readFileSync(
    new URL("../../routes/ai.ts", import.meta.url),
    "utf8",
  );
  assert.equal(route.split("chatInputError(rawContent)").length - 1, 2);
});
