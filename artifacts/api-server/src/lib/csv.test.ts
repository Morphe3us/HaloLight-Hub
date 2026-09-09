import test from "node:test";
import assert from "node:assert/strict";
import { toCSV } from "./csv";

test("toCSV neutralizes spreadsheet formulas", () => {
  const csv = toCSV([
    {
      plain: "normal",
      formula: "=2+2",
      plus: "+SUM(1,1)",
      spaced: " -10",
      atSign: "@cmd",
    },
  ]);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("normal"));
  assert.ok(csv.includes("'=2+2"));
  assert.ok(csv.includes("\"'+SUM(1,1)\""));
  assert.ok(csv.includes("' -10"));
  assert.ok(csv.includes("'@cmd"));
});

test("toCSV escapes quotes, commas, and empty values", () => {
  const csv = toCSV([
    {
      quoted: 'A "quote"',
      comma: "x,y",
      empty: null,
    },
  ]);

  assert.ok(csv.includes('"A ""quote"""'));
  assert.ok(csv.includes('"x,y"'));
  assert.ok(csv.endsWith('"A ""quote""","x,y",'));
});
