import { pgTable, text, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["admin", "client", "coach", "sales_rep"]);
export const languageEnum = pgEnum("language", ["en", "fr", "es", "de", "it", "pl", "pt", "nl"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),

  // Core profile
  firstName: text("first_name"),
  lastName: text("last_name"),
  fullName: text("full_name"),
  companyName: text("company_name"),
  phone: text("phone"),
  country: text("country"),
  city: text("city"),

  // Preferences
  role: userRoleEnum("role").notNull().default("client"),
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
  photobooths: integer("photobooths"),
  businessGoal: text("business_goal"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
