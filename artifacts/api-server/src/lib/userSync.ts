import { getAuth } from "../middlewares/supabaseAuth";
import { type Request } from "express";
import { db, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import {
  buildSupabaseUserProfile,
  fetchSupabaseUserProfile,
  isPlaceholderEmail,
  isPlaceholderProfileName,
  needsSupabaseProfileRepair,
  type SupabaseUserProfile,
} from "./supabaseProfile";
import { parseBooleanEnv } from "./env";

type User = typeof usersTable.$inferSelect;
const SUPABASE_PROFILE_REFRESH_TTL_MS = 5 * 60 * 1000;
const SUPABASE_PROFILE_RETRY_TTL_MS = 15 * 1000;
const supabaseProfileRefreshCache = new Map<string, number>();
const supabaseProfileInFlight = new Map<string, Promise<SupabaseUserProfile>>();
const localUserSyncInFlight = new Map<string, Promise<User | null>>();
const requestUsers = new WeakMap<Request, Promise<User | null>>();
const requestApprovedUsers = new WeakMap<Request, Promise<User | null>>();

function isApproved(user: User | null | undefined): user is User {
  return Boolean(user?.isActive && user.accessStatus === "approved");
}

function valueOrExisting<T extends string | null>(
  existingValue: T,
  profileValue: string | null,
): T | string | null {
  return existingValue?.trim() ? existingValue : profileValue;
}

function profileUpdateForExisting(
  existing: User,
  profile: SupabaseUserProfile,
): Partial<typeof usersTable.$inferInsert> {
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  const hasVerifiedRealProfileEmail =
    !isPlaceholderEmail(profile.email) && profile.emailVerified;

  if (
    hasVerifiedRealProfileEmail &&
    normalizeEmail(existing.email) !== normalizeEmail(profile.email)
  ) {
    updates.email = profile.email;
  }
  const placeholderParts = isPlaceholderProfileName({
    firstName: existing.firstName,
    lastName: existing.lastName,
  });
  if (placeholderParts && profile.fullName && !isPlaceholderProfileName(profile)) {
    // A Google profile can have a single name. Do not retain "Member" as its surname.
    updates.firstName = profile.firstName;
    updates.lastName = profile.lastName;
  } else {
    if (!existing.firstName?.trim() && profile.firstName) {
      updates.firstName = profile.firstName;
    }
    if (!existing.lastName?.trim() && profile.lastName) {
      updates.lastName = profile.lastName;
    }
  }

  const nextFirstName =
    "firstName" in updates ? updates.firstName : existing.firstName;
  const nextLastName =
    "lastName" in updates ? updates.lastName : existing.lastName;
  const localFullName = [nextFirstName, nextLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const shouldReplaceFullName =
    !existing.fullName?.trim() || isPlaceholderProfileName(existing);
  const nextFullName = shouldReplaceFullName
    ? (profile.fullName ?? localFullName) || null
    : valueOrExisting(existing.fullName, (profile.fullName ?? localFullName) || null);
  if (nextFullName !== existing.fullName) {
    updates.fullName = nextFullName;
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date();
  }

  return updates;
}

async function refreshExistingUser(
  existing: User,
  profile: SupabaseUserProfile,
): Promise<User | null> {
  if (!isApproved(existing)) return null;

  const updates = profileUpdateForExisting(existing, profile);
  if (Object.keys(updates).length === 0) return existing;

  if (updates.email) {
    const conflicts = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(emailEqualsNormalized(updates.email));
    if (conflicts.some((conflict) => conflict.id !== existing.id)) {
      logger.warn(
        { userId: existing.id },
        "Refusing to repair Supabase placeholder email because another user already owns it",
      );
      delete updates.email;
      if (
        Object.keys(updates).filter((key) => key !== "updatedAt").length === 0
      ) {
        return existing;
      }
    }
  }

  let updated: User | undefined;
  try {
    [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(and(
          eq(usersTable.id, existing.id),
          eq(usersTable.authId, existing.authId),
          eq(usersTable.isActive, true),
          eq(usersTable.accessStatus, "approved"),
      ))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error) && updates.email) {
      logger.warn(
        { userId: existing.id },
        "Refusing to repair Supabase placeholder email after unique conflict",
      );
      const { email: _email, ...safeUpdates } = updates;
      if (
        Object.keys(safeUpdates).filter((key) => key !== "updatedAt").length === 0
      ) {
        return existing;
      }
      [updated] = await db
        .update(usersTable)
        .set(safeUpdates)
        .where(and(
          eq(usersTable.id, existing.id),
          eq(usersTable.authId, existing.authId),
          eq(usersTable.isActive, true),
          eq(usersTable.accessStatus, "approved"),
        ))
        .returning();
    } else {
      throw error;
    }
  }

  return isApproved(updated) ? updated : null;
}

function shouldFetchSupabaseProfile(authId: string): boolean {
  const nextAllowedAt = supabaseProfileRefreshCache.get(authId) ?? 0;
  return nextAllowedAt <= Date.now();
}

function markSupabaseProfileFetch(authId: string, ttlMs: number): void {
  if (supabaseProfileRefreshCache.size >= 10000) {
    const oldest = supabaseProfileRefreshCache.keys().next().value;
    if (oldest) supabaseProfileRefreshCache.delete(oldest);
  }
  supabaseProfileRefreshCache.set(
    authId,
    Date.now() + ttlMs,
  );
}

async function getFreshSupabaseProfile(
  authId: string,
  claims: Record<string, unknown> | undefined,
  accessToken: string,
): Promise<SupabaseUserProfile> {
  const existing = supabaseProfileInFlight.get(authId);
  if (existing) return existing;

  const request = (async () => {
    try {
      const apiProfile = await fetchSupabaseUserProfile(authId, accessToken);
      markSupabaseProfileFetch(
        authId,
        apiProfile ? SUPABASE_PROFILE_REFRESH_TTL_MS : SUPABASE_PROFILE_RETRY_TTL_MS,
      );
      return buildSupabaseUserProfile(authId, claims, apiProfile ?? {});
    } catch {
      markSupabaseProfileFetch(authId, SUPABASE_PROFILE_RETRY_TTL_MS);
      logger.warn({ authId }, "Unable to fetch Supabase user profile");
      return buildSupabaseUserProfile(authId, claims);
    }
  })().finally(() => {
    supabaseProfileInFlight.delete(authId);
  });

  supabaseProfileInFlight.set(authId, request);
  return request;
}

function isManualInviteUser(user: User): boolean {
  return isApproved(user) && user.authId.startsWith("manual_");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function emailEqualsNormalized(email: string) {
  return sql`lower(${usersTable.email}) = ${normalizeEmail(email)}`;
}

function isUniqueViolation(error: unknown): boolean {
  const visited = new Set<unknown>();
  while (error && typeof error === "object" && !visited.has(error)) {
    visited.add(error);
    if ("code" in error && error.code === "23505") return true;
    error = "cause" in error ? error.cause : undefined;
  }
  return false;
}

function allowPublicSignups(): boolean {
  return parseBooleanEnv(process.env.ALLOW_PUBLIC_SIGNUPS) === true;
}

async function syncLocalUser(
  authId: string,
  claims: Record<string, unknown> | undefined,
  accessToken: string,
): Promise<User | null> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.authId, authId));

  if (existing) {
    return existing;
  }

  const verifiedProfile = await getFreshSupabaseProfile(authId, claims, accessToken);
  if (!verifiedProfile.emailVerified || isPlaceholderEmail(verifiedProfile.email)) return null;

  const existingByEmail = await db
    .select()
    .from(usersTable)
    .where(emailEqualsNormalized(verifiedProfile.email));
  if (existingByEmail.length > 0) {
    const activeMatches = existingByEmail.filter((match) => match.isActive);
    const manualMatches = activeMatches.filter(isManualInviteUser);
    if (
      existingByEmail.length !== 1 ||
      activeMatches.length !== 1 ||
      manualMatches.length !== 1 ||
      isPlaceholderEmail(verifiedProfile.email) ||
      !verifiedProfile.emailVerified
    ) {
      logger.warn(
        {
          authId,
          matchCount: existingByEmail.length,
          activeMatchCount: activeMatches.length,
          manualMatchCount: manualMatches.length,
        },
        "Refusing to link or duplicate Supabase user by unsafe email match",
      );
      return null;
    } else {
      const [existingByEmail] = manualMatches;
      // Claim an invite only while its identity and active status are unchanged.
      let linked: User | undefined;
      try {
        [linked] = await db
          .update(usersTable)
          .set({
            authId,
            firstName: existingByEmail.firstName ?? verifiedProfile.firstName,
            lastName: existingByEmail.lastName ?? verifiedProfile.lastName,
            fullName: existingByEmail.fullName ?? verifiedProfile.fullName,
            updatedAt: new Date(),
          })
          .where(and(
            eq(usersTable.id, existingByEmail.id),
            eq(usersTable.authId, existingByEmail.authId),
            eq(usersTable.isActive, true),
            eq(usersTable.accessStatus, "approved"),
            emailEqualsNormalized(verifiedProfile.email),
          ))
          .returning();
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }

      if (!linked) {
        const [winner] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.authId, authId));
        return winner ?? null;
      }

      logger.info(
        { authId, userId: linked.id },
        "Linked Supabase user to existing manual local user by email",
      );
      return linked;
    }
  }

  if (!allowPublicSignups()) {
    logger.warn(
      { authId },
      "Refusing to JIT provision public signup without matching manual invite",
    );
    return null;
  }

  if (!verifiedProfile.emailVerified) {
    logger.warn(
      { authId },
      "Refusing to JIT provision user without verified primary email",
    );
    return null;
  }

  try {
    const [created] = await db
      .insert(usersTable)
      .values({
        authId,
        role: "client",
        accessStatus: "pending",
        email: verifiedProfile.email,
        firstName: verifiedProfile.firstName,
        lastName: verifiedProfile.lastName,
        fullName: verifiedProfile.fullName,
      })
      .returning();

    logger.info({ authId, userId: created.id }, "JIT provisioned new user");
    return created;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [raceWinner] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.authId, authId));

    if (raceWinner) {
      return raceWinner;
    }

    const [emailRaceWinner] = await db
      .select()
      .from(usersTable)
      .where(emailEqualsNormalized(verifiedProfile.email));
    if (emailRaceWinner) {
      logger.warn(
        { authId },
        "Refusing to JIT provision user after email uniqueness race",
      );
      return null;
    }

    throw error;
  }
}

/**
 * Get or create a local user record from the authenticated Supabase session.
 * Performs just-in-time (JIT) provisioning on first login.
 */
export async function resolveAccountUser(req: Request): Promise<User | null> {
  const cached = requestUsers.get(req);
  if (cached) return cached;
  const auth = getAuth(req);
  if (!auth?.userId) return null;

  const authId = auth.userId;
  const claims = auth.sessionClaims as Record<string, unknown> | undefined;
  const existing = localUserSyncInFlight.get(authId);
  if (existing) { requestUsers.set(req, existing); return existing; }

  const request = syncLocalUser(authId, claims, auth.accessToken).finally(() => {
    localUserSyncInFlight.delete(authId);
  });
  localUserSyncInFlight.set(authId, request);
  requestUsers.set(req, request);
  return request;
}

/** Approved-only resolver. Permission results are reused within a request, never across requests. */
export async function getOrCreateUser(req: Request): Promise<User | null> {
  const cached = requestApprovedUsers.get(req);
  if (cached) return cached;
  const request = (async () => {
    const existing = await resolveAccountUser(req);
    if (!isApproved(existing)) return null;
    if (!needsSupabaseProfileRepair(existing)) return existing;
    const auth = getAuth(req);
    if (!auth) return null;
    const claims = auth.sessionClaims as Record<string, unknown> | undefined;
    const updated = await refreshExistingUser(existing, buildSupabaseUserProfile(auth.userId, claims));
    if (!updated || !needsSupabaseProfileRepair(updated) || !shouldFetchSupabaseProfile(auth.userId)) return updated;
    return refreshExistingUser(updated, await getFreshSupabaseProfile(auth.userId, claims, auth.accessToken));
  })();
  requestApprovedUsers.set(req, request);
  return request;
}
