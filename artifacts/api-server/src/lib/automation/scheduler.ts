import { runAutomation } from "./engine";
import { logger } from "../logger";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let schedulerHandle: ReturnType<typeof setInterval> | null = null;

export function startAutomationScheduler(): void {
  if (schedulerHandle) return;

  logger.info("Automation scheduler started (interval: 1h)");

  // Run once shortly after startup (5 min delay to let server warm up)
  const initialDelay = setTimeout(() => {
    void runAutomation("scheduled").catch((err) => {
      logger.error({ err }, "Initial automation run failed");
    });
  }, 5 * 60 * 1000);

  // Then run every hour
  schedulerHandle = setInterval(() => {
    void runAutomation("scheduled").catch((err) => {
      logger.error({ err }, "Scheduled automation run failed");
    });
  }, INTERVAL_MS);

  // Cleanup on process exit
  process.once("SIGTERM", stopAutomationScheduler);
  process.once("SIGINT", stopAutomationScheduler);
}

export function stopAutomationScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
    logger.info("Automation scheduler stopped");
  }
}
