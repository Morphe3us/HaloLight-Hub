import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

// Execute the page's actual streaming callback without mounting React or using network.
function fixture(wire: string, status = 200) {
  const page = readFileSync(
    new URL(
      "../../../../halolight-os/src/pages/AIAssistant.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const start = page.indexOf("async (convId: string, msgText: string) => {");
  const end = page.indexOf(",\n    // deliberately excludes", start);
  assert.ok(start > 0 && end > start);
  const code = transformSync(`module.exports = ${page.slice(start, end)}`, {
    loader: "ts",
    format: "cjs",
  }).code;
  const notices: Array<{ description: string }> = [];
  const spoken: string[] = [];
  let state: { content: string } | null = null;
  const deps = {
    stream: null,
    setPendingUserMsg() {},
    streamFinalContentRef: { current: "" },
    setAbortCtrl() {},
    setStream(
      value: typeof state | ((previous: typeof state) => typeof state),
    ) {
      state = typeof value === "function" ? value(state) : value;
    },
    getAuthToken: async () => null,
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            const bytes = new TextEncoder().encode(wire);
            for (let index = 0; index < bytes.length; index += 3)
              controller.enqueue(bytes.slice(index, index + 3));
            controller.close();
          },
        }),
        { status },
      ),
    t: (key: string) => key,
    toast: (notice: { description: string }) => notices.push(notice),
    qc: { invalidateQueries() {} },
    autoPlay: true,
    voiceOutput: { speak: (content: string) => spoken.push(content) },
  };
  const module = { exports: undefined as unknown };
  new Function("module", ...Object.keys(deps), code)(
    module,
    ...Object.values(deps),
  );
  return {
    run: module.exports as (id: string, content: string) => Promise<void>,
    notices,
    spoken,
  };
}

for (const status of [200, 503]) {
  test(`AIAssistant translates unavailable-provider configuration errors over HTTP ${status}`, async () => {
    const error = "AI_PROVIDER_UNAVAILABLE: No real AI provider is available. Configuration is required.";
    const f = fixture(status === 200 ? `data: ${JSON.stringify({ type: "error", error })}\n\n` : JSON.stringify({ error }), status);
    await f.run("conversation", "question");
    assert.equal(f.notices.length, 1);
    assert.equal(f.notices[0].description, "ai.provider_unavailable");
    assert.doesNotMatch(f.notices[0].description, /No real AI|AI_PROVIDER_UNAVAILABLE/);
    assert.deepEqual(f.spoken, []);
  });
}

for (const [name, ending] of [
  [
    "provider error",
    'data: {"type":"error","error":"OpenAI response incomplete"}\n\n',
  ],
  ["premature EOF", ""],
  ["malformed event", "data: not-json\n\n"],
]) {
  test(`AIAssistant surfaces ${name} and never reads partial output aloud`, async () => {
    const f = fixture(
      'data: {"type":"content","content":"Partial"}\n\n' + ending,
    );
    await f.run("conversation", "question");
    assert.equal(f.notices.length, 1);
    if (name === "provider error")
      assert.equal(f.notices[0].description, "OpenAI response incomplete");
    assert.deepEqual(f.spoken, []);
  });
}

test("AIAssistant accepts fragmented UTF-8 SSE and reads only completed output", async () => {
  const f = fixture(
    'data: {"type":"content","content":"R\u00e9ponse"}\n\ndata: {"type":"done"}\n\n',
  );
  await f.run("conversation", "question");
  assert.deepEqual(f.notices, []);
  assert.deepEqual(f.spoken, ["R\u00e9ponse"]);
});
