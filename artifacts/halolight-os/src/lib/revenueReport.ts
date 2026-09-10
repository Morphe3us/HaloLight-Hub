import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface RevenueReport {
  currency: string;
  availableCurrencies: string[];
  undatedPaidInvoices: number;
  excludedCurrencyInvoices: number;
  overview: Record<string, number | null>;
  monthly: Array<{ month: string; label: string; revenue: number; invoiceCount: number }>;
  clientLeaderboard: RevenueClient[];
  topPerformers: RevenueClient[];
  revenueByTier: Array<{ tier: string; revenue: number; clientCount: number }>;
  revenueBySegment: Array<{ label: string; revenue: number; count: number }>;
  quoteFunnel: { totalQuotes: number; issuedQuotes: number; acceptanceRate: number | null; conversionValue: number } &
    Record<"draft" | "sent" | "accepted" | "declined" | "expired", { count: number; value: number }>;
}
interface RevenueClient {
  userId: string; name: string; email: string; company: string; totalRevenue: number;
  invoiceCount: number; avgBooking: number; lastInvoice: string | null; score: number | null; tier: string | null;
}

export function useRevenueReport(currency: string) {
  return useQuery({
    queryKey: ["/api/admin/revenue", { currency }],
    queryFn: ({ signal }) => customFetch<RevenueReport>(`/api/admin/revenue?currency=${encodeURIComponent(currency)}`, { signal }),
  });
}
