import {
  boolean,
  pgTable,
  text,
  timestamp,
  pgEnum,
  integer,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "client",
  "coach",
  "sales_rep",
]);
export const languageEnum = pgEnum("language", [
  "en",
  "fr",
  "es",
  "de",
  "it",
  "pl",
  "pt",
  "nl",
]);

export const usersTable = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Preserve the physical legacy column during the provider cutover for rollback.
    authId: text("clerk_id").notNull().unique(),
    email: text("email").notNull(),

    // Core profile
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name"),
    companyName: text("company_name"),
    companyAddress: text("company_address"),
    phone: text("phone"),
    country: text("country"),
    city: text("city"),

    // Preferences
    role: userRoleEnum("role").notNull().default("client"),
    isActive: boolean("is_active").notNull().default(true),
    accessStatus: text("access_status", { enum: ["pending", "approved", "rejected"] })
      .notNull().default("approved"),
    language: languageEnum("language").notNull().default("en"),
    currency: text("currency").notNull().default("EUR"),

    // Optional profile
    birthday: text("birthday"),
    website: text("website"),
    instagram: text("instagram"),
    facebook: text("facebook"),
    pinterest: text("pinterest"),
    tiktok: text("tiktok"),
    linkedin: text("linkedin"),

    // Business info
    businessType: text("business_type"),
    mainMarket: text("main_market"),
    taxId: text("tax_id"),
    photobooths: integer("photobooths"),
    businessGoal: text("business_goal"),

    // Provider / contract signature
    providerSignature: text("provider_signature"),
    providerSignerTitle: text("provider_signer_title"),

    // Company logo (data URI or URL) — shown on quotes, contracts, invoices
    logoUrl: text("logo_url"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${t.email})`),
    check("users_access_status_check", sql`${t.accessStatus} IN ('pending', 'approved', 'rejected')`),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
