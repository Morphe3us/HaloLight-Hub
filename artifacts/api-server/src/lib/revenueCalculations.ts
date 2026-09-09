type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export type RevenueInvoiceRow = {
  total: number | string | null | undefined;
  status: InvoiceStatus | string;
  dueDate?: Date | string | null;
};

function amount(value: RevenueInvoiceRow["total"]): number {
  return Number(value ?? 0);
}

export function isInvoiceRevenueOverdue(
  invoice: RevenueInvoiceRow,
  now = new Date(),
): boolean {
  if (invoice.status === "paid" || invoice.status === "cancelled") {
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
        invoice.status !== "paid" &&
        invoice.status !== "cancelled" &&
        !isInvoiceRevenueOverdue(invoice, now),
    )
    .reduce((sum, invoice) => sum + amount(invoice.total), 0);
  const paidCount = paidInvoices.length;

  return {
    totalRevenue: Math.round(totalRevenue),
    pipelineRevenue: Math.round(pipelineRevenue),
    outstandingRevenue: Math.round(outstandingRevenue),
    overdueRevenue: Math.round(overdueRevenue),
    paidInvoices: paidCount,
    avgBookingValue: paidCount > 0 ? Math.round(totalRevenue / paidCount) : 0,
  };
}
