export interface PublishedLegalDocuments {
  termsVersion: string;
  privacyVersion: string;
  termsUrl: string;
  privacyUrl: string;
}

export interface OptionalConsents {
  marketing: boolean;
  analytics: boolean;
  aiImprovement: boolean;
}

export function legalConsentEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LEGAL_CONSENT_ENABLED === "true";
}

export function publishedLegalDocuments(
  env: Record<string, string | undefined> = process.env,
): PublishedLegalDocuments | null {
  if (!legalConsentEnabled(env)) return null;
  const fields = {
    termsVersion: env.LEGAL_TERMS_VERSION?.trim(),
    privacyVersion: env.LEGAL_PRIVACY_VERSION?.trim(),
    termsUrl: env.LEGAL_TERMS_URL?.trim(),
    privacyUrl: env.LEGAL_PRIVACY_URL?.trim(),
  };
  if (Object.values(fields).some((value) => !value)) return null;
  for (const value of [fields.termsUrl!, fields.privacyUrl!]) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password) return null;
    } catch { return null; }
  }
  // Deployment must supply approved, published documents; this creates no policy.
  return fields as PublishedLegalDocuments;
}

export function hasCurrentAcceptance(
  documents: PublishedLegalDocuments,
  acceptance: PublishedLegalDocuments | null,
): boolean {
  return acceptance !== null &&
    (Object.keys(documents) as Array<keyof PublishedLegalDocuments>)
      .every((key) => documents[key] === acceptance[key]);
}

export function parseAcceptance(input: unknown, documents: PublishedLegalDocuments) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  if (body.accepted !== true || body.termsVersion !== documents.termsVersion ||
      body.privacyVersion !== documents.privacyVersion || body.termsUrl !== documents.termsUrl ||
      body.privacyUrl !== documents.privacyUrl) return null;
  const optional: OptionalConsents = { marketing: false, analytics: false, aiImprovement: false };
  for (const key of Object.keys(optional) as Array<keyof OptionalConsents>) {
    if (body[key] !== undefined && typeof body[key] !== "boolean") return null;
    optional[key] = body[key] === true;
  }
  return optional;
}
