import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import * as drizzle from "drizzle-orm";
import * as retrieval from "./retrievalPolicy";
import * as support from "./supportPolicy";
import type { RAGSource, SuggestedAction } from "./provider";

const dependencies: Record<string, unknown> = {
  "drizzle-orm": drizzle,
  "@workspace/db": {},
  "./retrievalPolicy": retrieval,
  "./supportPolicy": support,
};
const module = {
  exports: {} as {
    buildSuggestedActions: (
      query: string,
      sources: RAGSource[],
      language: string,
    ) => SuggestedAction[];
  },
};
const code = transformSync(
  readFileSync(new URL("./rag.ts", import.meta.url), "utf8"),
  { loader: "ts", format: "cjs" },
).code;
new Function("require", "module", "exports", code)(
  (name: string) => {
    assert.ok(Object.hasOwn(dependencies, name));
    return dependencies[name];
  },
  module,
  module.exports,
);
const { buildSuggestedActions } = module.exports;
const source: RAGSource = {
  id: "official",
  type: "knowledge",
  title: "Original printer guide",
  excerpt: "Documented paper procedure",
};
const query = "Printer paper problem during a live event";

test("documented live-event issue does not offer immediate escalation", () => {
  assert.equal(
    buildSuggestedActions(query, [source], "en").some(
      (a) => a.type === "escalate",
    ),
    false,
  );
  assert.equal(support.safetyResponse(query), undefined);
});

test("missing procedures or explicit human request keep urgent escalation during an event", () => {
  for (const sources of [
    [],
    [{ ...source, type: "academy" as const }],
    [{ ...source, excerpt: " " }],
  ])
    assert.equal(
      buildSuggestedActions(query, sources, "en").find(
        (a) => a.type === "escalate",
      )?.data?.priority,
      "urgent",
    );
  assert.equal(
    buildSuggestedActions(query + ". Open a ticket", [source], "en").find(
      (a) => a.type === "escalate",
    )?.data?.priority,
    "urgent",
  );
});

test("danger still overrides available documentation and disables suggested manipulations", async () => {
  const danger = query + ". There is smoke";
  assert.deepEqual(buildSuggestedActions(danger, [source], "en"), []);
  let called = false;
  const events = [];
  for await (const event of support.supportChat(
    {
      name: "fixture",
      modelId: "fixture",
      async *chat() {
        called = true;
        yield { type: "done" };
      },
    },
    [],
    "",
    [source],
    "en",
    danger,
  ))
    events.push(event);
  assert.equal(called, false);
  assert.match(events[0].content!, /Stop using and troubleshooting/);
});
