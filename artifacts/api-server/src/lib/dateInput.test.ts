import assert from "node:assert/strict";
import test from "node:test";
import { parseOptionalDateInput } from "./dateInput";

test("parseOptionalDateInput resolves empty values to null", () => {
  assert.deepEqual(parseOptionalDateInput("eventDate", undefined), {
    ok: true,
    value: null,
  });
  assert.deepEqual(parseOptionalDateInput("eventDate", null), {
    ok: true,
    value: null,
  });
  assert.deepEqual(parseOptionalDateInput("eventDate", "  "), {
    ok: true,
    value: null,
  });
});

test("parseOptionalDateInput parses valid ISO dates", () => {
  const result = parseOptionalDateInput("eventDate", "2026-07-14T10:00:00Z");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value?.toISOString(), "2026-07-14T10:00:00.000Z");
  }
});

test("parseOptionalDateInput rejects unparseable dates", () => {
  const result = parseOptionalDateInput("dueDate", "not-a-date");
  assert.deepEqual(result, { ok: false, error: "dueDate must be a valid date" });
});
