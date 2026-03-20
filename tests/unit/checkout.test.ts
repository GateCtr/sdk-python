/**
 * Property-Based Tests for Checkout API
 *
 * **Validates: Requirements 3.6, 3.7, 9.3**
 *
 * Property 8: Checkout rejects plans without a Stripe price
 *   For any planId where Plan.stripePriceIdMonthly is null (FREE or ENTERPRISE),
 *   the checkout endpoint must return HTTP 400 and must not call the Stripe API.
 *
 * Property 10: Unauthenticated requests are rejected
 *   For any request to /api/billing/checkout that does not carry a valid Clerk
 *   session (auth() returns null userId), the handler must return HTTP 401 and
 *   must not call the Stripe API or write any database record.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
    subscription: {
      upsert: vi.fn(),
    },
  },
}));

// Mock Stripe singleton — track calls to detect unwanted Stripe API usage
const mockStripeCustomersCreate = vi.fn();
const mockStripeCheckoutSessionsCreate = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: {
      create: mockStripeCustomersCreate,
    },
    checkout: {
      sessions: {
        create: mockStripeCheckoutSessionsCreate,
      },
    },
  },
}));

// Mock rate-limit — always allow to isolate the logic under test
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 4, reset: 0, limit: 5 }),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: {
    checkout: { limit: 5, window: 3600, prefix: "rl:checkout" },
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a NextRequest with the given JSON body for the checkout endpoint.
 */
function makeCheckoutRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Property 10: Unauthenticated requests are rejected
// ---------------------------------------------------------------------------

describe("Property 10: Unauthenticated requests are rejected", () => {
  /**
   * **Validates: Requirements 3.6, 9.3**
   *
   * For any request body sent to /api/billing/checkout without a valid Clerk
   * session (auth() returns { userId: null }), the handler must:
   * - Return HTTP 401
   * - Not call the Stripe API (no customers.create, no sessions.create)
   * - Not write any database record
   */

  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate unauthenticated: auth() returns null userId
    vi.mocked(auth).mockResolvedValue({ userId: null } as ReturnType<
      typeof auth
    > extends Promise<infer T>
      ? T
      : never);
  });

  it("returns 401 for any request body when unauthenticated (≥100 iterations)", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");

    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary request bodies: valid planIds, random strings, objects, nulls
        fc.oneof(
          fc.record({ planId: fc.string({ minLength: 1, maxLength: 50 }) }),
          fc.record({
            planId: fc.string({ minLength: 1, maxLength: 50 }),
            interval: fc.constantFrom("monthly", "yearly"),
          }),
          fc.record({ planId: fc.constant("PRO") }),
          fc.record({ planId: fc.constant("TEAM") }),
          fc.record({ planId: fc.constant("FREE") }),
          fc.record({ planId: fc.constant("ENTERPRISE") }),
          fc.record({}),
          fc.constant({ planId: null }),
        ),
        async (body) => {
          // Reset Stripe call trackers before each iteration
          mockStripeCustomersCreate.mockClear();
          mockStripeCheckoutSessionsCreate.mockClear();
          vi.mocked(prisma.user.findUnique).mockClear();
          vi.mocked(prisma.plan.findUnique).mockClear();
          vi.mocked(prisma.subscription.upsert).mockClear();

          const req = makeCheckoutRequest(body);
          const response = await POST(req);

          // Must return 401
          expect(response.status).toBe(401);

          // Must not call Stripe API
          expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
          expect(mockStripeCheckoutSessionsCreate).not.toHaveBeenCalled();

          // Must not write any DB record
          expect(prisma.subscription.upsert).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns JSON body with error field on 401", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");

    const req = makeCheckoutRequest({ planId: "PRO" });
    const response = await POST(req);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Property 8: Checkout rejects plans without a Stripe price
// ---------------------------------------------------------------------------

describe("Property 8: Checkout rejects plans without a Stripe price", () => {
  /**
   * **Validates: Requirements 3.7**
   *
   * For any planId where the Plan has stripePriceIdMonthly: null (FREE or
   * ENTERPRISE), the checkout endpoint must:
   * - Return HTTP 400
   * - Not call the Stripe API (no customers.create, no sessions.create)
   */

  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate authenticated user
    vi.mocked(auth).mockResolvedValue({ userId: "user_test_123" } as ReturnType<
      typeof auth
    > extends Promise<infer T>
      ? T
      : never);

    // User exists with no active subscription
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "db-user-id",
      clerkId: "user_test_123",
      email: "test@example.com",
      subscription: null,
    } as Parameters<typeof prisma.user.findUnique>[0] extends {
      include: unknown;
    }
      ? unknown
      : unknown as never);
  });

  it("returns 400 for any planId whose Plan has null stripePriceIdMonthly (≥100 iterations)", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");

    await fc.assert(
      fc.asyncProperty(
        // Generate planId strings — we'll back them with a null-price plan in the mock
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => s.trim().length > 0),
        async (planId) => {
          mockStripeCustomersCreate.mockClear();
          mockStripeCheckoutSessionsCreate.mockClear();

          // Mock the plan lookup to return a plan with null price IDs
          // (simulating FREE or ENTERPRISE plans)
          vi.mocked(prisma.plan.findUnique).mockResolvedValue({
            id: "plan-id",
            name: planId,
            stripePriceIdMonthly: null,
            stripePriceIdYearly: null,
          } as unknown as Awaited<ReturnType<typeof prisma.plan.findUnique>>);

          const req = makeCheckoutRequest({ planId, interval: "monthly" });
          const response = await POST(req);

          // Must return 400
          expect(response.status).toBe(400);

          // Must not call Stripe API
          expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
          expect(mockStripeCheckoutSessionsCreate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns 400 for yearly interval when stripePriceIdYearly is null (≥100 iterations)", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");

    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => s.trim().length > 0),
        async (planId) => {
          mockStripeCustomersCreate.mockClear();
          mockStripeCheckoutSessionsCreate.mockClear();

          // Plan has a monthly price but no yearly price
          vi.mocked(prisma.plan.findUnique).mockResolvedValue({
            id: "plan-id",
            name: planId,
            stripePriceIdMonthly: "price_monthly_test",
            stripePriceIdYearly: null,
          } as unknown as Awaited<ReturnType<typeof prisma.plan.findUnique>>);

          const req = makeCheckoutRequest({ planId, interval: "yearly" });
          const response = await POST(req);

          // Must return 400 — no yearly price configured
          expect(response.status).toBe(400);

          // Must not call Stripe API
          expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
          expect(mockStripeCheckoutSessionsCreate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns 400 specifically for FREE plan (null price)", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");

    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      id: "plan-free-id",
      name: "FREE",
      stripePriceIdMonthly: null,
      stripePriceIdYearly: null,
    } as unknown as Awaited<ReturnType<typeof prisma.plan.findUnique>>);

    const req = makeCheckoutRequest({ planId: "FREE" });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
    expect(mockStripeCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 400 specifically for ENTERPRISE plan (null price)", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");

    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      id: "plan-enterprise-id",
      name: "ENTERPRISE",
      stripePriceIdMonthly: null,
      stripePriceIdYearly: null,
    } as unknown as Awaited<ReturnType<typeof prisma.plan.findUnique>>);

    const req = makeCheckoutRequest({ planId: "ENTERPRISE" });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
    expect(mockStripeCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("does NOT return 400 when plan has a valid monthly price (control case)", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");

    // Plan has a valid price — Stripe session creation should be attempted
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({
      id: "plan-pro-id",
      name: "PRO",
      stripePriceIdMonthly: "price_pro_monthly",
      stripePriceIdYearly: "price_pro_yearly",
    } as unknown as Awaited<ReturnType<typeof prisma.plan.findUnique>>);

    mockStripeCheckoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/test-session",
    });
    mockStripeCustomersCreate.mockResolvedValue({ id: "cus_test123" });

    const req = makeCheckoutRequest({ planId: "PRO", interval: "monthly" });
    const response = await POST(req);

    // Should NOT be 400 — price is valid, Stripe session creation was attempted
    expect(response.status).not.toBe(400);
  });
});
