import { customFetch } from "@workspace/api-client-react";

export const consentKey = (userId: string) => ["user-consent", userId] as const;
export const dashboardPreferencesKey = (userId: string) => ["dashboard-preferences", userId] as const;
export const DEFAULT_DASHBOARD_WIDGETS = {
  next_lesson: true, onboarding: true, notifications: true,
  upcoming_events: true, academy_stats: true, sales_overview: true,
};
export type DashboardWidgets = typeof DEFAULT_DASHBOARD_WIDGETS;
export interface LegalDocuments {
  termsVersion: string; privacyVersion: string; termsUrl: string; privacyUrl: string;
}
export interface ConsentEvent extends LegalDocuments {
  id: string; userId: string; acceptedAt: string;
  marketing: boolean; analytics: boolean; aiImprovement: boolean;
}
export interface ConsentStatus {
  configured: boolean; required: boolean; documents: LegalDocuments | null; acceptance: ConsentEvent | null;
}
export const getConsent = (signal?: AbortSignal) => customFetch<ConsentStatus>("/api/users/me/consent", { signal });
export const saveConsent = (body: {
  accepted: true; termsVersion: string; privacyVersion: string;
  termsUrl: string; privacyUrl: string;
  marketing: boolean; analytics: boolean; aiImprovement: boolean;
}) => customFetch<ConsentStatus>("/api/users/me/consent", { method: "POST", body: JSON.stringify(body) });

export function normalizedDashboardWidgets(value: unknown): DashboardWidgets {
  const saved = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.keys(DEFAULT_DASHBOARD_WIDGETS).map((key) => [
    key, typeof saved[key] === "boolean" ? saved[key] : true,
  ])) as DashboardWidgets;
}
export async function getDashboardPreferences(signal?: AbortSignal) {
  const result = await customFetch<{ widgets: unknown }>("/api/users/me/dashboard-preferences", { signal });
  return normalizedDashboardWidgets(result.widgets);
}
export async function saveDashboardPreference(key: keyof DashboardWidgets, enabled: boolean) {
  const result = await customFetch<{ widgets: unknown }>("/api/users/me/dashboard-preferences", {
    method: "PATCH", body: JSON.stringify({ widgets: { [key]: enabled } }),
  });
  return normalizedDashboardWidgets(result.widgets);
}
