function resolveSeedBaseDate(): Date {
  const configured = process.env.SEED_BASE_DATE;
  if (configured) {
    const parsed = new Date(configured);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("SEED_BASE_DATE must be a valid date or ISO timestamp.");
    }
    return parsed;
  }

  const current = new Date();
  current.setUTCHours(12, 0, 0, 0);
  return current;
}

export const SEED_BASE_DATE = resolveSeedBaseDate();

export const SEED_DEMO_CLIENT_AUTH_IDS = [
  "demo_champion_001",
  "demo_healthy_001",
  "demo_developing_001",
  "demo_at_risk_001",
  "demo_developing_002",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function addSeedDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function seedDaysAgo(days: number): Date {
  return addSeedDays(SEED_BASE_DATE, -days);
}

export function seedDaysFromNow(days: number): Date {
  return addSeedDays(SEED_BASE_DATE, days);
}

function shiftSeedMonths(monthDelta: number, day: number): Date {
  const targetYear = SEED_BASE_DATE.getUTCFullYear();
  const targetMonth = SEED_BASE_DATE.getUTCMonth() + monthDelta;
  const lastTargetDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const targetDay = Math.min(day, lastTargetDay);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      targetDay,
      SEED_BASE_DATE.getUTCHours(),
      SEED_BASE_DATE.getUTCMinutes(),
      SEED_BASE_DATE.getUTCSeconds(),
      SEED_BASE_DATE.getUTCMilliseconds(),
    ),
  );
}

export function seedMonthsAgo(months: number, day = 15): Date {
  return shiftSeedMonths(-months, day);
}

export function seedMonthsFromNow(
  months: number,
  day = SEED_BASE_DATE.getUTCDate(),
): Date {
  return shiftSeedMonths(months, day);
}

export function deterministicRange(
  seed: number,
  min: number,
  max: number,
): number {
  const span = max - min + 1;
  return min + ((seed * 1103515245 + 12345) % span);
}
