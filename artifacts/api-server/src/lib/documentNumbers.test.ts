import assert from "node:assert/strict";
import test from "node:test";
import { buildNextDocumentNumber } from "./documentNumbers";

test("buildNextDocumentNumber starts at 0001 when no documents exist", () => {
  assert.equal(buildNextDocumentNumber("CON", 2026, []), "CON-2026-0001");
});

test("buildNextDocumentNumber increments past the highest existing number", () => {
  assert.equal(
    buildNextDocumentNumber("INV", 2026, [
      "INV-2026-0001",
      "INV-2026-0003",
      "INV-2026-0002",
    ]),
    "INV-2026-0004",
  );
});

test("buildNextDocumentNumber continues after legacy random numbers", () => {
  assert.equal(
    buildNextDocumentNumber("Q", 2026, ["Q-2026-4821", "Q-2026-0002"]),
    "Q-2026-4822",
  );
});

test("buildNextDocumentNumber ignores other prefixes and years", () => {
  assert.equal(
    buildNextDocumentNumber("CON", 2026, [
      "CON-2025-9000",
      "INV-2026-9000",
      "CON-2026-not-a-number",
    ]),
    "CON-2026-0001",
  );
});

test("buildNextDocumentNumber grows beyond four digits without wrapping", () => {
  assert.equal(
    buildNextDocumentNumber("CON", 2026, ["CON-2026-9999"]),
    "CON-2026-10000",
  );
});
