import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { parseKbQuery, isKbUuid, foldKbSearch, kbSearchPattern, foldKbSql } from "./kbQuery";

test("KB query defaults leave language unfiltered; all supported languages remain selectable", () => {
  assert.deepEqual(parseKbQuery({}), { language: undefined, categoryId: undefined, status: undefined, search: undefined, limit: 50, offset: 0 });
  for (const language of ["fr", "en", "de", "es", "it", "nl", "pl", "pt"]) assert.equal(parseKbQuery({ language }).language, language);
  assert.equal(parseKbQuery({ limit: "100", offset: "100000" }).offset, 100000);
});

test("KB query rejects malformed, repeated and unbounded input before SQL", () => {
  for (const query of [
    { limit: "0" }, { limit: "101" }, { limit: "-1" }, { limit: "NaN" }, { limit: "1.5" }, { limit: "1e2" },
    { offset: "-1" }, { offset: "100001" }, { offset: "Infinity" }, { limit: ["5", "10"] },
    { language: ["fr", "en"] }, { language: { eq: "fr" } }, { language: "" }, { language: "xx" }, { status: "unknown" },
    { categoryId: "not-a-uuid" }, { categoryId: ["abc"] }, { search: ["test"] }, { search: "a".repeat(201) },
  ]) assert.throws(() => parseKbQuery(query), JSON.stringify(query));
  assert.ok(isKbUuid("12345678-1234-1234-1234-123456789abc"));
  assert.equal(isKbUuid("123"), false);
});

test("French search folds composed/decomposed accents and ligatures, and escapes LIKE wildcards", () => {
  assert.equal(foldKbSearch("Écran, température, cœur, æther, Noël"), "ecran, temperature, coeur, aether, noel");
  assert.equal(foldKbSearch("E\u0301cran"), "ecran");
  assert.equal(kbSearchPattern("50%_\\É"), "%50\\%\\_\\\\e%");
  const query = new PgDialect().sqlToQuery(foldKbSql(sql`title`));
  assert.match(query.sql, /normalize\(coalesce\(title/);
  assert.doesNotMatch(query.sql, /unaccent/);
});
