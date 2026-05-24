import { pgTable, text, uuid, timestamp, pgEnum, integer, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

export const aiConversations = pgTable("ai_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New Conversation"),
  providerName: text("provider_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const aiMessages = pgTable("ai_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => aiConversations.id, { onDelete: "cascade" }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  // RAG source citations — array of RAGSource objects
  sources: jsonb("sources").$type<Array<{
    id: string;
    type: "kb" | "academy" | "support" | "product" | "knowledge";
    title: string;
    url?: string;
    excerpt: string;
  }>>(),
  // Suggested follow-up actions
  suggestedActions: jsonb("suggested_actions").$type<Array<{
    type: string;
    label: string;
    data?: Record<string, unknown>;
  }>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const aiSuggestedQuestions = pgTable("ai_suggested_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  category: text("category").notNull().default("general"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
