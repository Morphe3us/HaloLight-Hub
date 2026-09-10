import { sql, type SQL } from "drizzle-orm";

export const isKbUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function parseKbQuery(query: Record<string, unknown>) {
  const scalar = (key: string) => {
    const value = query[key];
    if (value !== undefined && typeof value !== "string") throw new Error(`Invalid ${key}`);
    return value as string | undefined;
  };
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = scalar(key);
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw new Error(`Invalid ${key}`);
    return Number(value);
  };
  const language = scalar("language");
  if (language !== undefined && !["fr", "en", "de", "es", "it", "nl", "pl", "pt"].includes(language)) throw new Error("Invalid language");
  const categoryId = scalar("categoryId");
  if (categoryId !== undefined && !isKbUuid(categoryId)) throw new Error("Invalid categoryId");
  const status = scalar("status");
  if (status !== undefined && !["draft", "published", "archived"].includes(status)) throw new Error("Invalid status");
  const search = scalar("search")?.trim();
  if (search && search.length > 200) throw new Error("Search must be at most 200 characters");
  return { language, categoryId, status: status as "draft" | "published" | "archived" | undefined,
    search, limit: integer("limit", 50, 1, 100), offset: integer("offset", 0, 0, 100000) };
}

export function foldKbSearch(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae");
}

export function kbSearchPattern(value: string) {
  return `%${foldKbSearch(value).replace(/[\\%_]/g, "\\$&")}%`;
}

// PostgreSQL core functions only: no unaccent extension or database migration required.
export function foldKbSql(value: SQL) {
  return sql`replace(replace(translate(lower(normalize(coalesce(${value}, ''), NFD)), ${"\u0300\u0301\u0302\u0303\u0304\u0306\u0307\u0308\u030a\u030b\u030c\u0327\u0328"}, ''), 'œ', 'oe'), 'æ', 'ae')`;
}
