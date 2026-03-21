/**
 * Property-Based Tests for lib/rate-limiter.ts
 *
 * Property 13: Rate Limit Sliding Window
 *   - N requests within a 60-second window SHALL all be allowed
 *   - The (N+1)th request within that window SHALL return allowed: false
 *
 * Validates: Requirements 9.1, 9.7, 9.8
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPipelineZadd = vi.fn();
const mockPipelineZremrangebyscore = vi.fn();
const mockPipelineZcount = vi.fn();
const mockPipelineExpire = vi.fn();
const mockPipelineExec = vi.fn();

const mockPipeline = vi.fn(() => ({
  zadd: mockPipelineZadd,
  zremrangebyscore: mockPipelineZremrangebyscore,
  zcount: mockPipelineZcount,
  expire: mockPipelineExpire,
  exec: mockPipelineExec,
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    pipeline: mockPipeline,
  },
}));

const mockCheckQuota = vi.fn();

vi.mock("@/lib/plan-guard", () => ({
  checkQuota: mockCheckQuota,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn(),
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Set up the pipeline mock to return a given ZCOUNT value at index 2.
 */
function setupPipelineWithCount(count: number) {
  mockPipelineZadd.mockReturnThis();
  mockPipelineZremrangebyscore.mockReturnThis();
  mockPipelineZcount.mockReturnThis();
  mockPipelineExpire.mockReturnThis();
  // exec returns array: [zadd_result, zremrangebyscore_result, zcount_result, expire_result]
  mockPipelineExec.mockResolvedValue([1, 0, count, 1]);
}

// ─── Property 13: Rate Limit Sliding Window ───────────────────────────────────

// Feature: core-api-budget-firewall, Property 13: Rate Limit Sliding Window
describe("Property 13: Rate Limit Sliding Window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.mockReturnValue({
      zadd: mockPipelineZadd,
      zremrangebyscore: mockPipelineZremrangebyscore,
      zcount: mockPipelineZcount,
      expire: mockPipelineExpire,
      exec: mockPipelineExec,
    });
  });

  it("allows requests when count <= limit (>=100 iterations)", async () => {
    // **Validates: Requirements 9.7, 9.8**
    const { slidingWindow } = await import("@/lib/rate-limiter");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }), // limit N
        async (limit) => {
          // count = limit (exactly at the boundary — still allowed)
          vi.clearAllMocks();
          mockPipeline.mockReturnValue({
            zadd: mockPipelineZadd,
            zremrangebyscore: mockPipelineZremrangebyscore,
            zcount: mockPipelineZcount,
            expire: mockPipelineExpire,
            exec: mockPipelineExec,
          });
          setupPipelineWithCount(limit);

          const result = await slidingWindow(
            `ratelimit:key:test:rpm`,
            limit,
            60_000,
          );

          expect(result.allowed).toBe(true);
          expect(result.limit).toBe(limit);
          expect(result.remaining).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("blocks the (N+1)th request when count > limit (>=100 iterations)", async () => {
    // **Validates: Requirements 9.7, 9.8**
    const { slidingWindow } = await import("@/lib/rate-limiter");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }), // limit N
        fc.integer({ min: 1, max: 50 }), // extra requests beyond limit
        async (limit, extra) => {
          const count = limit + extra; // N+extra requests → should be blocked
          vi.clearAllMocks();
          mockPipeline.mockReturnValue({
            zadd: mockPipelineZadd,
            zremrangebyscore: mockPipelineZremrangebyscore,
            zcount: mockPipelineZcount,
            expire: mockPipelineExpire,
            exec: mockPipelineExec,
          });
          setupPipelineWithCount(count);

          const result = await slidingWindow(
            `ratelimit:key:test:rpm`,
            limit,
            60_000,
          );

          expect(result.allowed).toBe(false);
          expect(result.limit).toBe(limit);
          expect(result.remaining).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("remaining is always Math.max(0, limit - count) (>=100 iterations)", async () => {
    // **Validates: Requirements 9.1, 9.8**
    const { slidingWindow } = await import("@/lib/rate-limiter");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }), // limit
        fc.integer({ min: 0, max: 150 }), // count (may exceed limit)
        async (limit, count) => {
          vi.clearAllMocks();
          mockPipeline.mockReturnValue({
            zadd: mockPipelineZadd,
            zremrangebyscore: mockPipelineZremrangebyscore,
            zcount: mockPipelineZcount,
            expire: mockPipelineExpire,
            exec: mockPipelineExec,
          });
          setupPipelineWithCount(count);

          const result = await slidingWindow(
            `ratelimit:key:test:rpm`,
            limit,
            60_000,
          );

          expect(result.remaining).toBe(Math.max(0, limit - count));
          expect(result.remaining).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("resetAt is always a future Unix timestamp (>=100 iterations)", async () => {
    // **Validates: Requirements 9.1**
    const { slidingWindow } = await import("@/lib/rate-limiter");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        async (limit, count) => {
          vi.clearAllMocks();
          mockPipeline.mockReturnValue({
            zadd: mockPipelineZadd,
            zremrangebyscore: mockPipelineZremrangebyscore,
            zcount: mockPipelineZcount,
            expire: mockPipelineExpire,
            exec: mockPipelineExec,
          });
          setupPipelineWithCount(count);

          const before = Math.floor(Date.now() / 1000);
          const result = await slidingWindow(
            `ratelimit:key:test:rpm`,
            limit,
            60_000,
          );

          // resetAt should be approximately now + 60 seconds
          expect(result.resetAt).toBeGreaterThanOrEqual(before + 59);
          expect(result.resetAt).toBeLessThanOrEqual(before + 61);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("uses sorted set pipeline operations (ZADD, ZREMRANGEBYSCORE, ZCOUNT, EXPIRE)", async () => {
    const { slidingWindow } = await import("@/lib/rate-limiter");

    setupPipelineWithCount(5);

    await slidingWindow("ratelimit:key:abc:rpm", 60, 60_000);

    expect(mockPipeline).toHaveBeenCalled();
    expect(mockPipelineZadd).toHaveBeenCalled();
    expect(mockPipelineZremrangebyscore).toHaveBeenCalled();
    expect(mockPipelineZcount).toHaveBeenCalled();
    expect(mockPipelineExpire).toHaveBeenCalled();
    expect(mockPipelineExec).toHaveBeenCalled();
  });
});

// ─── Fail-open behavior ───────────────────────────────────────────────────────

describe("slidingWindow: fail-open on Redis error", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns allowed:true when Redis pipeline throws (>=100 iterations)", async () => {
    // **Validates: Requirements 9.5**
    const { slidingWindow } = await import("@/lib/rate-limiter");

    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (limit) => {
        vi.clearAllMocks();
        mockPipeline.mockReturnValue({
          zadd: mockPipelineZadd,
          zremrangebyscore: mockPipelineZremrangebyscore,
          zcount: mockPipelineZcount,
          expire: mockPipelineExpire,
          exec: mockPipelineExec,
        });
        mockPipelineExec.mockRejectedValue(
          new Error("Redis connection refused"),
        );

        const result = await slidingWindow(
          `ratelimit:key:test:rpm`,
          limit,
          60_000,
        );

        expect(result.allowed).toBe(true);
        expect(result.limit).toBe(limit);
        expect(result.remaining).toBe(limit);
        expect(result.resetAt).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── checkRateLimits: ordering and short-circuit ──────────────────────────────

describe("checkRateLimits: ordering and short-circuit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.mockReturnValue({
      zadd: mockPipelineZadd,
      zremrangebyscore: mockPipelineZremrangebyscore,
      zcount: mockPipelineZcount,
      expire: mockPipelineExpire,
      exec: mockPipelineExec,
    });
  });

  it("short-circuits on per-key limit exceeded — does not check project or plan", async () => {
    // **Validates: Requirements 9.6**
    const { checkRateLimits } = await import("@/lib/rate-limiter");

    // Per-key: count = 61 (over limit of 60)
    setupPipelineWithCount(61);

    const result = await checkRateLimits("key_abc", "proj_xyz", "user_123");

    expect(result.allowed).toBe(false);
    // checkQuota should NOT have been called (short-circuit)
    expect(mockCheckQuota).not.toHaveBeenCalled();
  });

  it("checks project limit when per-key passes, short-circuits on project exceeded", async () => {
    // **Validates: Requirements 9.6**
    const { checkRateLimits } = await import("@/lib/rate-limiter");

    // First call (per-key): count = 30 (under limit 60) → allowed
    // Second call (per-project): count = 121 (over limit 120) → blocked
    mockPipelineExec
      .mockResolvedValueOnce([1, 0, 30, 1]) // per-key: allowed
      .mockResolvedValueOnce([1, 0, 121, 1]); // per-project: blocked

    const result = await checkRateLimits("key_abc", "proj_xyz", "user_123");

    expect(result.allowed).toBe(false);
    expect(mockCheckQuota).not.toHaveBeenCalled();
  });

  it("checks plan quota when per-key and per-project pass", async () => {
    // **Validates: Requirements 9.6**
    const { checkRateLimits } = await import("@/lib/rate-limiter");

    // Both sliding window checks pass
    mockPipelineExec
      .mockResolvedValueOnce([1, 0, 10, 1]) // per-key: allowed
      .mockResolvedValueOnce([1, 0, 20, 1]); // per-project: allowed

    // Plan quota: blocked
    mockCheckQuota.mockResolvedValue({
      allowed: false,
      quota: "requests_per_minute",
      limit: 10,
      current: 11,
    });

    const result = await checkRateLimits("key_abc", "proj_xyz", "user_123");

    expect(result.allowed).toBe(false);
    expect(mockCheckQuota).toHaveBeenCalledWith(
      "user_123",
      "requests_per_minute",
    );
  });

  it("skips project check when projectId is undefined", async () => {
    // **Validates: Requirements 9.2**
    const { checkRateLimits } = await import("@/lib/rate-limiter");

    // Only one pipeline call (per-key)
    setupPipelineWithCount(10);
    mockCheckQuota.mockResolvedValue({ allowed: true });

    const result = await checkRateLimits("key_abc", undefined, "user_123");

    expect(result.allowed).toBe(true);
    // Only one pipeline.exec call (per-key only, no project check)
    expect(mockPipelineExec).toHaveBeenCalledTimes(1);
  });

  it("returns allowed:true when all checks pass", async () => {
    // **Validates: Requirements 9.8**
    const { checkRateLimits } = await import("@/lib/rate-limiter");

    mockPipelineExec
      .mockResolvedValueOnce([1, 0, 5, 1]) // per-key: allowed
      .mockResolvedValueOnce([1, 0, 10, 1]); // per-project: allowed

    mockCheckQuota.mockResolvedValue({ allowed: true });

    const result = await checkRateLimits("key_abc", "proj_xyz", "user_123");

    expect(result.allowed).toBe(true);
  });

  it("returns correct limit/remaining/resetAt when plan quota blocks", async () => {
    // **Validates: Requirements 9.4**
    const { checkRateLimits } = await import("@/lib/rate-limiter");

    setupPipelineWithCount(5); // per-key passes (no project)
    mockCheckQuota.mockResolvedValue({
      allowed: false,
      quota: "requests_per_minute",
      limit: 10,
      current: 11,
    });

    const result = await checkRateLimits("key_abc", undefined, "user_123");

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(0);
    expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
