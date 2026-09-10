import app from "./app";
import { logger } from "./lib/logger";
import { startAutomationScheduler, stopAutomationScheduler } from "./lib/automation/scheduler";
import { pool } from "@workspace/db";
import { startTicketMailWorker, stopTicketMailWorker } from "./lib/mail/ticketOutbox";

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startAutomationScheduler();
  startTicketMailWorker();
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  stopAutomationScheduler();
  stopTicketMailWorker();
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  server.close(() => {
    void pool.end().then(() => {
      clearTimeout(deadline);
      process.exit(0);
    }).catch(() => process.exit(1));
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
