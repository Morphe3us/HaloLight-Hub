import { getSupabase } from "./supabase";

export type SupabaseUserProfile = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  emailVerified: boolean;
};

function text(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  return value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, limit) || null;
}

export function normalizeProfileEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !email || email.trim().toLowerCase().endsWith("@placeholder.com");
}

export function isPlaceholderProfileName(profile: {
  firstName?: string | null; lastName?: string | null; fullName?: string | null;
}): boolean {
  const first = profile.firstName?.trim().toLowerCase();
  const last = profile.lastName?.trim().toLowerCase();
  const full = profile.fullName?.trim().toLowerCase();
  return full === "user" || full === "user member" || (first === "user" && (!last || last === "member"));
}

export function needsSupabaseProfileRepair(profile: {
  email: string | null | undefined; firstName?: string | null; lastName?: string | null; fullName?: string | null;
}): boolean {
  return isPlaceholderEmail(profile.email) || isPlaceholderProfileName(profile) ||
    !profile.firstName?.trim() || !profile.lastName?.trim() || !profile.fullName?.trim();
}

export function buildSupabaseUserProfile(
  authId: string,
  claims: Record<string, unknown> | undefined,
  trusted: Partial<SupabaseUserProfile> = {},
): SupabaseUserProfile {
  const metadata = claims?.user_metadata;
  const cosmetic = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown> : {};
  const name = text(cosmetic.full_name ?? cosmetic.name, 200);
  const firstName = text(trusted.firstName ?? cosmetic.first_name ?? cosmetic.given_name ?? name?.split(" ")[0], 100);
  const lastName = text(trusted.lastName ?? cosmetic.last_name ?? cosmetic.family_name ?? name?.split(" ").slice(1).join(" "), 100);
  const email = normalizeProfileEmail(trusted.email);
  return {
    email: email ?? `${authId}@placeholder.com`,
    emailVerified: Boolean(email && !isPlaceholderEmail(email) && trusted.emailVerified === true),
    firstName, lastName,
    fullName: text(trusted.fullName ?? name ?? [firstName, lastName].filter(Boolean).join(" "), 200),
  };
}

export async function fetchSupabaseUserProfile(authId: string, accessToken: string): Promise<SupabaseUserProfile | null> {
  const { data, error } = await getSupabase().auth.getUser(accessToken);
  const user = data?.user;
  if (error || !user || user.id !== authId || user.is_anonymous === true) return null;
  const confirmed = typeof user.email_confirmed_at === "string" && Number.isFinite(Date.parse(user.email_confirmed_at));
  return buildSupabaseUserProfile(authId, { user_metadata: user.user_metadata }, {
    email: normalizeProfileEmail(user.email) ?? undefined,
    emailVerified: confirmed,
  });
}
