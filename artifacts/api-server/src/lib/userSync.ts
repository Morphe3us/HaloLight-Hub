import { getAuth } from "@clerk/express";
import { type Request } from "express";
import { db, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import {
  buildClerkUserProfile,
  fetchClerkUserProfile,
  isPlaceholderEmail,
  isPlaceholderProfileName,
  needsClerkProfileRepair,
  type ClerkUserProfile,
} from "./clerkProfile";
import { isExplicitDevelopment, parseBooleanEnv } from "./env";

type User = typeof usersTable.$inferSelect;
const CLERK_PROFILE_REFRESH_TTL_MS = 5 * 60 * 1000;
const CLERK_PROFILE_RETRY_TTL_MS = 15 * 1000;
const clerkProfileRefreshCache = new Map<string, number>();
const clerkProfileInFlight = new Map<string, Promise<ClerkUserProfile>>();
const localUserSyncInFlight = new Map<string, Promise<User | null>>();

function valueOrExisting<T extends string | null>(
  existingValue: T,
  profileValue: string | null,
): T | string | null {
  return existingValue?.trim() ? existingValue : profileValue;
}

function profileUpdateForExisting(
  existing: User,
  profile: ClerkUserProfile,
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
  profile: ClerkUserProfile,
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
        "Refusing to repair Clerk placeholder email because another user already owns it",
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
          eq(usersTable.clerkId, existing.clerkId),
          eq(usersTable.isActive, true),
      ))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error) && updates.email) {
      logger.warn(
        { userId: existing.id },
        "Refusing to repair Clerk placeholder email after unique conflict",
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
          eq(usersTable.clerkId, existing.clerkId),
          eq(usersTable.isActive, true),
        ))
        .returning();
    } else {
      throw error;
    }
  }

  return updated?.isActive ? updated : null;
}

function shouldFetchClerkProfile(clerkId: string): boolean {
  const nextAllowedAt = clerkProfileRefreshCache.get(clerkId) ?? 0;
  return nextAllowedAt <= Date.now();
}

function markClerkProfileFetch(clerkId: string, ttlMs: number): void {
  clerkProfileRefreshCache.set(
    clerkId,
    Date.now() + ttlMs,
  );
}

async function getFreshClerkProfile(
  clerkId: string,
  claims: Record<string, unknown> | undefined,
): Promise<ClerkUserProfile> {
  const existing = clerkProfileInFlight.get(clerkId);
  if (existing) return existing;

  const request = (async () => {
    try {
      const apiProfile = await fetchClerkUserProfile(clerkId);
      markClerkProfileFetch(
        clerkId,
        apiProfile ? CLERK_PROFILE_REFRESH_TTL_MS : CLERK_PROFILE_RETRY_TTL_MS,
      );
      return buildClerkUserProfile(clerkId, claims, apiProfile ?? {});
    } catch {
      markClerkProfileFetch(clerkId, CLERK_PROFILE_RETRY_TTL_MS);
      logger.warn({ clerkId }, "Unable to fetch Clerk user profile");
      return buildClerkUserProfile(clerkId, claims);
    }
  })().finally(() => {
    clerkProfileInFlight.delete(clerkId);
  });

  clerkProfileInFlight.set(clerkId, request);
  return request;
}

function isManualInviteUser(user: User): boolean {
  return user.clerkId.startsWith("manual_");
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
  const configured = parseBooleanEnv(process.env.ALLOW_PUBLIC_SIGNUPS);
  if (configured !== null) return configured;
  return isExplicitDevelopment();
}

async function syncLocalUser(
  clerkId: string,
  claims: Record<string, unknown> | undefined,
  sessionProfile: ClerkUserProfile,
): Promise<User | null> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));

  if (existing) {
    if (!existing.isActive) return null;
    if (!needsClerkProfileRepair(existing)) {
      return existing;
    }

    const updatedFromSession = await refreshExistingUser(
      existing,
      sessionProfile,
    );
    if (!updatedFromSession) return null;
    if (!needsClerkProfileRepair(updatedFromSession)) {
      return updatedFromSession;
    }
    if (!shouldFetchClerkProfile(clerkId)) return updatedFromSession;

    const freshProfile = await getFreshClerkProfile(clerkId, claims);
    const refreshed = await refreshExistingUser(
      updatedFromSession,
      freshProfile,
    );
    return refreshed;
  }

  const verifiedProfile =
    needsClerkProfileRepair(sessionProfile) || !sessionProfile.emailVerified
      ? await getFreshClerkProfile(clerkId, claims)
      : sessionProfile;

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
          clerkId,
          matchCount: existingByEmail.length,
          activeMatchCount: activeMatches.length,
          manualMatchCount: manualMatches.length,
        },
        "Refusing to link or duplicate Clerk user by unsafe email match",
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
            clerkId,
            firstName: existingByEmail.firstName ?? verifiedProfile.firstName,
            lastName: existingByEmail.lastName ?? verifiedProfile.lastName,
            fullName: existingByEmail.fullName ?? verifiedProfile.fullName,
            updatedAt: new Date(),
          })
          .where(and(
            eq(usersTable.id, existingByEmail.id),
            eq(usersTable.clerkId, existingByEmail.clerkId),
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
          .where(eq(usersTable.clerkId, clerkId));
        return winner?.isActive ? winner : null;
      }

      logger.info(
        { clerkId, userId: linked.id },
        "Linked Clerk user to existing manual local user by email",
      );
      return linked;
    }
  }

  if (!allowPublicSignups()) {
    logger.warn(
      { clerkId },
      "Refusing to JIT provision public signup without matching manual invite",
    );
    return null;
  }

  if (!verifiedProfile.emailVerified) {
    logger.warn(
      { clerkId },
      "Refusing to JIT provision user without verified primary email",
    );
    return null;
  }

  try {
    const [created] = await db
      .insert(usersTable)
      .values({
        clerkId,
        email: verifiedProfile.email,
        firstName: verifiedProfile.firstName,
        lastName: verifiedProfile.lastName,
        fullName: verifiedProfile.fullName,
      })
      .returning();

    logger.info({ clerkId, userId: created.id }, "JIT provisioned new user");
    return created;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [raceWinner] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkId));

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
        { clerkId },
        "Refusing to JIT provision user after email uniqueness race",
      );
      return null;
    }

    throw error;
  }
}

/**
 * Get or create a local user record from the authenticated Clerk session.
 * Performs just-in-time (JIT) provisioning on first login.
 */
export async function getOrCreateUser(req: Request) {
  const auth = getAuth(req);
  if (!auth?.userId) return null;

  const clerkId = auth.userId;
  const claims = auth.sessionClaims as Record<string, unknown> | undefined;
  const sessionProfile = buildClerkUserProfile(clerkId, claims);
  const existing = localUserSyncInFlight.get(clerkId);
  if (existing) return existing;

  const request = syncLocalUser(clerkId, claims, sessionProfile).finally(() => {
    localUserSyncInFlight.delete(clerkId);
  });
  localUserSyncInFlight.set(clerkId, request);
  return request;
}
