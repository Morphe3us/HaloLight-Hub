type SessionClaims = Record<string, unknown> | undefined;

type ClerkEmailAddress = {
  id?: string | null;
  email_address?: string | null;
  verification?: {
    status?: string | null;
  } | null;
};

type ClerkUserApiResponse = {
  email_addresses?: ClerkEmailAddress[] | null;
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
};

export type ClerkUserProfile = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  emailVerified: boolean;
};

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickClaim(claims: SessionClaims, keys: string[]): string | null {
  for (const key of keys) {
    const value = asTrimmedString(claims?.[key]);
    if (value) return value;
  }
  return null;
}

function normalizeEmail(value: unknown): string | null {
  const email = asTrimmedString(value)?.toLowerCase() ?? null;
  return email?.includes("@") ? email : null;
}

function pickVerifiedClaim(claims: SessionClaims): boolean | null {
  const value = claims?.email_verified ?? claims?.emailVerified;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "verified"].includes(normalized)) return true;
    if (["false", "0", "no", "unverified"].includes(normalized)) return false;
  }
  return null;
}

function isVerifiedEmailAddress(email: ClerkEmailAddress | undefined): boolean {
  return email?.verification?.status?.toLowerCase() === "verified";
}

function fullNameFromParts(
  firstName: string | null,
  lastName: string | null,
  fallback: string | null,
): string | null {
  const fromParts = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fromParts || fallback;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return Boolean(email?.trim().toLowerCase().endsWith("@placeholder.com"));
}

export function isPlaceholderProfileName(profile: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}): boolean {
  const firstName = profile.firstName?.trim().toLowerCase() ?? "";
  const lastName = profile.lastName?.trim().toLowerCase() ?? "";
  const fullName = profile.fullName?.trim().toLowerCase() ?? "";

  return (
    fullName === "user" ||
    fullName === "user member" ||
    (firstName === "user" && (!lastName || lastName === "member"))
  );
}

export function hasProfileText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function needsClerkProfileRepair(profile: {
  email: string | null | undefined;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}): boolean {
  return (
    isPlaceholderEmail(profile.email) ||
    isPlaceholderProfileName(profile) ||
    !hasProfileText(profile.firstName) ||
    !hasProfileText(profile.lastName) ||
    !hasProfileText(profile.fullName)
  );
}

export function extractClerkApiProfile(
  user: ClerkUserApiResponse | null,
): Partial<ClerkUserProfile> {
  if (!user) return {};

  const primaryEmail =
    user.email_addresses?.find(
      (email) => email.id === user.primary_email_address_id,
    );
  const firstName = asTrimmedString(user.first_name);
  const lastName = asTrimmedString(user.last_name);
  const username = asTrimmedString(user.username);
  const fullName = fullNameFromParts(firstName, lastName, username);

  return {
    email: normalizeEmail(primaryEmail?.email_address) ?? undefined,
    emailVerified: isVerifiedEmailAddress(primaryEmail),
    firstName,
    lastName,
    fullName,
  };
}

export function buildClerkUserProfile(
  clerkId: string,
  claims: SessionClaims,
  apiProfile: Partial<ClerkUserProfile> = {},
): ClerkUserProfile {
  const firstName =
    apiProfile.firstName ??
    pickClaim(claims, ["first_name", "given_name"]) ??
    null;
  const lastName =
    apiProfile.lastName ??
    pickClaim(claims, ["last_name", "family_name"]) ??
    null;
  const fullName =
    apiProfile.fullName ??
    pickClaim(claims, ["name", "full_name", "fullName"]) ??
    fullNameFromParts(firstName, lastName, null);
  const claimEmail = normalizeEmail(
    pickClaim(claims, ["email", "primary_email_address"]),
  );
  const apiEmail = normalizeEmail(apiProfile.email);
  const email = apiEmail ?? claimEmail ?? `${clerkId}@placeholder.com`.toLowerCase();
  const claimEmailVerified = pickVerifiedClaim(claims);

  return {
    email,
    emailVerified:
      isPlaceholderEmail(email)
        ? false
        : apiEmail && apiEmail === email
        ? Boolean(apiProfile.emailVerified)
        : apiProfile.emailVerified !== undefined
          ? false
        : claimEmail
          ? (claimEmailVerified ?? false)
          : false,
    firstName,
    lastName,
    fullName,
  };
}

export async function fetchClerkUserProfile(
  clerkId: string,
  secretKey = process.env.CLERK_SECRET_KEY,
  timeoutMs = 2500,
): Promise<Partial<ClerkUserProfile> | null> {
  if (!secretKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`Clerk user fetch failed with status ${response.status}`);
    }

    return extractClerkApiProfile(
      (await response.json()) as ClerkUserApiResponse,
    );
  } finally {
    clearTimeout(timeout);
  }
}
