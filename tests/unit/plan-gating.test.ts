/**
 * Unit Tests — Plan Gating (checkQuota / checkFeatureAccess)
 * Task 15.8 from business-modules-core spec
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkQuota, checkFeatureAccess } from "@/lib/plan-guard";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn() },
    dailyUsageCache: { aggregate: vi.fn() },
    project: { count: vi.fn() },
    apiKey: { count: vi.fn() },
    webhook: { count: vi.fn() },
    team: { findFirst: vi.fn() },
    teamMember: { count: vi.fn() },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  },
}));

// ── Plan limit fixtures ───────────────────────────────────────────────────────

const FREE_LIMITS = {
  maxTokensPerMonth: 50000,
  maxRequestsPerDay: null,
  maxRequestsPerMinute: 60,
  maxProjects: 1,
  maxApiKeys: 3,
  maxWebhooks: 1,
  maxTeamMembers: 1,
  contextOptimizerEnabled: false,
  modelRouterEnabled: false,
  advancedAnalytics: false,
  auditLogsRetentionDays: 0,
};

const PRO_LIMITS = {
  maxTokensPerMonth: 2000000,
  maxRequestsPerDay: null,
  maxRequestsPerMinute: 300,
  maxProjects: 5,
  maxApiKeys: 10,
  maxWebhooks: null,
  maxTeamMembers: 3,
  contextOptimizerEnabled: true,
  modelRouterEnabled: true,
  advancedAnalytics: true,
  auditLogsRetentionDays: 30,
};

const TEAM_LIMITS = {
  maxTokensPerMonth: 10000000,
  maxRequestsPerDay: null,
  maxRequestsPerMinute: 1000,
  maxProjects: null,
  maxApiKeys: null,
  maxWebhooks: null,
  maxTeamMembers: null,
  contextOptimizerEnabled: true,
  modelRouterEnabled: true,
  advancedAnalytics: true,
  auditLogsRetentionDays: 90,
};

const ENTERPRISE_LIMITS = {
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
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// getPlanLimits calls prisma.plan.findUnique with include: { limits: true }
// and returns plan?.limits — so mock must return { limits: <limitsObj> }
function setupPlan(planType: string, limits: Record<string, unknown>) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    plan: planType,
  } as never);
  vi.mocked(prisma.plan.findUnique).mockResolvedValue({ limits } as never);
}

function setupTokenUsage(tokensUsed: number) {
  vi.mocked(prisma.dailyUsageCache.aggregate).mockResolvedValue({
    _sum: { totalTokens: tokensUsed },
  } as never);
}

beforeEach(() => vi.clearAllMocks());

// ── FREE plan ─────────────────────────────────────────────────────────────────

describe("FREE plan — token quota", () => {
  it("blocks at exactly 50K tokens (current >= limit)", async () => {
    setupPlan("FREE", FREE_LIMITS);
    setupTokenUsage(50000);

    const result = await checkQuota("user-1", "tokens_per_month");

    expect(result.allowed).toBe(false);
    expect((result as { quota: string }).quota).toBe("tokens_per_month");
    expect((result as { limit: number }).limit).toBe(50000);
  });

  it("blocks above 50K tokens", async () => {
    setupPlan("FREE", FREE_LIMITS);
    setupTokenUsage(75000);

    const result = await checkQuota("user-1", "tokens_per_month");

    expect(result.allowed).toBe(false);
  });

  it("allows below 50K tokens", async () => {
    setupPlan("FREE", FREE_LIMITS);
    setupTokenUsage(49999);

    const result = await checkQuota("user-1", "tokens_per_month");

    expect(result.allowed).toBe(true);
  });

  it("allows at 0 tokens", async () => {
    setupPlan("FREE", FREE_LIMITS);
    setupTokenUsage(0);

    const result = await checkQuota("user-1", "tokens_per_month");

    expect(result.allowed).toBe(true);
  });
});

// ── PRO plan ──────────────────────────────────────────────────────────────────

describe("PRO plan — token quota with overage", () => {
  it("returns allowed=true with overage=true at exactly 2M tokens", async () => {
    setupPlan("PRO", PRO_LIMITS);
    setupTokenUsage(2000000);

    const result = await checkQuota("user-1", "tokens_per_month");

    expect(result.allowed).toBe(true);
    expect((result as { overage?: boolean }).overage).toBe(true);
  });

  it("returns allowed=true with overage=true above 2M tokens", async () => {
    setupPlan("PRO", PRO_LIMITS);
    setupTokenUsage(3000000);

    const result = await checkQuota("user-1", "tokens_per_month");

    expect(result.allowed).toBe(true);
    expect((result as { overage?: boolean }).overage).toBe(true);
  });

  it("returns allowed=true without overage below 2M tokens", async () => {
    setupPlan("PRO", PRO_LIMITS);
    setupTokenUsage(1999999);

    const result = await checkQuota("user-1", "tokens_per_month");

    expect(result.allowed).toBe(true);
    expect((result as { overage?: boolean }).overage).toBeUndefined();
  });
});

// ── TEAM plan ─────────────────────────────────────────────────────────────────

describe("TEAM plan — token quota with overage", () => {
  it("returns allowed=true with overage=true at exactly 10M tokens", async () => {
    setupPlan("TEAM", TEAM_LIMITS);
    setupTokenUsage(10000000);

    const result = await checkQuota("user-1", "tokens_per_month");

    expect(result.allowed).toBe(true);
    expect((result as { overage?: boolean }).overage).toBe(true);
  });

  it("allows below 10M tokens without overage", async () => {
    setupPlan("TEAM", TEAM_LIMITS);
    setupTokenUsage(5000000);

    const result = await checkQuota("user-1", "tokens_per_month");

    expect(result.allowed).toBe(true);
    expect((result as { overage?: boolean }).overage).toBeUndefined();
  });
});

// ── ENTERPRISE plan ───────────────────────────────────────────────────────────

describe("ENTERPRISE plan — always allowed (null limit)", () => {
  it("allows any token count when limit is null", async () => {
    setupPlan("ENTERPRISE", ENTERPRISE_LIMITS);
    setupTokenUsage(999999999);

    const result = await checkQuota("user-1", "tokens_per_month");

    expect(result.allowed).toBe(true);
    expect((result as { overage?: boolean }).overage).toBeUndefined();
  });

  it("allows 0 tokens", async () => {
    setupPlan("ENTERPRISE", ENTERPRISE_LIMITS);
    setupTokenUsage(0);

    const result = await checkQuota("user-1", "tokens_per_month");

    expect(result.allowed).toBe(true);
  });
});

// ── Feature access ────────────────────────────────────────────────────────────

describe("Feature access by plan", () => {
  it("contextOptimizer is disabled on FREE plan", async () => {
    setupPlan("FREE", FREE_LIMITS);
    const result = await checkFeatureAccess("user-1", "contextOptimizer");
    expect(result).toBe(false);
  });

  it("contextOptimizer is enabled on PRO plan", async () => {
    setupPlan("PRO", PRO_LIMITS);
    const result = await checkFeatureAccess("user-1", "contextOptimizer");
    expect(result).toBe(true);
  });

  it("advancedAnalytics is disabled on FREE plan", async () => {
    setupPlan("FREE", FREE_LIMITS);
    const result = await checkFeatureAccess("user-1", "advancedAnalytics");
    expect(result).toBe(false);
  });

  it("advancedAnalytics is enabled on PRO plan", async () => {
    setupPlan("PRO", PRO_LIMITS);
    const result = await checkFeatureAccess("user-1", "advancedAnalytics");
    expect(result).toBe(true);
  });

  it("auditLogs is disabled on FREE plan (retentionDays=0)", async () => {
    setupPlan("FREE", FREE_LIMITS);
    const result = await checkFeatureAccess("user-1", "auditLogs");
    expect(result).toBe(false);
  });

  it("auditLogs is enabled on TEAM plan (retentionDays=90)", async () => {
    setupPlan("TEAM", TEAM_LIMITS);
    const result = await checkFeatureAccess("user-1", "auditLogs");
    expect(result).toBe(true);
  });
});

// ── Fail-open behavior ────────────────────────────────────────────────────────

describe("Fail-open — no plan limits found", () => {
  it("allows when plan limits are not found in DB", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      plan: "FREE",
    } as never);
    vi.mocked(prisma.plan.findUnique).mockResolvedValue(null);

    const result = await checkQuota("user-1", "tokens_per_month");

    expect(result.allowed).toBe(true);
  });
});
