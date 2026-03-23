import { Worker, type Job } from "bullmq";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { recordBudgetUsage } from "@/lib/firewall";
import { redisConnection, type AnalyticsJobData } from "@/lib/queues";

async function processJob(job: Job<AnalyticsJobData>): Promise<void> {
  const startMs = Date.now();
  const data = job.data;

  // ── 7.2 Validate job data ────────────────────────────────────────────────────
  const costUsd = Math.max(0, data.costUsd);
  const promptTokens = Math.max(0, data.promptTokens);
  const completionTokens = Math.max(0, data.completionTokens);
  let totalTokens = Math.max(0, data.totalTokens);

  const expectedTotal = promptTokens + completionTokens;
  if (totalTokens !== expectedTotal) {
    console.warn("[analytics-worker] token mismatch — correcting to sum", {
      jobId: job.id,
      userId: data.userId,
      totalTokens,
      expectedTotal,
    });
    totalTokens = expectedTotal;
  }

  // ── 7.3 Create UsageLog record ───────────────────────────────────────────────
  await prisma.usageLog.create({
    data: {
      userId: data.userId,
      projectId: data.projectId ?? null,
      apiKeyId: data.apiKeyId ?? null,
      model: data.model,
      provider: data.provider,
      promptTokens,
      completionTokens,
      totalTokens,
      savedTokens: data.savedTokens,
      costUsd,
      latencyMs: data.latencyMs,
      statusCode: data.statusCode,
      optimized: data.optimized,
      routed: data.routed,
      fallback: data.fallback,
      ipAddress: data.ipAddress ?? null,
    },
  });

  // ── 7.4 Upsert DailyUsageCache ───────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const projectIdValue = data.projectId ?? null;

  await prisma.dailyUsageCache.upsert({
    where: {
      userId_projectId_date: {
        userId: data.userId,
        projectId: projectIdValue as string,
        date: today,
      },
    },
    create: {
      userId: data.userId,
      projectId: projectIdValue,
      date: today,
      totalTokens,
      totalRequests: 1,
      totalCostUsd: costUsd,
      savedTokens: data.savedTokens,
    },
    update: {
      totalTokens: { increment: totalTokens },
      totalRequests: { increment: 1 },
      totalCostUsd: { increment: costUsd },
      savedTokens: { increment: data.savedTokens },
      lastUpdated: new Date(),
    },
  });

  // ── 7.5 Record budget usage ──────────────────────────────────────────────────
  await recordBudgetUsage(data.userId, data.projectId, totalTokens, costUsd);

  // ── 7.7 Debug log ────────────────────────────────────────────────────────────
  const processingMs = Date.now() - startMs;
  console.debug("[analytics-worker]", {
    jobId: job.id,
    userId: data.userId,
    totalTokens,
    costUsd,
    processingMs,
  });
}

export const analyticsWorker = new Worker<AnalyticsJobData>(
  "analytics",
  processJob,
  {
    connection: redisConnection,
    concurrency: 20,
    // ── 7.8 Job retention ──────────────────────────────────────────────────────
    removeOnComplete: { count: 5000 },
    removeOnFail: { count: 10000 },
  },
);

// ── 7.6 Retry config + Sentry on exhaustion ──────────────────────────────────
analyticsWorker.on("failed", (job, err) => {
  console.error("[analytics-worker] job failed", {
    jobId: job?.id,
    attemptsMade: job?.attemptsMade,
    error: err.message,
  });

  const data = job?.data;
  if (data) {
    Sentry.captureException(err, {
      extra: {
        userId: data.userId,
        totalTokens: data.totalTokens,
        model: data.model,
      },
    });
  }
});

analyticsWorker.on("completed", (job) => {
  console.debug("[analytics-worker] job completed", { jobId: job.id });
});
