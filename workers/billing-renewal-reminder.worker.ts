/**
 * Billing Renewal Reminder Worker
 *
 * Runs daily at 09:00 UTC.
 * Finds subscriptions renewing within 7 days and enqueues reminder emails.
 */

import { Queue, Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { sendBillingRenewalReminderEmail } from "@/lib/resend";
import { redisConnection } from "@/lib/queues";

// ─── Queue ────────────────────────────────────────────────────────────────────

export const billingEmailQueue = new Queue("billing-emails", {
  connection: redisConnection,
  skipVersionCheck: true,
});

// ─── Job types ────────────────────────────────────────────────────────────────

interface RenewalReminderJobData {
  userId: string;
  email: string;
  renewalDate: string; // ISO string
  amount: number; // cents
  locale: "en" | "fr";
}

// ─── Scheduler — runs daily at 09:00 UTC ─────────────────────────────────────

export async function scheduleRenewalReminders(): Promise<void> {
  await billingEmailQueue.add(
    "scan-renewals",
    {},
    {
      repeat: { pattern: "0 9 * * *" }, // daily at 09:00 UTC
      jobId: "scan-renewals-daily",
    },
  );
}

// ─── Scanner job processor ────────────────────────────────────────────────────

async function processScanRenewals(): Promise<void> {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      currentPeriodEnd: {
        gte: now,
        lte: in7Days,
      },
    },
    include: {
      user: { select: { id: true, email: true, metadata: true } },
      plan: { select: { name: true } },
    },
  });

  for (const sub of subscriptions) {
    if (!sub.currentPeriodEnd || !sub.user.email) continue;

    const meta = (sub.user.metadata ?? {}) as Record<string, unknown>;
    const locale: "en" | "fr" = meta.locale === "fr" ? "fr" : "en";

    // Derive amount from plan name (cents)
    const planPrices: Record<string, number> = { PRO: 2900, TEAM: 9900 };
    const amount = planPrices[sub.plan.name] ?? 0;

    await billingEmailQueue.add(
      "send-renewal-reminder",
      {
        userId: sub.user.id,
        email: sub.user.email,
        renewalDate: sub.currentPeriodEnd.toISOString(),
        amount,
        locale,
      } satisfies RenewalReminderJobData,
      {
        // Deduplicate: one reminder per subscription per day
        jobId: `renewal-reminder:${sub.id}:${now.toISOString().slice(0, 10)}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    );
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const billingEmailWorker = new Worker(
  "billing-emails",
  async (job: Job) => {
    if (job.name === "scan-renewals") {
      await processScanRenewals();
      return;
    }

    if (job.name === "send-renewal-reminder") {
      const data = job.data as RenewalReminderJobData;
      await sendBillingRenewalReminderEmail(
        data.email,
        new Date(data.renewalDate),
        data.amount,
        data.locale,
      );
    }
  },
  { connection: redisConnection, skipVersionCheck: true },
);

billingEmailWorker.on("failed", (job, err) => {
  console.error(`[billing-emails] Job ${job?.id} failed:`, err.message);
});
