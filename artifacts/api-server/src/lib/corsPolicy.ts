const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

function splitOrigins(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function getAllowedCorsOrigins(env = process.env): Set<string> {
  const origins = new Set<string>([
    ...splitOrigins(env.API_ALLOWED_ORIGINS),
    ...splitOrigins(env.CORS_ALLOWED_ORIGINS),
    ...splitOrigins(env.APP_PUBLIC_URL),
    ...splitOrigins(env.FRONTEND_URL),
  ]);

  if (env.NODE_ENV !== "production") {
    DEV_ORIGINS.forEach((origin) => origins.add(origin));
  }

  return origins;
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: Set<string>,
): boolean {
  if (!origin) return true;
  return allowedOrigins.has(origin.replace(/\/$/, ""));
}
