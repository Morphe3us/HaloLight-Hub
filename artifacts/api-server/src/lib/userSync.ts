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
  if (!existing.isActive) return null;

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
        ))
        .returning();
    } else {
      throw error;
    }
  }

  return updated?.isActive ? updated : null;
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
  return user.authId.startsWith("manual_");
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
  sessionProfile: SupabaseUserProfile,
  accessToken: string,
): Promise<User | null> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.authId, authId));

  if (existing) {
    if (!existing.isActive) return null;
    if (!needsSupabaseProfileRepair(existing)) {
      return existing;
    }

    const updatedFromSession = await refreshExistingUser(
      existing,
      sessionProfile,
    );
    if (!updatedFromSession) return null;
    if (!needsSupabaseProfileRepair(updatedFromSession)) {
      return updatedFromSession;
    }
    if (!shouldFetchSupabaseProfile(authId)) return updatedFromSession;

    const freshProfile = await getFreshSupabaseProfile(authId, claims, accessToken);
    const refreshed = await refreshExistingUser(
      updatedFromSession,
      freshProfile,
    );
    return refreshed;
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
        return winner?.isActive ? winner : null;
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
      const refreshed = await refreshExistingUser(raceWinner, verifiedProfile);
      return refreshed;
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
export async function getOrCreateUser(req: Request) {
  const auth = getAuth(req);
  if (!auth?.userId) return null;

  const authId = auth.userId;
  const claims = auth.sessionClaims as Record<string, unknown> | undefined;
  const sessionProfile = buildSupabaseUserProfile(authId, claims);
  const existing = localUserSyncInFlight.get(authId);
  if (existing) return existing;

  const request = syncLocalUser(authId, claims, sessionProfile, auth.accessToken).finally(() => {
    localUserSyncInFlight.delete(authId);
  });
  localUserSyncInFlight.set(authId, request);
  return request;
}
