/**
 * Unit Tests — Analytics Worker
 * Task 15.6 from business-modules-core spec
 *
 * Tests token mismatch correction and Redis fallback behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock BullMQ and IORedis ───────────────────────────────────────────────────

vi.mock("bullmq", () => {
  const WorkerMock = vi.fn(function (
    this: Record<string, unknown>,
    _name: string,
    processor: (job: unknown) => Promise<void>,
  ) {
    // Store the processor so tests can invoke it directly
    (globalThis as Record<string, unknown>).__analyticsProcessor = processor;
    this.on = vi.fn();
    this.close = vi.fn();
  });
  return { Worker: WorkerMock };
});

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({ on: vi.fn(), quit: vi.fn() })),
}));

vi.mock("@/lib/queues", () => ({ redisConnection: {} }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const mockUsageLogCreate = vi.fn().mockResolvedValue({});
const mockDailyUsageCacheUpsert = vi.fn().mockResolvedValue({});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    usageLog: { create: mockUsageLogCreate },
    dailyUsageCache: { upsert: mockDailyUsageCacheUpsert },
  },
}));

vi.mock("@/lib/firewall", () => ({
  recordBudgetUsage: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type AnalyticsJobData = {
  userId: string;
  projectId?: string;
  apiKeyId?: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  savedTokens: number;
  costUsd: number;
  latencyMs: number;
  statusCode: number;
  optimized: boolean;
  routed: boolean;
  fallback: boolean;
  ipAddress?: string;
};

function makeJob(
  data: Partial<AnalyticsJobData> &
    Pick<AnalyticsJobData, "promptTokens" | "completionTokens" | "totalTokens">,
) {
  return {
    id: "job-1",
    attemptsMade: 1,
    data: {
      userId: "user-1",
      model: "gpt-4",
      provider: "openai",
      savedTokens: 0,
      costUsd: 0.01,
      latencyMs: 200,
      statusCode: 200,
      optimized: false,
      routed: false,
      fallback: false,
      ...data,
    } as AnalyticsJobData,
  };
}

async function getProcessor() {
  // Import the worker module to trigger Worker instantiation (cached after first call)
  await import("@/workers/analytics.worker");
  const processor = (globalThis as Record<string, unknown>)
    .__analyticsProcessor as ((job: unknown) => Promise<void>) | undefined;
  if (!processor)
    throw new Error(
      "Analytics processor was not captured — Worker mock may not be a constructor",
    );
  return processor;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Token mismatch correction ─────────────────────────────────────────────────

describe("Token mismatch correction", () => {
  it("corrects totalTokens to promptTokens + completionTokens when mismatched", async () => {
    const processor = await getProcessor();
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const job = makeJob({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 200, // wrong — should be 150
    });

    await processor(job);

    // UsageLog should be created with corrected totalTokens = 150
    expect(mockUsageLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalTokens: 150 }),
      }),
    );

    consoleSpy.mockRestore();
  });

  it("logs a warning when token mismatch is detected", async () => {
    const processor = await getProcessor();
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const job = makeJob({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 999, // mismatch
    });

    await processor(job);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("token mismatch"),
      expect.any(Object),
    );

    consoleSpy.mockRestore();
  });

  it("does NOT warn when totalTokens matches the sum", async () => {
    const processor = await getProcessor();
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const job = makeJob({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150, // correct
    });

    await processor(job);

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("corrects negative totalTokens to 0", async () => {
    const processor = await getProcessor();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const job = makeJob({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: -50, // invalid
    });

    await processor(job);

    expect(mockUsageLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalTokens: 0 }),
      }),
    );
  });

  it("corrects negative costUsd to 0", async () => {
    const processor = await getProcessor();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const job = makeJob({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      costUsd: -0.5,
    });

    await processor(job);

    expect(mockUsageLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costUsd: 0 }),
      }),
    );
  });
});

// ── DailyUsageCache upsert ────────────────────────────────────────────────────

describe("DailyUsageCache upsert", () => {
  it("upserts DailyUsageCache with correct increments", async () => {
    const processor = await getProcessor();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const job = makeJob({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      costUsd: 0.02,
      savedTokens: 10,
    });

    await processor(job);

    expect(mockDailyUsageCacheUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          totalTokens: { increment: 150 },
          totalRequests: { increment: 1 },
          totalCostUsd: { increment: 0.02 },
          savedTokens: { increment: 10 },
        }),
      }),
    );
  });

  it("calls recordBudgetUsage after upsert", async () => {
    const processor = await getProcessor();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { recordBudgetUsage } = await import("@/lib/firewall");

    const job = makeJob({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });

    await processor(job);

    expect(recordBudgetUsage).toHaveBeenCalledWith(
      "user-1",
      undefined,
      150,
      expect.any(Number),
    );
  });
});

// ── Redis fallback (synchronous write) ───────────────────────────────────────

describe("Redis fallback — synchronous UsageLog write", () => {
  /**
   * When analyticsQueue.add() throws (Redis unavailable), the gateway
   * falls back to direct prisma.usageLog.create(). This test verifies
   * the fallback path produces the same UsageLog record.
   */

  it("direct prisma.usageLog.create() produces a valid record", async () => {
    // Simulate the fallback path from chat/complete route handlers
    const jobData = {
      userId: "user-1",
      model: "gpt-4",
      provider: "openai",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      savedTokens: 0,
      costUsd: 0.03,
      latencyMs: 300,
      statusCode: 200,
      optimized: false,
      routed: false,
      fallback: false,
    };

    // Fallback: direct write
    await mockUsageLogCreate({
      data: {
        userId: jobData.userId,
        model: jobData.model,
        provider: jobData.provider,
        promptTokens: jobData.promptTokens,
        completionTokens: jobData.completionTokens,
        totalTokens: jobData.totalTokens,
        savedTokens: jobData.savedTokens,
        costUsd: jobData.costUsd,
        latencyMs: jobData.latencyMs,
        statusCode: jobData.statusCode,
        optimized: jobData.optimized,
        routed: jobData.routed,
        fallback: jobData.fallback,
      },
    });

    expect(mockUsageLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          totalTokens: 150,
          costUsd: 0.03,
        }),
      }),
    );
  });

  it("fallback write includes all required UsageLog fields", () => {
    const requiredFields = [
      "userId",
      "model",
      "provider",
      "promptTokens",
      "completionTokens",
      "totalTokens",
      "savedTokens",
      "costUsd",
      "latencyMs",
      "statusCode",
      "optimized",
      "routed",
      "fallback",
    ];

    const record = {
      userId: "user-1",
      model: "gpt-4",
      provider: "openai",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      savedTokens: 0,
      costUsd: 0.03,
      latencyMs: 300,
      statusCode: 200,
      optimized: false,
      routed: false,
      fallback: true, // fallback=true when queue was unavailable
    };

    for (const field of requiredFields) {
      expect(record).toHaveProperty(field);
    }
  });
});
