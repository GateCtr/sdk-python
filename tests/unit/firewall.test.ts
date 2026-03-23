/**
 * Property-Based Tests for lib/firewall.ts
 * Validates: Requirements 7.2, 7.3, 7.5, 7.6, 7.11, 7.12, 7.13, 22.7, 22.8
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// vi.hoisted ensures these are available when vi.mock factories run
const {
  mockRedisSet,
  mockFindUniqueBudget,
  mockAggregateDailyUsage,
  mockUpsertDailyUsage,
  mockCheckQuota,
  mockDispatchWebhook,
  mockLogAudit,
} = vi.hoisted(() => ({
  mockRedisSet: vi.fn(),
  mockFindUniqueBudget: vi.fn(),
  mockAggregateDailyUsage: vi.fn(),
  mockUpsertDailyUsage: vi.fn(),
  mockCheckQuota: vi.fn(),
  mockDispatchWebhook: vi.fn(),
  mockLogAudit: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({ redis: { set: mockRedisSet } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    budget: { findUnique: mockFindUniqueBudget },
    dailyUsageCache: {
      aggregate: mockAggregateDailyUsage,
      upsert: mockUpsertDailyUsage,
    },
  },
}));
vi.mock("@/lib/plan-guard", () => ({ checkQuota: mockCheckQuota }));
vi.mock("@/lib/webhooks", () => ({ dispatchWebhook: mockDispatchWebhook }));
vi.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));

import { checkBudget, recordBudgetUsage } from "@/lib/firewall";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBudget(
  o: Partial<{
    id: string;
    userId: string | null;
    projectId: string | null;
    maxTokensPerMonth: number | null;
    maxCostPerMonth: number | null;
    alertThresholdPct: number;
    hardStop: boolean;
    notifyOnThreshold: boolean;
    notifyOnExceeded: boolean;
  }> = {},
) {
  return {
    id: "budget_1",
    userId: "user_1",
    projectId: null,
    maxTokensPerMonth: null,
    maxCostPerMonth: null,
    alertThresholdPct: 80,
    hardStop: false,
    notifyOnThreshold: true,
    notifyOnExceeded: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...o,
  };
}

function setup(opts: {
  userBudget?: ReturnType<typeof makeBudget> | null;
  projectBudget?: ReturnType<typeof makeBudget> | null;
  userTokens?: number;
  userCost?: number;
  projectTokens?: number;
  projectCost?: number;
  planAllowed?: boolean;
  redisSetResult?: string | null;
  /** Pass true when calling checkBudget with a projectId */
  withProject?: boolean;
}) {
  const {
    userBudget = null,
    projectBudget = null,
    userTokens = 0,
    userCost = 0,
    projectTokens = 0,
    projectCost = 0,
    planAllowed = true,
    redisSetResult = "OK",
    withProject = false,
  } = opts;

  // checkBudget calls findUnique once for user, and once for project only when projectId given
  mockFindUniqueBudget.mockResolvedValueOnce(userBudget);
  if (withProject) mockFindUniqueBudget.mockResolvedValueOnce(projectBudget);

  // aggregate called once for user, once for project only when projectId given
  mockAggregateDailyUsage.mockResolvedValueOnce({
    _sum: { totalTokens: userTokens, totalCostUsd: userCost },
  });
  if (withProject)
    mockAggregateDailyUsage.mockResolvedValueOnce({
      _sum: { totalTokens: projectTokens, totalCostUsd: projectCost },
    });

  mockCheckQuota.mockResolvedValue(
    planAllowed
      ? { allowed: true }
      : {
          allowed: false,
          quota: "tokens_per_month",
          limit: 1000,
          current: 1001,
        },
  );
  mockRedisSet.mockResolvedValue(redisSetResult);
  mockDispatchWebhook.mockResolvedValue(undefined);
  mockLogAudit.mockResolvedValue(undefined);
}

// ─── P7/P11: Hard Stop Enforcement ───────────────────────────────────────────

// Feature: core-api-budget-firewall, Property 7: Hard Stop Enforcement
// Feature: core-api-budget-firewall, Property 11: Hard Stop Enforcement
describe("P7/P11: Hard Stop Enforcement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks when user tokens >= maxTokensPerMonth and hardStop=true (>=100 iterations)", async () => {
    // **Validates: Requirements 7.2, 7.11, 22.7**
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 500_000 }),
        async (limit, extra) => {
          vi.clearAllMocks();
          setup({
            userBudget: makeBudget({
              maxTokensPerMonth: limit,
              hardStop: true,
            }),
            userTokens: limit + extra,
            redisSetResult: null,
          });
          const r = await checkBudget("user_1");
          expect(r.allowed).toBe(false);
          expect(r.scope).toBe("user");
          expect(r.limit).toBe(limit);
          expect(r.current).toBe(limit + extra);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("blocks when user cost >= maxCostPerMonth and hardStop=true (>=100 iterations)", async () => {
    // **Validates: Requirements 7.3, 22.7**
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 50_000 }),
        async (limitCents, extraCents) => {
          vi.clearAllMocks();
          setup({
            userBudget: makeBudget({
              maxCostPerMonth: limitCents / 100,
              hardStop: true,
            }),
            userCost: (limitCents + extraCents) / 100,
            redisSetResult: null,
          });
          const r = await checkBudget("user_1");
          expect(r.allowed).toBe(false);
          expect(r.scope).toBe("user");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("allows with overage=true when hardStop=false and limit exceeded (>=100 iterations)", async () => {
    // **Validates: Requirements 7.4**
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 500_000 }),
        async (limit, extra) => {
          vi.clearAllMocks();
          setup({
            userBudget: makeBudget({
              maxTokensPerMonth: limit,
              hardStop: false,
            }),
            userTokens: limit + extra,
            redisSetResult: null,
          });
          const r = await checkBudget("user_1");
          expect(r.allowed).toBe(true);
          expect(r.overage).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("allows when usage is strictly below limit (>=100 iterations)", async () => {
    // **Validates: Requirements 7.11 (positive case)**
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 1_000_000 }),
        fc.integer({ min: 0, max: 999_999 }),
        async (limit, current) => {
          fc.pre(current < limit);
          vi.clearAllMocks();
          setup({
            userBudget: makeBudget({
              maxTokensPerMonth: limit,
              hardStop: true,
            }),
            userTokens: current,
            redisSetResult: null,
          });
          const r = await checkBudget("user_1");
          expect(r.allowed).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── P15: Stricter-Wins ───────────────────────────────────────────────────────

// Feature: core-api-budget-firewall, Property 15: Budget Firewall Stricter-Wins
describe("P15: Stricter-Wins", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks when project hard-stops even if user has no limit (>=100 iterations)", async () => {
    // **Validates: Requirements 7.1, 22.2**
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 500_000 }),
        async (projLimit, extra) => {
          vi.clearAllMocks();
          mockFindUniqueBudget
            .mockResolvedValueOnce(makeBudget({ maxTokensPerMonth: null }))
            .mockResolvedValueOnce(
              makeBudget({
                id: "bp",
                projectId: "proj_1",
                userId: null,
                maxTokensPerMonth: projLimit,
                hardStop: true,
              }),
            );
          mockAggregateDailyUsage
            .mockResolvedValueOnce({
              _sum: { totalTokens: 0, totalCostUsd: 0 },
            })
            .mockResolvedValueOnce({
              _sum: { totalTokens: projLimit + extra, totalCostUsd: 0 },
            });
          mockCheckQuota.mockResolvedValue({ allowed: true });
          mockRedisSet.mockResolvedValue(null);
          mockDispatchWebhook.mockResolvedValue(undefined);
          mockLogAudit.mockResolvedValue(undefined);
          const r = await checkBudget("user_1", "proj_1");
          expect(r.allowed).toBe(false);
          expect(r.scope).toBe("project");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("blocks when user hard-stops even if project has no limit (>=100 iterations)", async () => {
    // **Validates: Requirements 7.1, 22.2**
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 500_000 }),
        async (userLimit, extra) => {
          vi.clearAllMocks();
          mockFindUniqueBudget
            .mockResolvedValueOnce(
              makeBudget({ maxTokensPerMonth: userLimit, hardStop: true }),
            )
            .mockResolvedValueOnce(
              makeBudget({
                id: "bp",
                projectId: "proj_1",
                userId: null,
                maxTokensPerMonth: null,
              }),
            );
          mockAggregateDailyUsage
            .mockResolvedValueOnce({
              _sum: { totalTokens: userLimit + extra, totalCostUsd: 0 },
            })
            .mockResolvedValueOnce({
              _sum: { totalTokens: 0, totalCostUsd: 0 },
            });
          mockCheckQuota.mockResolvedValue({ allowed: true });
          mockRedisSet.mockResolvedValue(null);
          mockDispatchWebhook.mockResolvedValue(undefined);
          mockLogAudit.mockResolvedValue(undefined);
          const r = await checkBudget("user_1", "proj_1");
          expect(r.allowed).toBe(false);
          expect(r.scope).toBe("user");
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── P16: Plan Quota Composition ─────────────────────────────────────────────

// Feature: core-api-budget-firewall, Property 16: Plan Quota and Budget Firewall Composition
describe("P16: Plan Quota Composition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns plan_quota when plan blocks regardless of budget (>=100 iterations)", async () => {
    // **Validates: Requirements 7.13**
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 999_999 }),
        async (userTokens) => {
          vi.clearAllMocks();
          setup({
            userBudget: makeBudget({
              maxTokensPerMonth: 2_000_000,
              hardStop: false,
            }),
            userTokens,
            planAllowed: false,
          });
          const r = await checkBudget("user_1");
          expect(r.allowed).toBe(false);
          expect(r.reason).toBe("plan_quota");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("allows when budget and plan quota both satisfied (>=100 iterations)", async () => {
    // **Validates: Requirements 7.13 (positive case)**
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 799_999 }), // below 80% of 1M → no threshold alert
        async (userTokens) => {
          vi.clearAllMocks();
          setup({
            userBudget: makeBudget({
              maxTokensPerMonth: 1_000_000,
              hardStop: true,
            }),
            userTokens,
            planAllowed: true,
            redisSetResult: null,
          });
          const r = await checkBudget("user_1");
          expect(r.allowed).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── P8/P12: Budget Alert Idempotence ────────────────────────────────────────

// Feature: core-api-budget-firewall, Property 8: Budget Alert Idempotence
// Feature: core-api-budget-firewall, Property 12: Budget Alert Idempotence
describe("P8/P12: Budget Alert Idempotence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches budget.threshold exactly once when SET NX succeeds (>=100 iterations)", async () => {
    // **Validates: Requirements 7.5, 7.12, 22.8**
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 1_000_000 }),
        fc.integer({ min: 1, max: 99 }),
        async (limit, thresholdPct) => {
          vi.clearAllMocks();
          // Add 1 to avoid floating-point boundary issues:
          // (Math.ceil(limit * pct / 100) / limit) * 100 can be slightly < pct
          const currentTokens = Math.ceil((limit * thresholdPct) / 100) + 1;
          setup({
            userBudget: makeBudget({
              maxTokensPerMonth: limit,
              alertThresholdPct: thresholdPct,
              hardStop: false,
              notifyOnThreshold: true,
            }),
            userTokens: currentTokens,
            redisSetResult: "OK",
          });
          await checkBudget("user_1");
          // flush microtasks — dispatchWebhook is fire-and-forget (.catch(() => {}))
          await new Promise((res) => setTimeout(res, 0));
          expect(mockDispatchWebhook).toHaveBeenCalledTimes(1);
          expect(mockDispatchWebhook).toHaveBeenCalledWith(
            "user_1",
            "budget.threshold",
            expect.objectContaining({ scope: "user" }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does NOT dispatch when SET NX returns null (already alerted) (>=100 iterations)", async () => {
    // **Validates: Requirements 7.5, 7.12, 22.8**
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 500_000 }),
        async (limit, extra) => {
          vi.clearAllMocks();
          setup({
            userBudget: makeBudget({
              maxTokensPerMonth: limit,
              alertThresholdPct: 80,
              hardStop: false,
            }),
            userTokens: limit + extra,
            redisSetResult: null,
          });
          await checkBudget("user_1");
          expect(mockDispatchWebhook).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does not dispatch when usage is below threshold (>=100 iterations)", async () => {
    // **Validates: Requirements 7.5**
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 1_000_000 }),
        fc.integer({ min: 0, max: 79 }),
        async (limit, pct) => {
          vi.clearAllMocks();
          const currentTokens = Math.floor((limit * pct) / 100);
          setup({
            userBudget: makeBudget({
              maxTokensPerMonth: limit,
              alertThresholdPct: 80,
              hardStop: false,
            }),
            userTokens: currentTokens,
            redisSetResult: "OK",
          });
          await checkBudget("user_1");
          expect(mockDispatchWebhook).not.toHaveBeenCalled();
          expect(mockRedisSet).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("dispatches budget.exceeded on hard stop when notifyOnExceeded=true", async () => {
    // **Validates: Requirements 7.7**
    setup({
      userBudget: makeBudget({
        maxTokensPerMonth: 1000,
        hardStop: true,
        notifyOnExceeded: true,
        alertThresholdPct: 80,
      }),
      userTokens: 1500,
      redisSetResult: null,
    });
    const r = await checkBudget("user_1");
    expect(r.allowed).toBe(false);
    await new Promise((res) => setTimeout(res, 0));
    expect(mockDispatchWebhook).toHaveBeenCalledWith(
      "user_1",
      "budget.exceeded",
      expect.objectContaining({ scope: "user" }),
    );
  });

  it("logs hard_stop to audit when hard stop triggered", async () => {
    // **Validates: Requirements 20.4**
    setup({
      userBudget: makeBudget({
        maxTokensPerMonth: 1000,
        hardStop: true,
        notifyOnExceeded: false,
        alertThresholdPct: 80,
      }),
      userTokens: 1500,
      redisSetResult: null,
    });
    const r = await checkBudget("user_1");
    expect(r.allowed).toBe(false);
    await new Promise((res) => setTimeout(res, 0));
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "budget",
        action: "hard_stop",
        userId: "user_1",
        success: false,
      }),
    );
  });
});

// ─── No budget records ────────────────────────────────────────────────────────

describe("checkBudget: no budget records", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows when no budgets exist and plan quota passes", async () => {
    setup({ userBudget: null, planAllowed: true, withProject: true });
    const r = await checkBudget("user_1", "proj_1");
    expect(r.allowed).toBe(true);
    expect(r.overage).toBeUndefined();
  });
});

// ─── recordBudgetUsage ────────────────────────────────────────────────────────

describe("recordBudgetUsage", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupRecord() {
    mockUpsertDailyUsage.mockResolvedValue({});
    mockFindUniqueBudget.mockResolvedValue(null);
    mockAggregateDailyUsage.mockResolvedValue({
      _sum: { totalTokens: 0, totalCostUsd: 0 },
    });
    mockCheckQuota.mockResolvedValue({ allowed: true });
    mockRedisSet.mockResolvedValue(null);
  }

  it("upserts DailyUsageCache with correct increments", async () => {
    setupRecord();
    await recordBudgetUsage("user_1", "proj_1", 500, 0.05);
    expect(mockUpsertDailyUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: "user_1",
          projectId: "proj_1",
          totalTokens: 500,
          totalRequests: 1,
          totalCostUsd: 0.05,
        }),
        update: expect.objectContaining({
          totalTokens: { increment: 500 },
          totalRequests: { increment: 1 },
          totalCostUsd: { increment: 0.05 },
        }),
      }),
    );
  });

  it("uses null for projectId when undefined is passed", async () => {
    setupRecord();
    await recordBudgetUsage("user_1", undefined, 100, 0.01);
    expect(mockUpsertDailyUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ projectId: null }),
      }),
    );
  });

  it("uses today's date in YYYY-MM-DD format", async () => {
    setupRecord();
    const today = new Date().toISOString().slice(0, 10);
    await recordBudgetUsage("user_1", undefined, 100, 0.01);
    expect(mockUpsertDailyUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ date: today }),
      }),
    );
  });
});
