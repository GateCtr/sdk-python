/**
 * Daily Report Worker
 *
 * Runs at midnight (UTC) via a repeatable BullMQ job.
 * For each active user:
 *   1. Aggregates UsageLog rows for yesterday → upserts DailyUsageCache
 *   2. Dispatches webhook event `usage.daily` with total_tokens, cost, top_projects
 */

import { Worker, type Job } from "bullmq";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { dispatchWebhook } from "@/lib/webhooks";
import {
  redisConnection,
  type DailyReportJobData,
  dailyReportQueue,
} from "@/lib/queues";

// ── Helpers ──────────────────────────────────────────────────────────────────

function yesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function dateRange(date: string): { gte: Date; lte: Date } {
  return {
    gte: new Date(`${date}T00:00:00.000Z`),
    lte: new Date(`${date}T23:59:59.999Z`),
  };
}

// ── Core aggregation logic ────────────────────────────────────────────────────

async function aggregateUserDay(userId: string, date: string): Promise<void> {
  const range = dateRange(date);

  // 1. Global totals for the day
  const totals = await prisma.usageLog.aggregate({
    where: { userId, createdAt: range },
    _sum: {
      totalTokens: true,
      savedTokens: true,
      costUsd: true,
    },
    _count: { id: true },
  });

  const totalTokens = totals._sum.totalTokens ?? 0;
  const savedTokens = totals._sum.savedTokens ?? 0;
  const totalCostUsd = totals._sum.costUsd ?? 0;
  const totalRequests = totals._count.id;

  // Skip users with zero activity
  if (totalRequests === 0) return;

  // 2. Upsert global DailyUsageCache (no projectId)
  await prisma.dailyUsageCache.upsert({
    where: {
      userId_projectId_date: {
        userId,
        projectId: null as unknown as string,
        date,
      },
    },
    create: {
      userId,
      projectId: null,
      date,
      totalTokens,
      savedTokens,
      totalRequests,
      totalCostUsd,
      lastUpdated: new Date(),
    },
    update: {
      totalTokens,
      savedTokens,
      totalRequests,
      totalCostUsd,
      lastUpdated: new Date(),
    },
  });

  // 3. Per-project aggregation
  const byProject = await prisma.usageLog.groupBy({
    by: ["projectId"],
    where: { userId, createdAt: range, projectId: { not: null } },
    _sum: { totalTokens: true, savedTokens: true, costUsd: true },
    _count: { id: true },
    orderBy: { _sum: { totalTokens: "desc" } },
  });

  for (const row of byProject) {
    if (!row.projectId) continue;
    await prisma.dailyUsageCache.upsert({
      where: {
        userId_projectId_date: {
          userId,
          projectId: row.projectId,
          date,
        },
      },
      create: {
        userId,
        projectId: row.projectId,
        date,
        totalTokens: row._sum.totalTokens ?? 0,
        savedTokens: row._sum.savedTokens ?? 0,
        totalRequests: row._count.id,
        totalCostUsd: row._sum.costUsd ?? 0,
        lastUpdated: new Date(),
      },
      update: {
        totalTokens: row._sum.totalTokens ?? 0,
        savedTokens: row._sum.savedTokens ?? 0,
        totalRequests: row._count.id,
        totalCostUsd: row._sum.costUsd ?? 0,
        lastUpdated: new Date(),
      },
    });
  }

  // 4. Build top_projects for webhook payload
  const projectIds = byProject
    .slice(0, 5)
    .map((r) => r.projectId)
    .filter(Boolean) as string[];

  const projects = projectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true, slug: true },
      })
    : [];

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));

  const topProjects = byProject.slice(0, 5).map((r) => ({
    project_id: r.projectId,
    name: r.projectId ? (projectMap[r.projectId]?.name ?? r.projectId) : null,
    total_tokens: r._sum.totalTokens ?? 0,
    cost_usd: r._sum.costUsd ?? 0,
    requests: r._count.id,
  }));

  // 5. Dispatch webhook
  await dispatchWebhook(userId, "usage.daily", {
    date,
    total_tokens: totalTokens,
    saved_tokens: savedTokens,
    total_requests: totalRequests,
    cost_usd: totalCostUsd,
    top_projects: topProjects,
  });
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processJob(job: Job<DailyReportJobData>): Promise<void> {
  const date = job.data.date ?? yesterday();

  console.info("[daily-report] starting aggregation", { date });

  // Process all users who had activity that day
  const activeUserIds = await prisma.usageLog.findMany({
    where: {
      createdAt: dateRange(date),
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  console.info("[daily-report] users to process", {
    date,
    count: activeUserIds.length,
  });

  const results = await Promise.allSettled(
    activeUserIds.map((u) => aggregateUserDay(u.userId, date)),
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error("[daily-report] some users failed", {
      date,
      failed: failed.length,
      total: activeUserIds.length,
    });
    // Re-throw if all failed
    if (failed.length === activeUserIds.length) {
      throw new Error(`All ${failed.length} users failed aggregation`);
    }
  }

  console.info("[daily-report] done", {
    date,
    processed: activeUserIds.length - failed.length,
    failed: failed.length,
  });
}

// ── Worker ────────────────────────────────────────────────────────────────────

export const dailyReportWorker = new Worker<DailyReportJobData>(
  "daily-report",
  processJob,
  {
    connection: redisConnection,
    concurrency: 1,
    lockDuration: 5 * 60 * 1000,
    skipVersionCheck: true,
  },
);

dailyReportWorker.on("failed", (job, err) => {
  console.error("[daily-report] job failed", {
    jobId: job?.id,
    date: job?.data?.date,
    error: err.message,
  });
  Sentry.captureException(err, { extra: { date: job?.data?.date } });
});

dailyReportWorker.on("completed", (job) => {
  console.info("[daily-report] job completed", {
    jobId: job.id,
    date: job.data.date,
  });
});

// ── Schedule the repeatable cron job (midnight UTC) ───────────────────────────
// Call this once at app startup / worker boot.

export async function scheduleDailyReport(): Promise<void> {
  await dailyReportQueue.add(
    "daily-aggregate",
    { date: yesterday() }, // placeholder — processor always uses yesterday()
    {
      repeat: { pattern: "0 0 * * *" }, // every day at 00:00 UTC
      jobId: "daily-aggregate-cron", // stable ID prevents duplicates
    },
  );
  console.info("[daily-report] cron scheduled: 0 0 * * *");
}
