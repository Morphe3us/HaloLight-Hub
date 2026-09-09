export function parseBooleanEnv(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export function isExplicitDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

export function isExplicitTest(): boolean {
  return process.env.NODE_ENV === "test";
}
