import { Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { HealthStatus } from "@prisma/client";
import { redisConnection, healthQueue, HealthJobData } from "@/lib/queues";

const SERVICES = ["app", "database", "redis", "queue", "stripe"] as const;
type ServiceName = (typeof SERVICES)[number];
type CheckResult = { status: HealthStatus; latencyMs: number };

// ─── Per-service health checks ────────────────────────────────────────────────

async function checkApp(): Promise<CheckResult> {
  const start = Date.now();
  return { status: HealthStatus.HEALTHY, latencyMs: Date.now() - start };
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: HealthStatus.HEALTHY, latencyMs: Date.now() - start };
  } catch {
    return { status: HealthStatus.DOWN, latencyMs: Date.now() - start };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const pong = await redisConnection.ping();
    const status =
      pong === "PONG" ? HealthStatus.HEALTHY : HealthStatus.DEGRADED;
    return { status, latencyMs: Date.now() - start };
  } catch {
    return { status: HealthStatus.DOWN, latencyMs: Date.now() - start };
  }
}

async function checkQueue(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await healthQueue.getJobCounts();
    return { status: HealthStatus.HEALTHY, latencyMs: Date.now() - start };
  } catch {
    return { status: HealthStatus.DEGRADED, latencyMs: Date.now() - start };
  }
}

async function checkStripe(): Promise<CheckResult> {
  const start = Date.now();
  try {
    // Use Stripe API directly — more reliable than status page
    const res = await fetch("https://api.stripe.com/v1/payment_methods", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    // 200 or 400 (bad request) both mean Stripe is reachable
    const reachable = res.status < 500;
    return {
      status: reachable ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
      latencyMs: Date.now() - start,
    };
  } catch {
    return { status: HealthStatus.DEGRADED, latencyMs: Date.now() - start };
  }
}

const checkers: Record<ServiceName, () => Promise<CheckResult>> = {
  app: checkApp,
  database: checkDatabase,
  redis: checkRedis,
  queue: checkQueue,
  stripe: checkStripe,
};

// ─── Worker ───────────────────────────────────────────────────────────────────

export const healthWorker = new Worker<HealthJobData>(
  "health",
  async () => {
    const results = await Promise.allSettled(
      SERVICES.map(async (service) => {
        const { status, latencyMs } = await checkers[service]();
        await prisma.systemHealth.create({
          data: {
            service,
            status,
            latencyMs,
            checkedAt: new Date(),
          },
        });
      }),
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error(`[health.worker] ${failed.length} check(s) failed`, failed);
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
    skipVersionCheck: true,
  },
);

// ─── Schedule repeatable job (every 60s) ─────────────────────────────────────

export async function scheduleHealthCheck(): Promise<void> {
  // Remove stale repeatable jobs before re-adding
  const repeatables = await healthQueue.getRepeatableJobs();
  for (const job of repeatables) {
    await healthQueue.removeRepeatableByKey(job.key);
  }

  // Repeatable job every 60s
  await healthQueue.add(
    "health-check",
    { triggeredAt: new Date().toISOString() },
    {
      repeat: { every: 60_000 },
      jobId: "health-check-repeatable",
    },
  );

  // Immediate job on startup so the status page is never empty
  await healthQueue.add(
    "health-check-startup",
    { triggeredAt: new Date().toISOString() },
    { jobId: `health-check-startup-${Date.now()}` },
  );

  console.info("[health.worker] health check scheduled every 60s");
}
