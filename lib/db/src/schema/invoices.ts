import { pgTable, text, uuid, timestamp, pgEnum, numeric, integer, boolean, json, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { leads } from "./crm";
import { quotes } from "./quotes";
import { contracts } from "./contracts";

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
]);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "set null" }),
    invoiceNumber: text("invoice_number").notNull(),
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
    language: text("language"),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    terms: text("terms"),
    dueDate: timestamp("due_date"),
    sentAt: timestamp("sent_at"),
    paidAt: timestamp("paid_at"),
    paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }),
    paymentMethod: text("payment_method"),
    paymentReference: text("payment_reference"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invoices_user_invoice_number_unique").on(t.userId, t.invoiceNumber)],
);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  order: integer("order").notNull().default(0),
});
