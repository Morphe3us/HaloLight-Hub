import { db, usersTable, invoices, invoiceItems, quotes, quoteItems } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// Spread demo revenue across 12 months so charts look interesting
const MONTHLY_REVENUE_DATA = [
  { monthsAgo: 11, amounts: [1800, 2400] },
  { monthsAgo: 10, amounts: [2200, 1600] },
  { monthsAgo: 9, amounts: [3100] },
  { monthsAgo: 8, amounts: [2800, 3500] },
  { monthsAgo: 7, amounts: [1900, 2700, 4200] },
  { monthsAgo: 6, amounts: [3800, 2100] },
  { monthsAgo: 5, amounts: [4500, 3200] },
  { monthsAgo: 4, amounts: [2900, 5100] },
  { monthsAgo: 3, amounts: [3600, 4800, 2200] },
  { monthsAgo: 2, amounts: [5200, 3900] },
  { monthsAgo: 1, amounts: [4100, 6800, 3400] },
  { monthsAgo: 0, amounts: [5500, 4200] },
];

const QUOTE_DATA = [
  { monthsAgo: 10, status: "accepted" as const, amount: 2400 },
  { monthsAgo: 9, status: "declined" as const, amount: 1800 },
  { monthsAgo: 8, status: "accepted" as const, amount: 3500 },
  { monthsAgo: 7, status: "expired" as const, amount: 2200 },
  { monthsAgo: 6, status: "accepted" as const, amount: 4200 },
  { monthsAgo: 5, status: "accepted" as const, amount: 3800 },
  { monthsAgo: 4, status: "sent" as const, amount: 5100 },
  { monthsAgo: 3, status: "accepted" as const, amount: 4800 },
  { monthsAgo: 2, status: "declined" as const, amount: 2900 },
  { monthsAgo: 1, status: "accepted" as const, amount: 6800 },
];

export async function seedRevenueData() {
  console.log("\nSeeding Revenue Intelligence demo data...");

  // Get all client users
  const clients = await db.select({ id: usersTable.id, email: usersTable.email, fullName: usersTable.fullName, companyName: usersTable.companyName })
    .from(usersTable)
    .where(eq(usersTable.role, "client"));

  if (clients.length === 0) {
    console.log("  - No clients found, skipping revenue seed");
    return;
  }

  // Check if revenue invoices already seeded (by checking marker invoice)
  const existing = await db.select({ id: invoices.id }).from(invoices)
    .where(and(eq(invoices.title, "Revenue Intelligence Demo Invoice — Month 1"), eq(invoices.userId, clients[0]!.id)));
  if (existing.length > 0) {
    console.log("  - Skipped: revenue demo invoices already seeded");
    return;
  }

  let invoiceSeq = 100;

  // Distribute monthly invoice data across clients
  for (const monthData of MONTHLY_REVENUE_DATA) {
    const { monthsAgo, amounts } = monthData;
    const invoiceDate = new Date();
    invoiceDate.setMonth(invoiceDate.getMonth() - monthsAgo);
    invoiceDate.setDate(Math.floor(Math.random() * 20) + 1);

    for (let i = 0; i < amounts.length; i++) {
      const amount = amounts[i]!;
      const clientIdx = (invoiceSeq + i) % clients.length;
      const client = clients[clientIdx]!;
      const taxAmt = Math.round(amount * 0.085);
      const total = amount + taxAmt;

      const invNum = `INV-REV-${String(invoiceSeq).padStart(4, "0")}`;
      invoiceSeq++;

      const [inv] = await db.insert(invoices).values({
        userId: client.id,
        invoiceNumber: invNum,
        title: `Revenue Intelligence Demo Invoice — Month ${13 - monthsAgo}`,
        clientName: client.fullName ?? client.email,
        clientEmail: client.email,
        subtotal: String(amount),
        taxRate: "8.5",
        taxAmount: String(taxAmt),
        total: String(total),
        status: "paid",
        dueDate: invoiceDate,
        paidAmount: String(total),
        paymentMethod: ["credit_card", "bank_transfer", "stripe"][invoiceSeq % 3] ?? "credit_card",
        createdAt: invoiceDate,
      }).returning({ id: invoices.id });

      if (inv) {
        await db.insert(invoiceItems).values({
          invoiceId: inv.id,
          description: ["Photobooth rental (4 hours)", "Premium booth package", "Open air booth (6 hours)", "LED booth + print station"][invoiceSeq % 4] ?? "Photobooth rental",
          quantity: "1",
          unitPrice: String(amount),
          total: String(amount),
        });
      }
    }
  }

  // Add varied quote data for funnel
  let quoteSeq = 200;
  for (const qData of QUOTE_DATA) {
    const { monthsAgo, status, amount } = qData;
    const quoteDate = new Date();
    quoteDate.setMonth(quoteDate.getMonth() - monthsAgo);
    quoteDate.setDate(10);

    const clientIdx = quoteSeq % clients.length;
    const client = clients[clientIdx]!;
    const taxAmt = Math.round(amount * 0.085);
    const total = amount + taxAmt;

    const qNum = `Q-REV-${String(quoteSeq).padStart(4, "0")}`;
    quoteSeq++;

    const [q] = await db.insert(quotes).values({
      userId: client.id,
      quoteNumber: qNum,
      title: ["Open Air Booth Package", "Enclosed Booth Premium", "LED Ring Light Special", "Full Day Package", "Corporate Event Bundle"][quoteSeq % 5] ?? "Photobooth Quote",
      clientName: client.fullName ?? client.email,
      clientEmail: client.email,
      subtotal: String(amount),
      taxRate: "8.5",
      taxAmount: String(taxAmt),
      total: String(total),
      status,
      validUntil: new Date(Date.now() + (status === "expired" ? -7 : 30) * 24 * 60 * 60 * 1000),
      acceptedAt: status === "accepted" ? quoteDate : null,
      createdAt: quoteDate,
    }).returning({ id: quotes.id });

    if (q) {
      await db.insert(quoteItems).values({
        quoteId: q.id,
        description: "Photobooth rental service",
        quantity: "1",
        unitPrice: String(amount),
        total: String(amount),
      });
    }
  }

  console.log("  ✅ Revenue Intelligence demo data seeded");
}
