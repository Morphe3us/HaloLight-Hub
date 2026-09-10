import { and, asc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { db, supportTickets, supportTicketMailOutbox as outbox, supportTicketMailHistory as history, usersTable } from "@workspace/db";
import { buildTicketMail, type TicketMailPayload } from "./ticketMessage";
import { sendTicketMail, ticketMailConfig } from "./resend";

type Ticket = typeof supportTickets.$inferSelect;
type User = Pick<typeof usersTable.$inferSelect, "fullName" | "firstName" | "lastName" | "companyName" | "email" | "phone">;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const LEASE_MS = 120_000;
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export async function enqueueTicketMail(tx: Pick<Transaction, "insert">, ticket: Ticket, user: User) {
  const payload: TicketMailPayload = { snapshot: {
    ticketId: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title, description: ticket.description,
    priority: ticket.priority, category: ticket.category, equipmentModel: ticket.equipmentModel ?? null, serialNumber: ticket.serialNumber ?? null,
    name: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
    company: user.companyName, email: user.email, phone: user.phone,
    attachments: (ticket.attachments ?? []).map(({ key: _key, ...file }) => file),
  } };
  const status = ticketMailConfig() ? "pending" : "disabled";
  const [record] = await tx.insert(outbox).values({ ticketId: ticket.id, payload, status })
    .onConflictDoNothing({ target: outbox.ticketId }).returning();
  if (record) await tx.insert(history).values({ ticketId: ticket.id, outboxId: record.id, status, attempt: 0,
    detail: status === "disabled" ? "mail_not_configured" : null });
}

export function canClaimMail(record: { status: string; attempts: number; claimedAt: Date | null; updatedAt: Date }, now: Date) {
  if (record.status === "sent" || record.attempts >= 5) return false;
  if (record.claimedAt && now.getTime() - record.claimedAt.getTime() >= RETRY_WINDOW_MS) return false;
  if (record.attempts && now.getTime() - record.updatedAt.getTime() < LEASE_MS) return false;
  return ["pending", "disabled", "sending", "failed", "unknown"].includes(record.status);
}

export async function dispatchTicketMail(ticketId: string) {
  const config = ticketMailConfig();
  if (!config) return;
  const claimed = await db.transaction(async tx => {
    const [record] = await tx.select().from(outbox).where(eq(outbox.ticketId, ticketId)).for("update");
    const now = new Date();
    if (!record) return null;
    if (!canClaimMail(record, now)) {
      if (record.status === "sending" && now.getTime() - record.updatedAt.getTime() >= LEASE_MS) {
        await tx.update(outbox).set({ status: "unknown", lastError: "delivery_requires_verification", updatedAt: now }).where(eq(outbox.id, record.id));
        await tx.insert(history).values({ ticketId, outboxId: record.id, status: "unknown", attempt: record.attempts, detail: "delivery_requires_verification" });
      }
      return null;
    }
    const payload = record.payload as TicketMailPayload;
    try {
      // Freeze the entire provider request for identical idempotent replays.
      payload.request ??= buildTicketMail(payload.snapshot, config.from, config.origin);
    } catch {
      if (record.lastError !== "invalid_mail_configuration") {
        await tx.update(outbox).set({ status: "disabled", lastError: "invalid_mail_configuration", updatedAt: now }).where(eq(outbox.id, record.id));
        await tx.insert(history).values({ ticketId, outboxId: record.id, status: "disabled", attempt: record.attempts, detail: "invalid_mail_configuration" });
      }
      return null;
    }
    const [updated] = await tx.update(outbox).set({ payload, status: "sending", attempts: record.attempts + 1,
      claimedAt: record.claimedAt ?? now, updatedAt: now, lastError: null }).where(eq(outbox.id, record.id)).returning();
    await tx.insert(history).values({ ticketId, outboxId: record.id, status: "sending", attempt: updated!.attempts });
    return { ...updated!, request: payload.request };
  });
  if (!claimed) return;
  const result = await sendTicketMail(claimed.request, `support-ticket-created/${claimed.id}`, config.apiKey);
  await db.transaction(async tx => {
    const [updated] = await tx.update(outbox).set({ status: result.status, updatedAt: new Date(),
      ...(result.status === "sent" ? { sentAt: new Date(), providerMessageId: result.providerMessageId, lastError: null } : { lastError: result.code }),
    }).where(and(eq(outbox.id, claimed.id), eq(outbox.status, "sending"), eq(outbox.attempts, claimed.attempts))).returning();
    if (updated) await tx.insert(history).values({ ticketId, outboxId: claimed.id, status: result.status, attempt: claimed.attempts,
      detail: result.status === "sent" ? "provider_accepted" : result.code });
  });
}

export async function ticketMailHistory(ticketId: string) {
  const [record] = await db.select({ status: outbox.status, attempts: outbox.attempts, sentAt: outbox.sentAt }).from(outbox).where(eq(outbox.ticketId, ticketId));
  const deliveryHistory = await db.select({ id: history.id, status: history.status, attempt: history.attempt, detail: history.detail, createdAt: history.createdAt })
    .from(history).where(eq(history.ticketId, ticketId)).orderBy(asc(history.createdAt), asc(history.id)).limit(30);
  return { emailDelivery: record ?? null, deliveryHistory };
}

let worker: ReturnType<typeof setInterval> | undefined;
let running = false;
export async function runTicketMailWorker() {
  if (running || !ticketMailConfig()) return;
  running = true;
  try {
    const rows = await db.select({ ticketId: outbox.ticketId }).from(outbox)
      .where(and(lt(outbox.updatedAt, new Date(Date.now() - LEASE_MS)),
        or(eq(outbox.status, "sending"), and(inArray(outbox.status, ["pending", "disabled", "failed", "unknown"]), lt(outbox.attempts, 5),
          or(isNull(outbox.claimedAt), gt(outbox.claimedAt, new Date(Date.now() - RETRY_WINDOW_MS)))))))
      .orderBy(asc(outbox.updatedAt)).limit(10);
    for (const row of rows) await dispatchTicketMail(row.ticketId);
  } finally { running = false; }
}

export function startTicketMailWorker() {
  if (worker) return;
  worker = setInterval(() => { void runTicketMailWorker().catch(() => undefined); }, 60_000);
  worker.unref();
}
export function stopTicketMailWorker() {
  if (worker) clearInterval(worker);
  worker = undefined;
}
