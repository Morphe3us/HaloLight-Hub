export function consumableUsage(item: { currentQuantity: number; unitType?: string; averagePrintsPerEvent?: number | null; averageEventsPerMonth?: string | number | null }) {
  if (item.unitType !== "prints") return { monthlyConsumption: null, eventsRemaining: null, monthsRemaining: null };
  const prints = item.averagePrintsPerEvent ?? null;
  const events = item.averageEventsPerMonth == null ? null : Number(item.averageEventsPerMonth);
  const monthlyConsumption = prints === null || events === null ? null : Math.round(prints * events * 100) / 100;
  return {
    monthlyConsumption,
    eventsRemaining: prints !== null && prints > 0 ? Math.floor(item.currentQuantity / prints) : null,
    monthsRemaining: monthlyConsumption !== null && monthlyConsumption > 0 ? Math.round(item.currentQuantity / monthlyConsumption * 100) / 100 : null,
  };
}

export function parseConsumableUsage(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid usage settings");
  const data = body as Record<string, unknown>;
  const result: { averagePrintsPerEvent?: number | null; averageEventsPerMonth?: string | null } = {};
  if (data.averagePrintsPerEvent !== undefined) {
    const value = data.averagePrintsPerEvent;
    if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1000000)) throw new Error("averagePrintsPerEvent must be an integer from 0 to 1000000 or null");
    result.averagePrintsPerEvent = value as number | null;
  }
  if (data.averageEventsPerMonth !== undefined) {
    const value = data.averageEventsPerMonth;
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001)) throw new Error("averageEventsPerMonth must be a non-negative number with at most two decimal places or null");
    result.averageEventsPerMonth = value === null ? null : String(value);
  }
  return result;
}
