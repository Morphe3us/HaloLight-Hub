import { Router, type IRouter, type Request, type Response } from "express";
import { sql, eq, and, gte, lte, ne, count, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  invoices,
  quotes,
  customerSuccessScores,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { summarizeInvoiceRevenue } from "../lib/revenueCalculations";

const router: IRouter = Router();

// GET /admin/revenue
router.get(
  "/admin/revenue",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // ─── Overview KPIs ─────────────────────────────────────────────────────────
    const allInvoices = await db
      .select({
        total: invoices.total,
        status: invoices.status,
        dueDate: invoices.dueDate,
      })
      .from(invoices);
    const revenueOverview = summarizeInvoiceRevenue(allInvoices);

    // Monthly revenue — last 12 months
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const monthlyRows = await db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${invoices.createdAt}), 'YYYY-MM')`,
        revenue: sql<number>`sum(${invoices.total})::float`,
        invoiceCount: sql<number>`count(*)::int`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, "paid"),
          gte(invoices.createdAt, twelveMonthsAgo),
        ),
      )
      .groupBy(sql`date_trunc('month', ${invoices.createdAt})`)
      .orderBy(sql`date_trunc('month', ${invoices.createdAt})`);

    // Fill in missing months
    const monthMap: Record<
      string,
      { month: string; label: string; revenue: number; invoiceCount: number }
    > = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
      monthMap[key] = { month: key, label, revenue: 0, invoiceCount: 0 };
    }
    for (const row of monthlyRows) {
      if (row.month in monthMap) {
        monthMap[row.month]!.revenue = Math.round(Number(row.revenue ?? 0));
        monthMap[row.month]!.invoiceCount = row.invoiceCount ?? 0;
      }
    }
    const monthly = Object.values(monthMap);

    // Revenue growth (current month vs previous month)
    const currentMonthRevenue = monthly[monthly.length - 1]?.revenue ?? 0;
    const prevMonthRevenue = monthly[monthly.length - 2]?.revenue ?? 0;
    const revenueGrowth =
      prevMonthRevenue > 0
        ? Math.round(
            ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100,
          )
        : 0;

    // Lifetime estimate (total paid + 12-month projection based on avg monthly)
    const avgMonthly = monthly.reduce((s, m) => s + m.revenue, 0) / 12;
    const lifetimeEstimate = Math.round(
      revenueOverview.totalRevenue + avgMonthly * 12,
    );

    // ─── Quote Funnel ──────────────────────────────────────────────────────────
    const quoteCounts = await db
      .select({
        status: quotes.status,
        count: sql<number>`count(*)::int`,
        value: sql<number>`sum(${quotes.total})::float`,
      })
      .from(quotes)
      .groupBy(quotes.status);

    const quoteFunnelMap: Record<string, { count: number; value: number }> = {
      draft: { count: 0, value: 0 },
      sent: { count: 0, value: 0 },
      accepted: { count: 0, value: 0 },
      declined: { count: 0, value: 0 },
      expired: { count: 0, value: 0 },
    };
    for (const row of quoteCounts) {
      if (row.status in quoteFunnelMap) {
        quoteFunnelMap[row.status]!.count = row.count;
        quoteFunnelMap[row.status]!.value = Math.round(Number(row.value ?? 0));
      }
    }
    const totalQuotes = Object.values(quoteFunnelMap).reduce(
      (s, v) => s + v.count,
      0,
    );
    const acceptedQuotes = quoteFunnelMap.accepted?.count ?? 0;
    const quoteAcceptanceRate =
      totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 100) : 0;
    const conversionValue = quoteFunnelMap.accepted?.value ?? 0;

    // ─── Client Revenue Leaderboard ────────────────────────────────────────────
    const clientRevRows = await db
      .select({
        userId: invoices.userId,
        totalRevenue: sql<number>`sum(${invoices.total})::float`,
        invoiceCount: sql<number>`count(*)::int`,
        lastInvoice: sql<string>`max(${invoices.createdAt})`,
      })
      .from(invoices)
      .where(eq(invoices.status, "paid"))
      .groupBy(invoices.userId)
      .orderBy(desc(sql`sum(${invoices.total})`))
      .limit(20);

    const leaderboard = await Promise.all(
      clientRevRows.map(async (row) => {
        const [u] = await db
          .select({
            fullName: usersTable.fullName,
            email: usersTable.email,
            companyName: usersTable.companyName,
          })
          .from(usersTable)
          .where(eq(usersTable.id, row.userId));

        const [scoreRow] = await db
          .select({
            score: customerSuccessScores.score,
            tier: customerSuccessScores.tier,
          })
          .from(customerSuccessScores)
          .where(eq(customerSuccessScores.userId, row.userId));

        const totalRev = Math.round(Number(row.totalRevenue ?? 0));
        const avgBooking =
          row.invoiceCount > 0 ? Math.round(totalRev / row.invoiceCount) : 0;

        return {
          userId: row.userId,
          name: u?.fullName ?? u?.email ?? "Unknown",
          email: u?.email ?? "",
          company: u?.companyName ?? "",
          totalRevenue: totalRev,
          invoiceCount: row.invoiceCount,
          avgBooking,
          lastInvoice: row.lastInvoice,
          score: scoreRow?.score ?? null,
          tier: scoreRow?.tier ?? null,
        };
      }),
    );

    // ─── Revenue by Tier ───────────────────────────────────────────────────────
    const tierRows = await db
      .select({
        tier: customerSuccessScores.tier,
        revenue: sql<number>`sum(${invoices.total})::float`,
        clientCount: sql<number>`count(distinct ${invoices.userId})::int`,
      })
      .from(invoices)
      .innerJoin(
        customerSuccessScores,
        eq(invoices.userId, customerSuccessScores.userId),
      )
      .where(eq(invoices.status, "paid"))
      .groupBy(customerSuccessScores.tier);

    const revenueByTier = tierRows.map((r) => ({
      tier: r.tier,
      revenue: Math.round(Number(r.revenue ?? 0)),
      clientCount: r.clientCount,
    }));

    // ─── Revenue by Booking Value Segment ─────────────────────────────────────
    const segmentRows = await db
      .select({
        total: invoices.total,
      })
      .from(invoices)
      .where(eq(invoices.status, "paid"));

    const segments: Record<
      string,
      { label: string; revenue: number; count: number }
    > = {
      micro: { label: "< $1,000", revenue: 0, count: 0 },
      small: { label: "$1,000–$2,999", revenue: 0, count: 0 },
      medium: { label: "$3,000–$5,999", revenue: 0, count: 0 },
      large: { label: "$6,000+", revenue: 0, count: 0 },
    };
    for (const row of segmentRows) {
      const amt = Number(row.total ?? 0);
      if (amt < 1000) {
        segments.micro!.revenue += amt;
        segments.micro!.count += 1;
      } else if (amt < 3000) {
        segments.small!.revenue += amt;
        segments.small!.count += 1;
      } else if (amt < 6000) {
        segments.medium!.revenue += amt;
        segments.medium!.count += 1;
      } else {
        segments.large!.revenue += amt;
        segments.large!.count += 1;
      }
    }
    const revenueBySegment = Object.values(segments).map((s) => ({
      ...s,
      revenue: Math.round(s.revenue),
    }));

    // ─── Top Performers ────────────────────────────────────────────────────────
    const topPerformers = leaderboard.slice(0, 5);

    res.json({
      overview: {
        ...revenueOverview,
        quoteAcceptanceRate,
        revenueGrowth,
        lifetimeEstimate,
        totalInvoices: allInvoices.length,
      },
      monthly,
      clientLeaderboard: leaderboard,
      revenueByTier,
      revenueBySegment,
      quoteFunnel: {
        ...quoteFunnelMap,
        totalQuotes,
        acceptanceRate: quoteAcceptanceRate,
        conversionValue,
      },
      topPerformers,
    });
  },
);

export default router;
