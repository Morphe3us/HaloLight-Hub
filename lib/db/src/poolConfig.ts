import pg from "pg";

export function createPoolConfig(connectionString: string): pg.PoolConfig {
  return {
    connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 15_000,
    idleTimeoutMillis: 30_000,
  };
}

export function createDatabasePool(connectionString: string): pg.Pool {
  const pool = new pg.Pool(createPoolConfig(connectionString));
  pool.on("error", () => {
    // pg removes failed idle clients itself. Never serialize the error or client.
    console.error("DATABASE_UNAVAILABLE: idle database connection failed");
  });
  return pool;
}
