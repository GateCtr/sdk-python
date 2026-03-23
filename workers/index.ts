import { webhookWorker } from "./webhook.worker";
import { analyticsWorker } from "./analytics.worker";
import { dailyReportWorker, scheduleDailyReport } from "./daily-report.worker";
import { emailWorker } from "./email.worker";

console.info("[workers] starting all workers");

// Schedule the daily cron (idempotent — safe to call on every boot)
scheduleDailyReport().catch((err) =>
  console.error("[workers] failed to schedule daily report", err),
);

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  console.info(`[workers] received ${signal} — shutting down`);
  await Promise.all([
    webhookWorker.close(),
    analyticsWorker.close(),
    dailyReportWorker.close(),
    emailWorker.close(),
  ]);
  console.info("[workers] all workers closed");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
