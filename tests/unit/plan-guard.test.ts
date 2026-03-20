/**
 * Property-Based Tests for lib/plan-guard.ts
 *
 * Property 1:  Null limit means unlimited          (Req 5.2–5.8)
 * Property 2:  Quota enforcement correctness       (Req 5.1–5.8)
 * Property 3:  Plan limit cache round-trip         (Req 5.10)
 * Property 6:  Feature access matches plan limits  (Req 5.11)
 * Property 7:  Cache invalidation after plan change(Req 5.12, 7.6)
 * Property 13: Plan limits resolve from User.plan  (Req 2.4)
 * Property 15: Overage billing only for PRO/TEAM   (Req 11.1, 11.3)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedisGet = vi.fn();
const mockRedisSetex = vi.fn();
const mockRedisDel = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisIncr = vi.fn();
const mockRedisExpire = vi.fn();

vi.mock("@/lib/redis", () => ({
  redis: {
    get: mockRedisGet,
    setex: mockRedisSetex,
    del: mockRedisDel,
    set: mockRedisSet,
    incr: mockRedisIncr,
    expire: mockRedisExpire,
  },
}));

const mockUserFindUnique = vi.fn();
const mockPlanFindUnique = vi.fn();
const mockDailyUsageAggregate = vi.fn();
const mockProjectCount = vi.fn();
const mockApiKeyCount = vi.fn();
const mockWebhookCount = vi.fn();
const mockTeamFindFirst = vi.fn();
const mockTeamMemberCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    plan: { findUnique: mockPlanFindUnique },
    dailyUsageCache: { aggregate: mockDailyUsageAggregate },
    project: { count: mockProjectCount },
    apiKey: { count: mockApiKeyCount },
    webhook: { count: mockWebhookCount },
    team: { findFirst: mockTeamFindFirst },
    teamMember: { count: mockTeamMemberCount },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a PlanLimit-shaped object with all nulls (unlimited). */
function unlimitedLimits(overrides: Record<string, unknown> = {}) {
  return {
    id: "lim_unlimited",
    planId: "plan_enterprise",
    maxTokensPerMonth: null,
    maxRequestsPerDay: null,
    maxRequestsPerMinute: null,
    maxProjects: null,
    maxApiKeys: null,
    maxWebhooks: null,
    maxTeamMembers: null,
    contextOptimizerEnabled: true,
    modelRouterEnabled: true,
    advancedAnalytics: true,
    auditLogsRetentionDays: 365,
    ...overrides,
  };
}

/** Build a PlanLimit-shaped object with finite limits. */
function finiteLimits(overrides: Record<string, unknown> = {}) {
  return {
    id: "lim_free",
    planId: "plan_free",
    maxTokensPerMonth: 50_000,
    maxRequestsPerDay: 1_000,
    maxRequestsPerMinute: 10,
    maxProjects: 1,
    maxApiKeys: 1,
    maxWebhooks: 0,
    maxTeamMembers: 1,
    contextOptimizerEnabled: false,
    modelRouterEnabled: false,
    advancedAnalytics: false,
    auditLogsRetentionDays: 0,
    ...overrides,
  };
}

function setupUserAndPlan(planType: string, limits: object) {
  mockUserFindUnique.mockResolvedValue({ id: "user_test", plan: planType });
  mockRedisGet.mockResolvedValue(null); // cache miss
  mockPlanFindUnique.mockResolvedValue({ name: planType, limits });
  mockRedisSetex.mockResolvedValue("OK");
}

// ---------------------------------------------------------------------------
// Property 1: Null limit means unlimited
// ---------------------------------------------------------------------------

describe("Property 1: Null limit means unlimited", () => {
  beforeEach(() => vi.clearAllMocks());

  const nullableQuotaTypes = [
    "tokens_per_month",
    "requests_per_day",
    "projects",
    "api_keys",
    "webhooks",
    "team_members",
  ] as const;

  it("returns allowed:true for any usage when limit is null (>=100 iterations)", async () => {
    const { checkQuota } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nullableQuotaTypes),
        fc.nat({ max: 10_000_000 }), // arbitrary current usage
        async (quotaType, currentUsage) => {
          vi.clearAllMocks();
          setupUserAndPlan("ENTERPRISE", unlimitedLimits());

          // All count/aggregate mocks return the arbitrary usage
          mockDailyUsageAggregate.mockResolvedValue({
            _sum: { totalTokens: currentUsage, totalRequests: currentUsage },
          });
          mockProjectCount.mockResolvedValue(currentUsage);
          mockApiKeyCount.mockResolvedValue(currentUsage);
          mockWebhookCount.mockResolvedValue(currentUsage);
          mockTeamFindFirst.mockResolvedValue({ id: "team_1" });
          mockTeamMemberCount.mockResolvedValue(currentUsage);

          const result = await checkQuota("user_test", quotaType);
          expect(result.allowed).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns allowed:true for requests_per_minute when limit is null (>=100 iterations)", async () => {
    const { checkQuota } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 10_000 }), async (rpmCount) => {
        vi.clearAllMocks();
        setupUserAndPlan(
          "ENTERPRISE",
          unlimitedLimits({ maxRequestsPerMinute: null }),
        );
        mockRedisIncr.mockResolvedValue(rpmCount + 1);
        mockRedisExpire.mockResolvedValue(1);

        const result = await checkQuota("user_test", "requests_per_minute");
        expect(result.allowed).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Quota enforcement correctness
// ---------------------------------------------------------------------------

describe("Property 2: Quota enforcement correctness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows when current < limit for tokens_per_month (>=100 iterations)", async () => {
    const { checkQuota } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        async (limit) => {
          const current = fc.sample(fc.nat({ max: limit - 1 }), 1)[0];
          vi.clearAllMocks();
          setupUserAndPlan("FREE", finiteLimits({ maxTokensPerMonth: limit }));
          mockDailyUsageAggregate.mockResolvedValue({
            _sum: { totalTokens: current },
          });

          const result = await checkQuota("user_test", "tokens_per_month");
          expect(result.allowed).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("blocks FREE users when current >= limit for tokens_per_month (>=100 iterations)", async () => {
    const { checkQuota } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 500_000 }),
        async (limit, extra) => {
          const current = limit + extra;
          vi.clearAllMocks();
          setupUserAndPlan("FREE", finiteLimits({ maxTokensPerMonth: limit }));
          mockDailyUsageAggregate.mockResolvedValue({
            _sum: { totalTokens: current },
          });

          const result = await checkQuota("user_test", "tokens_per_month");
          expect(result.allowed).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("allows PRO/TEAM with overage flag when tokens_per_month exceeded (>=100 iterations)", async () => {
    const { checkQuota } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("PRO", "TEAM"),
        fc.integer({ min: 1, max: 20_000_000 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        async (plan, limit, extra) => {
          const current = limit + extra;
          vi.clearAllMocks();
          setupUserAndPlan(plan, finiteLimits({ maxTokensPerMonth: limit }));
          mockDailyUsageAggregate.mockResolvedValue({
            _sum: { totalTokens: current },
          });

          const result = await checkQuota("user_test", "tokens_per_month");
          expect(result.allowed).toBe(true);
          expect((result as { overage?: boolean }).overage).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("blocks when current >= limit for resource quotas (projects/api_keys/webhooks/team_members) (>=100 iterations)", async () => {
    const { checkQuota } = await import("@/lib/plan-guard");

    type ResourceQuota = "projects" | "api_keys" | "webhooks" | "team_members";
    const resourceQuotas: ResourceQuota[] = [
      "projects",
      "api_keys",
      "webhooks",
      "team_members",
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...resourceQuotas),
        fc.integer({ min: 1, max: 100 }),
        async (quotaType, limit) => {
          vi.clearAllMocks();
          setupUserAndPlan(
            "FREE",
            finiteLimits({
              maxProjects: limit,
              maxApiKeys: limit,
              maxWebhooks: limit,
              maxTeamMembers: limit,
            }),
          );
          // current = limit (at the boundary — should block)
          mockProjectCount.mockResolvedValue(limit);
          mockApiKeyCount.mockResolvedValue(limit);
          mockWebhookCount.mockResolvedValue(limit);
          mockTeamFindFirst.mockResolvedValue({ id: "team_1" });
          mockTeamMemberCount.mockResolvedValue(limit);

          const result = await checkQuota("user_test", quotaType);
          expect(result.allowed).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Plan limit cache round-trip
// ---------------------------------------------------------------------------

describe("Property 3: Plan limit cache round-trip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached limits without hitting DB on cache hit (>=100 iterations)", async () => {
    const { getPlanLimits } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("FREE", "PRO", "TEAM", "ENTERPRISE"),
        async (planType) => {
          vi.clearAllMocks();
          const cached = finiteLimits({ planId: `plan_${planType}` });
          mockRedisGet.mockResolvedValue(cached);

          const result = await getPlanLimits(planType as never);

          // Must return cached value
          expect(result).toEqual(cached);
          // Must NOT hit DB
          expect(mockPlanFindUnique).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("writes DB result to Redis on cache miss (>=100 iterations)", async () => {
    const { getPlanLimits } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("FREE", "PRO", "TEAM", "ENTERPRISE"),
        async (planType) => {
          vi.clearAllMocks();
          const dbLimits = finiteLimits({ planId: `plan_${planType}` });
          mockRedisGet.mockResolvedValue(null); // cache miss
          mockPlanFindUnique.mockResolvedValue({
            name: planType,
            limits: dbLimits,
          });
          mockRedisSetex.mockResolvedValue("OK");

          const result = await getPlanLimits(planType as never);

          expect(result).toEqual(dbLimits);
          // Must write back to Redis with correct TTL (300s)
          expect(mockRedisSetex).toHaveBeenCalledWith(
            `plan_limits:${planType}`,
            300,
            expect.any(String),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("fails open when Redis is unavailable — still returns DB result (>=100 iterations)", async () => {
    const { getPlanLimits } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("FREE", "PRO", "TEAM"),
        async (planType) => {
          vi.clearAllMocks();
          const dbLimits = finiteLimits();
          mockRedisGet.mockRejectedValue(new Error("Redis connection refused"));
          mockPlanFindUnique.mockResolvedValue({
            name: planType,
            limits: dbLimits,
          });
          mockRedisSetex.mockRejectedValue(
            new Error("Redis connection refused"),
          );

          // Must not throw — fail-open
          const result = await getPlanLimits(planType as never);
          expect(result).toEqual(dbLimits);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Feature access matches plan limits
// ---------------------------------------------------------------------------

describe("Property 6: Feature access matches plan limits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true only when the boolean feature flag is true in PlanLimit (>=100 iterations)", async () => {
    const { checkFeatureAccess } = await import("@/lib/plan-guard");

    type FeatureKey =
      | "contextOptimizer"
      | "modelRouter"
      | "advancedAnalytics"
      | "auditLogs";
    const features: FeatureKey[] = [
      "contextOptimizer",
      "modelRouter",
      "advancedAnalytics",
      "auditLogs",
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...features),
        fc.boolean(),
        async (feature, flagValue) => {
          vi.clearAllMocks();
          const limits = finiteLimits({
            contextOptimizerEnabled:
              feature === "contextOptimizer" ? flagValue : false,
            modelRouterEnabled: feature === "modelRouter" ? flagValue : false,
            advancedAnalytics:
              feature === "advancedAnalytics" ? flagValue : false,
            auditLogsRetentionDays:
              feature === "auditLogs" ? (flagValue ? 90 : 0) : 0,
          });
          setupUserAndPlan("PRO", limits);

          const result = await checkFeatureAccess("user_test", feature);
          expect(result).toBe(flagValue);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns false when plan limits are not found", async () => {
    const { checkFeatureAccess } = await import("@/lib/plan-guard");
    vi.clearAllMocks();

    mockUserFindUnique.mockResolvedValue({ id: "user_test", plan: "FREE" });
    mockRedisGet.mockResolvedValue(null);
    mockPlanFindUnique.mockResolvedValue(null); // no plan found

    const result = await checkFeatureAccess("user_test", "contextOptimizer");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property 7: Cache invalidation after plan change
// ---------------------------------------------------------------------------

describe("Property 7: Cache invalidation after plan change", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the correct Redis key for any plan type (>=100 iterations)", async () => {
    const { invalidatePlanCache } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("FREE", "PRO", "TEAM", "ENTERPRISE"),
        async (planType) => {
          vi.clearAllMocks();
          mockRedisDel.mockResolvedValue(1);

          await invalidatePlanCache(planType);

          expect(mockRedisDel).toHaveBeenCalledWith(`plan_limits:${planType}`);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("fails open when Redis del throws (>=100 iterations)", async () => {
    const { invalidatePlanCache } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("FREE", "PRO", "TEAM", "ENTERPRISE"),
        async (planType) => {
          vi.clearAllMocks();
          mockRedisDel.mockRejectedValue(new Error("Redis unavailable"));

          // Must not throw
          await expect(invalidatePlanCache(planType)).resolves.toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("forces DB re-fetch after invalidation (>=100 iterations)", async () => {
    const { invalidatePlanCache, getPlanLimits } =
      await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("FREE", "PRO", "TEAM"),
        async (planType) => {
          vi.clearAllMocks();
          mockRedisDel.mockResolvedValue(1);
          mockRedisGet.mockResolvedValue(null); // cache miss after invalidation
          const freshLimits = finiteLimits({
            planId: `plan_${planType}_fresh`,
          });
          mockPlanFindUnique.mockResolvedValue({
            name: planType,
            limits: freshLimits,
          });
          mockRedisSetex.mockResolvedValue("OK");

          await invalidatePlanCache(planType);
          const result = await getPlanLimits(planType as never);

          // After invalidation, must fetch from DB
          expect(mockPlanFindUnique).toHaveBeenCalled();
          expect(result).toEqual(freshLimits);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Plan limits resolve from User.plan
// ---------------------------------------------------------------------------

describe("Property 13: Plan limits resolve from User.plan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getUserPlanType returns the plan stored on the User record (>=100 iterations)", async () => {
    const { getUserPlanType } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("FREE", "PRO", "TEAM", "ENTERPRISE"),
        fc.string({ minLength: 5, maxLength: 20 }),
        async (plan, userId) => {
          vi.clearAllMocks();
          mockUserFindUnique.mockResolvedValue({ id: userId, plan });

          const result = await getUserPlanType(userId);
          expect(result).toBe(plan);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("defaults to FREE when user is not found", async () => {
    const { getUserPlanType } = await import("@/lib/plan-guard");
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(null);

    const result = await getUserPlanType("nonexistent_user");
    expect(result).toBe("FREE");
  });

  it("checkQuota uses User.plan to resolve limits — different plans yield different results (>=100 iterations)", async () => {
    const { checkQuota } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        async (currentCount) => {
          // FREE plan: maxProjects = 1 → blocked when currentCount >= 1
          vi.clearAllMocks();
          mockUserFindUnique.mockResolvedValue({
            id: "user_test",
            plan: "FREE",
          });
          mockRedisGet.mockResolvedValue(null);
          mockPlanFindUnique.mockResolvedValue({
            name: "FREE",
            limits: finiteLimits({ maxProjects: 1 }),
          });
          mockRedisSetex.mockResolvedValue("OK");
          mockProjectCount.mockResolvedValue(currentCount);

          const freeResult = await checkQuota("user_test", "projects");

          // ENTERPRISE plan: maxProjects = null → always allowed
          vi.clearAllMocks();
          mockUserFindUnique.mockResolvedValue({
            id: "user_test",
            plan: "ENTERPRISE",
          });
          mockRedisGet.mockResolvedValue(null);
          mockPlanFindUnique.mockResolvedValue({
            name: "ENTERPRISE",
            limits: unlimitedLimits(),
          });
          mockRedisSetex.mockResolvedValue("OK");
          mockProjectCount.mockResolvedValue(currentCount);

          const enterpriseResult = await checkQuota("user_test", "projects");

          // Enterprise is always allowed; FREE is blocked when at/over limit
          expect(enterpriseResult.allowed).toBe(true);
          if (currentCount >= 1) {
            expect(freeResult.allowed).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Overage billing only for PRO/TEAM
// ---------------------------------------------------------------------------

describe("Property 15: Overage billing only for PRO/TEAM", () => {
  beforeEach(() => vi.clearAllMocks());

  it("FREE plan is blocked (not overage) when tokens_per_month exceeded (>=100 iterations)", async () => {
    const { checkQuota } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50_000 }),
        fc.integer({ min: 1, max: 50_000 }),
        async (limit, extra) => {
          const current = limit + extra;
          vi.clearAllMocks();
          setupUserAndPlan("FREE", finiteLimits({ maxTokensPerMonth: limit }));
          mockDailyUsageAggregate.mockResolvedValue({
            _sum: { totalTokens: current },
          });

          const result = await checkQuota("user_test", "tokens_per_month");

          // FREE must be blocked, not overage
          expect(result.allowed).toBe(false);
          expect((result as { overage?: boolean }).overage).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("PRO plan returns allowed:true with overage:true when tokens_per_month exceeded (>=100 iterations)", async () => {
    const { checkQuota } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 2_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        async (limit, extra) => {
          const current = limit + extra;
          vi.clearAllMocks();
          setupUserAndPlan("PRO", finiteLimits({ maxTokensPerMonth: limit }));
          mockDailyUsageAggregate.mockResolvedValue({
            _sum: { totalTokens: current },
          });

          const result = await checkQuota("user_test", "tokens_per_month");

          expect(result.allowed).toBe(true);
          expect((result as { overage?: boolean }).overage).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("TEAM plan returns allowed:true with overage:true when tokens_per_month exceeded (>=100 iterations)", async () => {
    const { checkQuota } = await import("@/lib/plan-guard");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 1, max: 5_000_000 }),
        async (limit, extra) => {
          const current = limit + extra;
          vi.clearAllMocks();
          setupUserAndPlan("TEAM", finiteLimits({ maxTokensPerMonth: limit }));
          mockDailyUsageAggregate.mockResolvedValue({
            _sum: { totalTokens: current },
          });

          const result = await checkQuota("user_test", "tokens_per_month");

          expect(result.allowed).toBe(true);
          expect((result as { overage?: boolean }).overage).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
