import { and, eq, like, sql } from "drizzle-orm";
import { contracts, db, invoices, quotes } from "@workspace/db";
import { buildNextDocumentNumber } from "./documentNumbers";

type DocumentNumberClient = Pick<typeof db, "execute" | "select">;

async function lockDocumentNumberSequence(
  client: DocumentNumberClient,
  prefix: string,
  userId: string,
  year: number,
): Promise<void> {
  await client.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`document-number:${prefix}:${year}:${userId}`}))`,
  );
}

export async function nextContractNumber(
  userId: string,
  client: DocumentNumberClient = db,
): Promise<string> {
  const year = new Date().getFullYear();
  await lockDocumentNumberSequence(client, "CON", userId, year);
  const rows = await client
    .select({ number: contracts.contractNumber })
    .from(contracts)
    .where(
      and(
        eq(contracts.userId, userId),
        like(contracts.contractNumber, `CON-${year}-%`),
      ),
    );
  return buildNextDocumentNumber(
    "CON",
    year,
    rows.map((r) => r.number),
  );
}

export async function nextQuoteNumber(
  userId: string,
  client: DocumentNumberClient = db,
): Promise<string> {
  const year = new Date().getFullYear();
  await lockDocumentNumberSequence(client, "Q", userId, year);
  const rows = await client
    .select({ number: quotes.quoteNumber })
    .from(quotes)
    .where(
      and(eq(quotes.userId, userId), like(quotes.quoteNumber, `Q-${year}-%`)),
    );
  return buildNextDocumentNumber(
    "Q",
    year,
    rows.map((r) => r.number),
  );
}

export async function nextInvoiceNumber(
  userId: string,
  client: DocumentNumberClient = db,
): Promise<string> {
  const year = new Date().getFullYear();
  await lockDocumentNumberSequence(client, "INV", userId, year);
  const rows = await client
    .select({ number: invoices.invoiceNumber })
    .from(invoices)
    .where(
      and(
        eq(invoices.userId, userId),
        like(invoices.invoiceNumber, `INV-${year}-%`),
      ),
    );
  return buildNextDocumentNumber(
    "INV",
    year,
    rows.map((r) => r.number),
  );
}
