import { pgTable, text, uuid, timestamp, pgEnum, numeric, integer, boolean, json, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { leads } from "./crm";

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
]);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    quoteNumber: text("quote_number").notNull(),
    title: text("title").notNull(),
    clientName: text("client_name").notNull(),
    clientEmail: text("client_email"),
    clientPhone: text("client_phone"),
    clientCompany: text("client_company"),
    clientAddress: text("client_address"),
    eventType: text("event_type"),
    eventDate: timestamp("event_date"),
    eventLocation: text("event_location"),
    eventStartTime: text("event_start_time"),
    eventEndTime: text("event_end_time"),
    packageName: text("package_name"),
    rentalDuration: text("rental_duration"),
    includedPrints: text("included_prints"),
    digitalGallery: boolean("digital_gallery").notNull().default(false),
    customTemplate: boolean("custom_template").notNull().default(false),
    deliveryIncluded: boolean("delivery_included").notNull().default(false),
    setupIncluded: boolean("setup_included").notNull().default(false),
    operatorIncluded: boolean("operator_included").notNull().default(false),
    equipmentIds: json("equipment_ids").$type<string[]>(),
    equipmentDescription: text("equipment_description"),
    optionsList: text("options_list"),
    rentalPrice: numeric("rental_price", { precision: 12, scale: 2 }),
    optionsPrice: numeric("options_price", { precision: 12, scale: 2 }),
    deliveryFees: numeric("delivery_fees", { precision: 12, scale: 2 }),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }),
    currency: text("currency"),
    paymentMethod: text("payment_method"),
    language: text("language"),
    status: quoteStatusEnum("status").notNull().default("draft"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    terms: text("terms"),
    validUntil: timestamp("valid_until"),
    sentAt: timestamp("sent_at"),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("quotes_user_quote_number_unique").on(t.userId, t.quoteNumber)],
);

export const quoteItems = pgTable("quote_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  order: integer("order").notNull().default(0),
});
