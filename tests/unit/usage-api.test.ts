/**
 * Unit Tests — Usage API (GET /api/v1/usage)
 * Task 15.7 from business-modules-core spec
 *
 * Tests: default date range, projectId ownership (403), budgetStatus inclusion
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks — must be declared before any imports that use them ─────────────────

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/team-context", () => ({
  resolveTeamContext: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    project: { findFirst: vi.fn() },
    teamMember: { findMany: vi.fn(), findFirst: vi.fn() },
    dailyUsageCache: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    usageLog: { groupBy: vi.fn() },
    budget: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: vi.fn(),
  requireScope: vi.fn(),
  ApiAuthError: class ApiAuthError extends Error {
    code: string;
    httpStatus: number;
    constructor(code: string, httpStatus: number) {
      super(code);
      this.code = code;
      this.httpStatus = httpStatus;
    }
  },
}));

vi.mock("@/lib/plan-guard", () => ({
  checkFeatureAccess: vi.fn(),
}));

// ── Imports (hoisted by module system, but vi.mock runs first) ────────────────

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/plan-guard";
import { resolveTeamContext } from "@/lib/team-context";
import { GET } from "@/app/api/v1/usage/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/v1/usage");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

function setupAuth(userId = "user-db-1") {
  vi.mocked(auth).mockResolvedValue({ userId: "clerk-1" } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: userId } as never);
  vi.mocked(resolveTeamContext).mockResolvedValue({
    userId,
    teamId: "team-1",
  });
  vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
    { userId } as never,
  ]);
}

function setupEmptyUsage() {
  vi.mocked(prisma.dailyUsageCache.aggregate).mockResolvedValue({
    _sum: { totalTokens: 0, totalRequests: 0, totalCostUsd: 0, savedTokens: 0 },
  } as never);
  vi.mocked(prisma.dailyUsageCache.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.usageLog.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.budget.findUnique).mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkFeatureAccess).mockResolvedValue(false); // Free plan by default
});

// ── Default date range ────────────────────────────────────────────────────────

describe("Default date range", () => {
  it("uses current month start and today when no params provided", async () => {
    setupAuth();
    setupEmptyUsage();

    const res = await GET(makeRequest());
    const body = await res.json();

    const now = new Date();
    const expectedFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const expectedTo = now.toISOString().slice(0, 10);

    expect(res.status).toBe(200);
    expect(body.from).toBe(expectedFrom);
    expect(body.to).toBe(expectedTo);
  });

  it("respects explicit from/to params", async () => {
    setupAuth();
    setupEmptyUsage();

    const res = await GET(
      makeRequest({ from: "2025-01-01", to: "2025-01-31" }),
    );
    const body = await res.json();

    expect(body.from).toBe("2025-01-01");
    expect(body.to).toBe("2025-01-31");
  });

  it("returns zero totals when no usage data", async () => {
    setupAuth();
    setupEmptyUsage();

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.totalTokens).toBe(0);
    expect(body.totalRequests).toBe(0);
    expect(body.totalCostUsd).toBe(0);
    expect(body.savedTokens).toBe(0);
  });
});

// ── projectId ownership ───────────────────────────────────────────────────────

describe("projectId ownership enforcement", () => {
  it("returns 403 when projectId does not belong to user", async () => {
    setupAuth();
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null);

    const res = await GET(makeRequest({ projectId: "proj-other" }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("project_not_found");
  });

  it("returns 200 when projectId belongs to user", async () => {
    setupAuth();
    vi.mocked(prisma.project.findFirst).mockResolvedValue({
      id: "proj-1",
    } as never);
    setupEmptyUsage();

    const res = await GET(makeRequest({ projectId: "proj-1" }));

    expect(res.status).toBe(200);
  });
});

// ── budgetStatus inclusion ────────────────────────────────────────────────────

describe("budgetStatus in response", () => {
  it("omits budgetStatus when no Budget record exists", async () => {
    setupAuth();
    setupEmptyUsage();

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.budgetStatus).toBeUndefined();
  });

  it("includes budgetStatus when Budget record exists", async () => {
    setupAuth();

    vi.mocked(prisma.dailyUsageCache.aggregate)
      .mockResolvedValueOnce({
        _sum: {
          totalTokens: 0,
          totalRequests: 0,
          totalCostUsd: 0,
          savedTokens: 0,
        },
      } as never)
      .mockResolvedValueOnce({
        _sum: { totalTokens: 25000, totalCostUsd: 0.5 },
      } as never);
    vi.mocked(prisma.dailyUsageCache.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.usageLog.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.budget.findUnique).mockResolvedValue({
      maxTokensPerMonth: 50000,
      maxCostPerMonth: null,
      alertThresholdPct: 80,
      hardStop: true,
    } as never);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.budgetStatus).toBeDefined();
    expect(body.budgetStatus.maxTokensPerMonth).toBe(50000);
    expect(body.budgetStatus.tokensUsed).toBe(25000);
    expect(body.budgetStatus.alertThresholdPct).toBe(80);
    expect(body.budgetStatus.hardStop).toBe(true);
    expect(body.budgetStatus.tokensPct).toBe(50);
  });

  it("computes tokensPct correctly at 90%", async () => {
    setupAuth();

    vi.mocked(prisma.dailyUsageCache.aggregate)
      .mockResolvedValueOnce({
        _sum: {
          totalTokens: 0,
          totalRequests: 0,
          totalCostUsd: 0,
          savedTokens: 0,
        },
      } as never)
      .mockResolvedValueOnce({
        _sum: { totalTokens: 90000, totalCostUsd: 2.7 },
      } as never);
    vi.mocked(prisma.dailyUsageCache.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.usageLog.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.budget.findUnique).mockResolvedValue({
      maxTokensPerMonth: 100000,
      maxCostPerMonth: null,
      alertThresholdPct: 80,
      hardStop: false,
    } as never);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.budgetStatus.tokensPct).toBe(90);
  });
});

// ── Advanced analytics plan gate ──────────────────────────────────────────────

describe("Advanced analytics plan gate", () => {
  it("omits byModel and byProvider for Free plan users", async () => {
    setupAuth();
    setupEmptyUsage();
    vi.mocked(checkFeatureAccess).mockResolvedValue(false);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.byModel).toBeUndefined();
    expect(body.byProvider).toBeUndefined();
  });

  it("includes byModel and byProvider for Pro+ users", async () => {
    setupAuth();
    vi.mocked(checkFeatureAccess).mockResolvedValue(true);

    vi.mocked(prisma.dailyUsageCache.aggregate).mockResolvedValue({
      _sum: {
        totalTokens: 1000,
        totalRequests: 5,
        totalCostUsd: 0.02,
        savedTokens: 100,
      },
    } as never);
    vi.mocked(prisma.dailyUsageCache.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.budget.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.usageLog.groupBy)
      .mockResolvedValueOnce([
        {
          model: "gpt-4",
          provider: "openai",
          _sum: { totalTokens: 1000, costUsd: 0.02, savedTokens: 100 },
          _count: { id: 5 },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          provider: "openai",
          _sum: { totalTokens: 1000, costUsd: 0.02 },
          _count: { id: 5 },
        },
      ] as never);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.byModel).toBeDefined();
    expect(body.byModel).toHaveLength(1);
    expect(body.byModel[0].model).toBe("gpt-4");
    expect(body.byProvider).toBeDefined();
    expect(body.byProvider[0].provider).toBe("openai");
  });
});

// ── Authentication ────────────────────────────────────────────────────────────

describe("Authentication", () => {
  it("returns 401 when no Clerk session", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when Clerk user not found in DB", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk-1" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(resolveTeamContext).mockResolvedValue(null);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("No active team");
  });
});
