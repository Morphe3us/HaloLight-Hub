export type DateInputResult =
  | { ok: true; value: Date | null }
  | { ok: false; error: string };

/**
 * Parses an optional date coming from a request body. Empty values resolve to
 * null; unparseable values return an error instead of letting an Invalid Date
 * reach the database or rendered documents.
 */
export function parseOptionalDateInput(
  field: string,
  value: string | null | undefined,
): DateInputResult {
  if (value === undefined || value === null || value.trim() === "") {
    return { ok: true, value: null };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: `${field} must be a valid date` };
  }
  return { ok: true, value: parsed };
}
