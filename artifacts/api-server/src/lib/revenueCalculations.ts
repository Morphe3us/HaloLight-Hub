type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export type RevenueInvoiceRow = {
  total: number | string | null | undefined;
  status: InvoiceStatus | string;
  dueDate?: Date | string | null;
};

function amount(value: RevenueInvoiceRow["total"]): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export function isInvoiceRevenueOverdue(
  invoice: RevenueInvoiceRow,
  now = new Date(),
): boolean {
  if (invoice.status !== "sent" && invoice.status !== "overdue") {
    return false;
  }
  if (invoice.status === "overdue") {
    return true;
  }
  if (!invoice.dueDate) {
    return false;
  }
  return new Date(invoice.dueDate) < now;
}

export function summarizeInvoiceRevenue(
  invoices: RevenueInvoiceRow[],
  now = new Date(),
) {
  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
  const totalRevenue = paidInvoices.reduce(
    (sum, invoice) => sum + amount(invoice.total),
    0,
  );
  const pipelineRevenue = invoices
    .filter((invoice) => invoice.status === "sent")
    .reduce((sum, invoice) => sum + amount(invoice.total), 0);
  const overdueRevenue = invoices
    .filter((invoice) => isInvoiceRevenueOverdue(invoice, now))
    .reduce((sum, invoice) => sum + amount(invoice.total), 0);
  const outstandingRevenue = invoices
    .filter(
      (invoice) =>
        invoice.status === "sent" &&
        !isInvoiceRevenueOverdue(invoice, now),
    )
    .reduce((sum, invoice) => sum + amount(invoice.total), 0);
  const paidCount = paidInvoices.length;

  return {
    totalRevenue: roundMoney(totalRevenue),
    totalInvoiced: roundMoney(totalRevenue + outstandingRevenue + overdueRevenue),
    totalUnpaid: roundMoney(outstandingRevenue + overdueRevenue),
    pipelineRevenue: roundMoney(pipelineRevenue),
    outstandingRevenue: roundMoney(outstandingRevenue),
    overdueRevenue: roundMoney(overdueRevenue),
    paidInvoices: paidCount,
    avgBookingValue: paidCount > 0 ? roundMoney(totalRevenue / paidCount) : 0,
  };
}
