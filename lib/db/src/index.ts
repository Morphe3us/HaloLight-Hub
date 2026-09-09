import { drizzle } from "drizzle-orm/node-postgres";
import { createDatabasePool } from "./poolConfig";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = createDatabasePool(process.env.DATABASE_URL);
export const db = drizzle(pool, { schema });

export * from "./schema";
