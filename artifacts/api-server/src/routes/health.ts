import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { DATABASE_UNAVAILABLE_RESPONSE } from "../lib/apiErrors";

export const READINESS_TIMEOUT_MS = 2_000;

type ReadinessClient = {
  query: (text: string) => Promise<unknown>;
  release: (destroy?: boolean) => void;
  on: (event: "error", listener: () => void) => unknown;
  removeListener: (event: "error", listener: () => void) => unknown;
};
type Connect = () => Promise<ReadinessClient>;

async function connectDatabase(): Promise<ReadinessClient> {
  const { pool } = await import("@workspace/db");
  return pool.connect();
}

export function checkDatabaseReadiness(
  connect: Connect,
  timeoutMs = READINESS_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    let client: ReadinessClient | undefined;

    const finish = (failed: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (client) {
        client.removeListener("error", onError);
        client.release(failed);
      }
      if (failed) reject(new Error("Database readiness check failed"));
      else resolve();
    };
    const onError = () => finish(true);
    const timer = setTimeout(onError, timeoutMs);

    const probe = async () => {
      const acquired = await connect();
      // A timed-out pool checkout may still resolve; do not leak or query it.
      if (finished) {
        acquired.release(true);
        return;
      }
      client = acquired;
      client.on("error", onError);
      await client.query("SELECT 1");
      finish(false);
    };
    void probe().catch(onError);
  });
}

export function createHealthRouter(
  connect: Connect = connectDatabase,
  timeoutMs = READINESS_TIMEOUT_MS,
): IRouter {
  const router: IRouter = Router();

  router.get("/healthz", (_req, res) => {
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  });

  router.get("/readyz", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await checkDatabaseReadiness(connect, timeoutMs);
      res.json({ status: "ok" });
    } catch {
      res.err = Object.assign(new Error(DATABASE_UNAVAILABLE_RESPONSE.error), {
        code: DATABASE_UNAVAILABLE_RESPONSE.code,
      });
      res.status(503).json(DATABASE_UNAVAILABLE_RESPONSE);
    }
  });

  return router;
}

export default createHealthRouter();
