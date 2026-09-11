export type PreferenceUpdate = {
  emailEnabled?: boolean;
  inAppEnabled?: boolean;
  typeOverrides?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePreferenceUpdate(body: unknown): PreferenceUpdate | null {
  if (!isRecord(body)) return null;
  if (Object.keys(body).some((key) => !["emailEnabled", "inAppEnabled", "typeOverrides"].includes(key))) return null;
  const update: PreferenceUpdate = {};
  for (const key of ["emailEnabled", "inAppEnabled"] as const) {
    if (Object.hasOwn(body, key)) {
      if (typeof body[key] !== "boolean") return null;
      update[key] = body[key];
    }
  }
  if (Object.hasOwn(body, "typeOverrides")) {
    if (!isRecord(body.typeOverrides)) return null;
    update.typeOverrides = JSON.stringify(body.typeOverrides);
  }
  return update;
}

export function preferenceResponse(userId: string, prefs?: {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  typeOverrides: string;
}) {
  let typeOverrides: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(prefs?.typeOverrides ?? "{}");
    if (isRecord(parsed)) typeOverrides = parsed;
  } catch { /* Legacy malformed overrides must not prevent preference recovery. */ }
  return { userId, emailEnabled: prefs?.emailEnabled ?? true, inAppEnabled: prefs?.inAppEnabled ?? true, typeOverrides };
}
