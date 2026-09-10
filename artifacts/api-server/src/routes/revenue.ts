import { Router, type IRouter, type Request, type Response } from "express";
import { sql, eq, inArray } from "drizzle-orm";
import { db, usersTable, invoices, quotes, customerSuccessScores } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { summarizeInvoiceRevenue, roundMoney } from "../lib/revenueCalculations";

const router: IRouter = Router();
const CURRENCY_CODES = new Set(Intl.supportedValuesOf("currency"));

export function revenueCurrency(value: unknown): string | null {
  return typeof value === "string" && CURRENCY_CODES.has(value.trim().toUpperCase())
    ? value.trim().toUpperCase() : null;
}

export function revenueMonths(now: Date) {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1));
    const month = date.toISOString().slice(0, 7);
    return { month, label: month, revenue: 0, invoiceCount: 0 };
  });
}

// Numeric(12,2) invoice values become integer cents before aggregation.
export function invoiceCents(value: string): number {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error("Invalid stored monetary amount");
  const result = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Monetary amount exceeds safe precision");
  return match[1] ? -result : result;
}
function addCents(a: number, b: number): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new Error("Revenue exceeds safe precision");
  return result;
}

router.get("/admin/revenue", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const currency = req.query.currency === undefined ? revenueCurrency(user.currency) ?? "EUR" : revenueCurrency(req.query.currency);
  if (!currency) { res.status(400).json({ error: "currency must be a supported currency code" }); return; }
  res.setHeader("Cache-Control", "private, no-store");
  const invoiceCurrency = sql<string>`upper(trim(${invoices.currency}))`;
  const quoteCurrency = sql<string>`upper(trim(${quotes.currency}))`;
  const allInvoices = await db.select({
    userId: invoices.userId, total: invoices.total, status: invoices.status, dueDate: invoices.dueDate,
    paidAt: invoices.paidAt,
    paidMonth: sql<string | null>`to_char(${invoices.paidAt}, 'YYYY-MM')`,
  }).from(invoices).where(eq(invoiceCurrency, currency));
  const allQuotes = await db.select({ status: quotes.status, total: quotes.total })
    .from(quotes).where(eq(quoteCurrency, currency));
  const invoiceCurrencies = await db.select({ currency: invoiceCurrency, invoiceCount: sql<number>`count(*)::int` })
    .from(invoices).groupBy(invoiceCurrency);
  const quoteCurrencies = await db.selectDistinct({ currency: quoteCurrency }).from(quotes);
  const availableCurrencies = [...new Set([currency, ...invoiceCurrencies.map((row) => revenueCurrency(row.currency)),
    ...quoteCurrencies.map((row) => revenueCurrency(row.currency))].filter((value): value is string => !!value))].sort();
  const excludedCurrencyInvoices = invoiceCurrencies.reduce((total, row) =>
    total + (revenueCurrency(row.currency) ? 0 : Number(row.invoiceCount)), 0);

  const now = new Date();
  const overview = summarizeInvoiceRevenue(allInvoices, now);
  const monthly = revenueMonths(now);
  const monthlyCents = new Map(monthly.map((month) => [month.month, 0]));
  const paidInvoices = allInvoices.filter((invoice) => invoice.status === "paid");
  const clientTotals = new Map<string, { cents: number; count: number; lastInvoice: Date | null }>();
  const segments = [
    { label: `< 1,000 ${currency}`, cents: 0, count: 0 },
    { label: `1,000 - 2,999.99 ${currency}`, cents: 0, count: 0 },
    { label: `3,000 - 5,999.99 ${currency}`, cents: 0, count: 0 },
    { label: `6,000+ ${currency}`, cents: 0, count: 0 },
  ];
  let paidCents = 0;
  for (const invoice of paidInvoices) {
    const cents = invoiceCents(invoice.total);
    paidCents = addCents(paidCents, cents);
    if (invoice.paidMonth && monthlyCents.has(invoice.paidMonth)) {
      monthlyCents.set(invoice.paidMonth, addCents(monthlyCents.get(invoice.paidMonth)!, cents));
      monthly.find((month) => month.month === invoice.paidMonth)!.invoiceCount++;
    }
    const total = clientTotals.get(invoice.userId) ?? { cents: 0, count: 0, lastInvoice: null };
    total.cents = addCents(total.cents, cents); total.count++;
    if (invoice.paidAt && (!total.lastInvoice || invoice.paidAt > total.lastInvoice)) total.lastInvoice = invoice.paidAt;
    clientTotals.set(invoice.userId, total);
    const segment = segments[cents < 100_000 ? 0 : cents < 300_000 ? 1 : cents < 600_000 ? 2 : 3]!;
    segment.cents = addCents(segment.cents, cents); segment.count++;
  }
  for (const month of monthly) month.revenue = monthlyCents.get(month.month)! / 100;
  const previousRevenue = monthly.at(-2)!.revenue;
  const revenueGrowth = previousRevenue > 0 ? roundMoney((monthly.at(-1)!.revenue - previousRevenue) / previousRevenue * 100) : null;

  const funnel = {
    draft: { count: 0, value: 0 }, sent: { count: 0, value: 0 }, accepted: { count: 0, value: 0 },
    declined: { count: 0, value: 0 }, expired: { count: 0, value: 0 },
  };
  for (const quote of allQuotes) {
    const group = funnel[quote.status];
    group.count++; group.value = addCents(group.value, invoiceCents(quote.total));
  }
  for (const group of Object.values(funnel)) group.value /= 100;
  const issuedQuotes = allQuotes.length - funnel.draft.count;
  const quoteAcceptanceRate = issuedQuotes ? roundMoney(funnel.accepted.count / issuedQuotes * 100) : null;

  const userIds = [...clientTotals.keys()];
  const clients = userIds.length ? await db.select({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, companyName: usersTable.companyName })
    .from(usersTable).where(inArray(usersTable.id, userIds)) : [];
  const scores = userIds.length ? await db.select({ userId: customerSuccessScores.userId, score: customerSuccessScores.score, tier: customerSuccessScores.tier })
    .from(customerSuccessScores).where(inArray(customerSuccessScores.userId, userIds)) : [];
  const clientMap = new Map(clients.map((client) => [client.id, client]));
  const scoreMap = new Map(scores.map((score) => [score.userId, score]));
  const tierTotals = new Map<string, { cents: number; clientCount: number }>();
  for (const [id, total] of clientTotals) {
    const tier = scoreMap.get(id)?.tier;
    if (!tier) continue;
    const group = tierTotals.get(tier) ?? { cents: 0, clientCount: 0 };
    group.cents = addCents(group.cents, total.cents); group.clientCount++;
    tierTotals.set(tier, group);
  }
  const leaderboard = [...clientTotals].sort(([aId, a], [bId, b]) => b.cents - a.cents || aId.localeCompare(bId)).slice(0, 20).map(([userId, total]) => {
    const client = clientMap.get(userId); const score = scoreMap.get(userId);
    return { userId, name: client?.fullName ?? client?.email ?? userId, email: client?.email ?? "", company: client?.companyName ?? "",
      totalRevenue: total.cents / 100, invoiceCount: total.count, avgBooking: roundMoney(total.cents / total.count / 100),
      lastInvoice: total.lastInvoice?.toISOString() ?? null, score: score?.score ?? null, tier: score?.tier ?? null };
  });
  res.json({
    currency, availableCurrencies, excludedCurrencyInvoices,
    undatedPaidInvoices: paidInvoices.filter((invoice) => !invoice.paidMonth).length,
    overview: { ...overview, totalRevenue: paidCents / 100, avgBookingValue: paidInvoices.length ? roundMoney(paidCents / paidInvoices.length / 100) : 0,
      quoteAcceptanceRate, revenueGrowth, totalInvoices: allInvoices.length },
    monthly, clientLeaderboard: leaderboard, topPerformers: leaderboard.slice(0, 5),
    revenueByTier: [...tierTotals].map(([tier, group]) => ({ tier, revenue: group.cents / 100, clientCount: group.clientCount })),
    revenueBySegment: segments.map(({ label, cents, count }) => ({ label, revenue: cents / 100, count })),
    quoteFunnel: { ...funnel, totalQuotes: allQuotes.length, issuedQuotes, acceptanceRate: quoteAcceptanceRate, conversionValue: funnel.accepted.value },
  });
});

export default router;
