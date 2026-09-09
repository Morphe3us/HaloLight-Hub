/**
 * Computes the next sequential document number for a given prefix and year.
 * Legacy randomly-generated numbers (e.g. CON-2026-4821) are treated as part
 * of the sequence, so the next number is always greater than any existing one.
 *
 * Pure logic only — DB-backed helpers live in documentNumberQueries.ts so this
 * module stays testable without a DATABASE_URL.
 */
export function buildNextDocumentNumber(
  prefix: string,
  year: number,
  existingNumbers: readonly string[],
): string {
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  let max = 0;
  for (const number of existingNumbers) {
    const match = pattern.exec(number);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return `${prefix}-${year}-${String(max + 1).padStart(4, "0")}`;
}
