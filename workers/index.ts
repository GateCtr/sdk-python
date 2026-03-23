import { webhookWorker } from "./webhook.worker";
import { analyticsWorker } from "./analytics.worker";
import { dailyReportWorker, scheduleDailyReport } from "./daily-report.worker";
import { emailWorker } from "./email.worker";
import { healthWorker, scheduleHealthCheck } from "./health.worker";
import {
  billingEmailWorker,
  scheduleRenewalReminders,
} from "./billing-renewal-reminder.worker";

console.info("[workers] starting all workers");

// ── Global error handlers ────────────────────────────────────────────────────
process.on("unhandledRejection", (reason, promise) => {
  console.error("[workers] unhandledRejection", { reason, promise });
});

process.on("uncaughtException", (err) => {
  console.error("[workers] uncaughtException", err);
  process.exit(1);
});

scheduleDailyReport().catch((err) =>
  console.error("[workers] failed to schedule daily report", err),
);

scheduleHealthCheck().catch((err) =>
  console.error("[workers] failed to schedule health check", err),
);

scheduleRenewalReminders().catch((err) =>
  console.error("[workers] failed to schedule renewal reminders", err),
);

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  console.info(`[workers] received ${signal} — shutting down`);
  await Promise.all([
    webhookWorker.close(),
    analyticsWorker.close(),
    dailyReportWorker.close(),
    emailWorker.close(),
    healthWorker.close(),
    billingEmailWorker.close(),
  ]);
  console.info("[workers] all workers closed");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
