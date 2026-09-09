const UTF8_BOM = "\uFEFF";
const CSV_FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/;

export function neutralizeCSVFormula(str: string): string {
  return CSV_FORMULA_PREFIX.test(str) ? `'${str}` : str;
}

export function escapeCSV(val: unknown, sep: string): string {
  if (val === null || val === undefined) return "";
  const str = neutralizeCSVFormula(String(val));
  if (
    str.includes(sep) ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function toCSV(rows: Record<string, unknown>[], sep = ","): string {
  if (rows.length === 0) return UTF8_BOM + "\r\n";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map((h) => escapeCSV(h, sep)).join(sep),
    ...rows.map((row) =>
      headers.map((h) => escapeCSV(row[h], sep)).join(sep),
    ),
  ];
  return UTF8_BOM + lines.join("\r\n");
}
