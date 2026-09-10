export const DASHBOARD_WIDGETS = [
  "next_lesson", "onboarding", "notifications", "upcoming_events", "academy_stats", "sales_overview",
] as const;
export type DashboardWidgets = Record<typeof DASHBOARD_WIDGETS[number], boolean>;

export function dashboardWidgets(value: unknown): DashboardWidgets {
  const saved = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return Object.fromEntries(DASHBOARD_WIDGETS.map((key) => [
    key, typeof saved[key] === "boolean" ? saved[key] : true,
  ])) as DashboardWidgets;
}

export function parseDashboardPatch(value: unknown): Partial<DashboardWidgets> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.length || entries.some(([key, enabled]) =>
    !DASHBOARD_WIDGETS.includes(key as typeof DASHBOARD_WIDGETS[number]) || typeof enabled !== "boolean",
  )) return null;
  return Object.fromEntries(entries);
}
