import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

function requireAdmin(
  user: typeof usersTable.$inferSelect | null | undefined,
  res: Response,
): user is typeof usersTable.$inferSelect {
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

const USER_ROLES = ["admin", "client", "coach", "sales_rep"] as const;
const LANGUAGES = ["en", "fr", "es", "de", "it", "pl", "pt", "nl"] as const;

function isUserRole(value: unknown): value is (typeof USER_ROLES)[number] {
  return typeof value === "string" && USER_ROLES.includes(value as never);
}

function isLanguage(value: unknown): value is (typeof LANGUAGES)[number] {
  return typeof value === "string" && LANGUAGES.includes(value as never);
}

function emailEqualsNormalized(email: string) {
  return sql`lower(${usersTable.email}) = ${email.trim().toLowerCase()}`;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505",
  );
}

type UserSelfUpdate = Partial<typeof usersTable.$inferInsert>;

const STRING_UPDATE_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "companyName",
  "phone",
  "currency",
  "country",
  "city",
  "birthday",
  "website",
  "instagram",
  "facebook",
  "pinterest",
  "tiktok",
  "linkedin",
  "businessType",
  "mainMarket",
  "businessGoal",
] as const;

const NULLABLE_STRING_UPDATE_FIELDS = [
  "companyAddress",
  "taxId",
  "providerSignature",
  "providerSignerTitle",
  "logoUrl",
] as const;

const REQUIRED_SELF_PROFILE_FIELDS = new Set<string>([
  "firstName",
  "lastName",
  "companyName",
  "phone",
  "currency",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assignStringUpdate(
  updates: UserSelfUpdate,
  body: Record<string, unknown>,
  field: (typeof STRING_UPDATE_FIELDS)[number],
): string | null {
  const value = body[field];
  if (value === undefined) return null;
  if (typeof value !== "string") return `${field} must be a string`;
  const trimmed = value.trim();
  if (REQUIRED_SELF_PROFILE_FIELDS.has(field) && !trimmed) {
    return `${field} is required`;
  }
  (updates as Record<string, unknown>)[field] = trimmed;
  return null;
}

function assignNullableStringUpdate(
  updates: UserSelfUpdate,
  body: Record<string, unknown>,
  field: (typeof NULLABLE_STRING_UPDATE_FIELDS)[number],
): string | null {
  const value = body[field];
  if (value === undefined) return null;
  if (value !== null && typeof value !== "string") {
    return `${field} must be a string or null`;
  }
  (updates as Record<string, unknown>)[field] =
    typeof value === "string" ? value.trim() || null : null;
  return null;
}

function parseUserSelfUpdate(body: unknown):
  | { ok: true; updates: UserSelfUpdate }
  | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be an object" };
  }

  const updates: UserSelfUpdate = {};

  for (const field of STRING_UPDATE_FIELDS) {
    const error = assignStringUpdate(updates, body, field);
    if (error) return { ok: false, error };
  }

  for (const field of NULLABLE_STRING_UPDATE_FIELDS) {
    const error = assignNullableStringUpdate(updates, body, field);
    if (error) return { ok: false, error };
  }

  if (body.language !== undefined) {
    if (!isLanguage(body.language)) {
      return { ok: false, error: "language must be one of en, fr, es, de, it, pl, pt, nl" };
    }
    updates.language = body.language;
  }

  const photobooths = body.photobooths;
  if (photobooths !== undefined) {
    if (
      photobooths !== null &&
      (typeof photobooths !== "number" ||
        !Number.isInteger(photobooths) ||
        photobooths < 0)
    ) {
      return { ok: false, error: "photobooths must be a non-negative integer or null" };
    }
    updates.photobooths = photobooths;
  }

  return { ok: true, updates };
}

// GET /users/me
router.get(
  "/users/me",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json(user);
  },
);

// PATCH /users/me
router.patch(
  "/users/me",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = parseUserSelfUpdate(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const updates = parsed.updates;
    if (Object.keys(updates).length === 0) {
      res.json(user);
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, user.id))
      .returning();

    res.json(updated);
  },
);

// GET /users (admin only)
router.get(
  "/users",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const currentUser = await getOrCreateUser(req);
    if (!requireAdmin(currentUser, res)) return;

    const role = req.query.role as string | undefined;
    const active = req.query.active as string | undefined;
    const q = (req.query.q as string | undefined)?.trim();
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const conditions = [];
    if (role && isUserRole(role)) {
      conditions.push(eq(usersTable.role, role));
    }
    if (active === "true" || active === "false") {
      conditions.push(eq(usersTable.isActive, active === "true"));
    }
    if (q) {
      const qPattern = `%${q}%`;
      const searchCondition = or(
        ilike(usersTable.email, qPattern),
        ilike(usersTable.fullName, qPattern),
        ilike(usersTable.companyName, qPattern),
      );
      if (searchCondition) conditions.push(searchCondition);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [items, [{ count }]] = await Promise.all([
      whereClause
        ? db
            .select()
            .from(usersTable)
            .where(whereClause)
            .orderBy(usersTable.createdAt)
            .limit(limit)
            .offset(offset)
        : db
            .select()
            .from(usersTable)
            .orderBy(usersTable.createdAt)
            .limit(limit)
            .offset(offset),
      whereClause
        ? db
            .select({ count: sql<number>`count(*)` })
            .from(usersTable)
            .where(whereClause)
        : db.select({ count: sql<number>`count(*)` }).from(usersTable),
    ]);

    res.json({ items, total: Number(count) });
  },
);

// POST /users (admin only)
router.post(
  "/users",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const currentUser = await getOrCreateUser(req);
    if (!requireAdmin(currentUser, res)) return;

    const {
      email,
      fullName,
      firstName,
      lastName,
      companyName,
      phone,
      role,
      isActive,
      language,
      currency,
    } = req.body as {
      email?: string;
      fullName?: string;
      firstName?: string;
      lastName?: string;
      companyName?: string;
      phone?: string;
      role?: string;
      isActive?: boolean;
      language?: string;
      currency?: string;
    };

    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !fullName?.trim() || !isUserRole(role)) {
      res.status(400).json({ error: "email, fullName, and role are required" });
      return;
    }

    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(emailEqualsNormalized(normalizedEmail));
    if (existing) {
      res.status(400).json({ error: "A user with this email already exists" });
      return;
    }

    let created: typeof usersTable.$inferSelect;
    try {
      [created] = await db
        .insert(usersTable)
        .values({
          clerkId: `manual_${randomUUID()}`,
          email: normalizedEmail,
          fullName: fullName.trim(),
          firstName: firstName?.trim() || null,
          lastName: lastName?.trim() || null,
          companyName: companyName?.trim() || null,
          phone: phone?.trim() || null,
          role,
          isActive: isActive ?? true,
          language: isLanguage(language) ? language : "en",
          currency: currency?.trim() || "EUR",
        })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        res
          .status(400)
          .json({ error: "A user with this email already exists" });
        return;
      }
      throw error;
    }

    res.status(201).json(created);
  },
);

// GET /users/:id (admin only)
router.get(
  "/users/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const currentUser = await getOrCreateUser(req);
    if (!requireAdmin(currentUser, res)) return;

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  },
);

// PATCH /users/:id (admin only)
router.patch(
  "/users/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const currentUser = await getOrCreateUser(req);
    if (!requireAdmin(currentUser, res)) return;

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [target] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const {
      email,
      fullName,
      firstName,
      lastName,
      companyName,
      phone,
      role,
      isActive,
      language,
      currency,
    } = req.body as Record<string, unknown>;

    if (id === currentUser.id && isActive === false) {
      res.status(400).json({ error: "You cannot deactivate your own account" });
      return;
    }
    if (id === currentUser.id && role !== undefined && role !== "admin") {
      res.status(400).json({ error: "You cannot remove your own admin role" });
      return;
    }

    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (typeof email === "string") updates.email = email.trim().toLowerCase();
    if (typeof fullName === "string")
      updates.fullName = fullName.trim() || null;
    if (typeof firstName === "string")
      updates.firstName = firstName.trim() || null;
    if (typeof lastName === "string")
      updates.lastName = lastName.trim() || null;
    if (typeof companyName === "string")
      updates.companyName = companyName.trim() || null;
    if (typeof phone === "string") updates.phone = phone.trim() || null;
    if (role !== undefined) {
      if (!isUserRole(role)) {
        res.status(400).json({ error: "Invalid role" });
        return;
      }
      updates.role = role;
    }
    if (typeof isActive === "boolean") updates.isActive = isActive;
    if (language !== undefined) {
      if (!isLanguage(language)) {
        res.status(400).json({ error: "Invalid language" });
        return;
      }
      updates.language = language;
    }
    if (typeof currency === "string")
      updates.currency = currency.trim() || "EUR";

    if (updates.email && updates.email !== target.email) {
      const [existingWithEmail] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(emailEqualsNormalized(updates.email));
      if (existingWithEmail && existingWithEmail.id !== id) {
        res
          .status(400)
          .json({ error: "A user with this email already exists" });
        return;
      }
    }

    let updated: typeof usersTable.$inferSelect;
    try {
      [updated] = await db
        .update(usersTable)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(usersTable.id, id))
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        res
          .status(400)
          .json({ error: "A user with this email already exists" });
        return;
      }
      throw error;
    }

    res.json(updated);
  },
);

export default router;
