import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isInvoiceRevenueOverdue,
  summarizeInvoiceRevenue,
  type RevenueInvoiceRow,
} from "./revenueCalculations";

const now = new Date("2026-07-03T12:00:00.000Z");

describe("revenue calculations", () => {
  it("treats unpaid past-due invoices as overdue revenue", () => {
    const invoices: RevenueInvoiceRow[] = [
      { status: "paid", total: "100", dueDate: "2026-07-01T00:00:00.000Z" },
      { status: "sent", total: "200", dueDate: "2026-07-10T00:00:00.000Z" },
      { status: "sent", total: "300", dueDate: "2026-07-02T00:00:00.000Z" },
      { status: "overdue", total: "400", dueDate: "2026-07-10T00:00:00.000Z" },
      {
        status: "cancelled",
        total: "500",
        dueDate: "2026-07-01T00:00:00.000Z",
      },
      { status: "draft", total: "600", dueDate: "2026-07-01T00:00:00.000Z" },
    ];

    const summary = summarizeInvoiceRevenue(invoices, now);

    assert.equal(summary.totalRevenue, 100);
    assert.equal(summary.pipelineRevenue, 500);
    assert.equal(summary.outstandingRevenue, 200);
    assert.equal(summary.overdueRevenue, 1300);
    assert.equal(summary.paidInvoices, 1);
    assert.equal(summary.avgBookingValue, 100);
  });

  it("does not mark paid or cancelled past-due invoices as overdue", () => {
    assert.equal(
      isInvoiceRevenueOverdue(
        { status: "paid", total: "100", dueDate: "2026-07-01T00:00:00.000Z" },
        now,
      ),
      false,
    );
    assert.equal(
      isInvoiceRevenueOverdue(
        {
          status: "cancelled",
          total: "100",
          dueDate: "2026-07-01T00:00:00.000Z",
        },
        now,
      ),
      false,
    );
  });
});
