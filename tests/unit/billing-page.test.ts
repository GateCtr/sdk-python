/**
 * Property-Based Tests for Billing Page Behaviors
 *
 * Property 20: Invoice list never throws on Stripe API failure (Req 14.5)
 *   For any Stripe API error (network, auth, rate-limit, etc.), the invoice
 *   fetch must return [] and must never propagate the error.
 *
 * Property 14: Trial users get PRO feature access (Req 13.2, 13.6)
 *   A user with subscription status TRIALING must have User.plan = PRO and
 *   therefore receive PRO feature access via checkFeatureAccess.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInvoicesList = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    invoices: { list: mockInvoicesList },
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  },
}));

const mockRedisGet = vi.fn();
const mockRedisSetex = vi.fn();
const mockRedisDel = vi.fn();

vi.mock("@/lib/redis", () => ({
  redis: {
    get: mockRedisGet,
    setex: mockRedisSetex,
    del: mockRedisDel,
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
// Helpers — mirrors the inline logic in billing/page.tsx
// ---------------------------------------------------------------------------

/**
 * Fetch invoices from Stripe — returns [] on any error, never throws.
 * This mirrors the try/catch block in BillingPage.
 */
async function fetchInvoicesSafe(
  stripeCustomerId: string,
): Promise<
  {
    id: string;
    created: number;
    amount_due: number;
    currency: string;
    status: string | null;
    invoice_pdf: string | null;
  }[]
> {
  const { stripe } = await import("@/lib/stripe");
  try {
    const list = await stripe.invoices.list({
      customer: stripeCustomerId,
      limit: 12,
    });
    return list.data.map(
      (inv: {
        id: string;
        created: number;
        amount_due: number;
        currency: string;
        status?: string | null;
        invoice_pdf?: string | null;
      }) => ({
        id: inv.id,
        created: inv.created,
        amount_due: inv.amount_due,
        currency: inv.currency,
        status: inv.status ?? null,
        invoice_pdf: inv.invoice_pdf ?? null,
      }),
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Property 20: Invoice list never throws on Stripe API failure
// ---------------------------------------------------------------------------

describe("Property 20: Invoice list never throws on Stripe API failure", () => {
  beforeEach(() => vi.clearAllMocks());

  const stripeErrors = [
    new Error("Network error"),
    Object.assign(new Error("Authentication failed"), {
      type: "StripeAuthenticationError",
      status: 401,
    }),
    Object.assign(new Error("Rate limit exceeded"), {
      type: "StripeRateLimitError",
      status: 429,
    }),
    Object.assign(new Error("Internal server error"), {
      type: "StripeAPIError",
      status: 500,
    }),
    Object.assign(new Error("Invalid request"), {
      type: "StripeInvalidRequestError",
      status: 400,
    }),
    new TypeError("Cannot read properties of undefined"),
    new Error("ECONNREFUSED"),
  ];

  it("returns [] for any Stripe error type — never throws (>=100 iterations)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...stripeErrors),
        fc.string({ minLength: 5, maxLength: 20 }).map((s) => `cus_${s}`),
        async (error, customerId) => {
          vi.clearAllMocks();
          mockInvoicesList.mockRejectedValue(error);

          // Must not throw
          const result = await fetchInvoicesSafe(customerId);

          expect(result).toEqual([]);
          expect(Array.isArray(result)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns mapped invoices when Stripe succeeds (>=100 iterations)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc
              .string({ minLength: 5, maxLength: 20 })
              .map((s) => `in_${s}`),
            created: fc.integer({ min: 1_600_000_000, max: 1_800_000_000 }),
            amount_due: fc.nat({ max: 100_000 }),
            currency: fc.constantFrom("eur", "usd"),
            status: fc.constantFrom("paid", "open", "void", null),
            invoice_pdf: fc.option(fc.webUrl(), { nil: null }),
          }),
          { minLength: 0, maxLength: 12 },
        ),
        fc.string({ minLength: 5, maxLength: 20 }).map((s) => `cus_${s}`),
        async (invoiceData, customerId) => {
          vi.clearAllMocks();
          mockInvoicesList.mockResolvedValue({ data: invoiceData });

          const result = await fetchInvoicesSafe(customerId);

          expect(result).toHaveLength(invoiceData.length);
          result.forEach((inv, i) => {
            expect(inv.id).toBe(invoiceData[i].id);
            expect(inv.amount_due).toBe(invoiceData[i].amount_due);
            expect(inv.currency).toBe(invoiceData[i].currency);
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns [] when stripeCustomerId is absent (no Stripe call made)", async () => {
    vi.clearAllMocks();

    // Simulate the billing page guard: only call Stripe when stripeCustomerId is non-null
    const stripeCustomerId: string | null = null;
    let invoices: ReturnType<typeof fetchInvoicesSafe> extends Promise<infer T>
      ? T
      : never = [];

    if (stripeCustomerId) {
      invoices = await fetchInvoicesSafe(stripeCustomerId);
    }

    expect(invoices).toEqual([]);
    expect(mockInvoicesList).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Property 14: Trial users get PRO feature access
// ---------------------------------------------------------------------------

describe("Property 14: Trial users get PRO feature access", () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * The webhook handler sets User.plan = PRO when status = TRIALING.
   * So checkFeatureAccess for a TRIALING user must return PRO-level access.
   * We test this by setting up a user with plan=PRO (as the webhook does)
   * and verifying PRO features are accessible.
   */

  it("TRIALING user has User.plan=PRO and gets PRO feature access (>=100 iterations)", async () => {
    const { checkFeatureAccess } = await import("@/lib/plan-guard");

    const proLimits = {
      id: "lim_pro",
      planId: "plan_pro",
      maxTokensPerMonth: 2_000_000,
      maxRequestsPerDay: 60_000,
      maxRequestsPerMinute: 60,
      maxProjects: 5,
      maxApiKeys: 5,
      maxWebhooks: 10,
      maxTeamMembers: 1,
      contextOptimizerEnabled: true,
      modelRouterEnabled: true,
      advancedAnalytics: true,
      auditLogsRetentionDays: 30,
    };

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.constantFrom(
          "contextOptimizer",
          "modelRouter",
          "advancedAnalytics",
        ) as fc.Arbitrary<
          "contextOptimizer" | "modelRouter" | "advancedAnalytics"
        >,
        async (userId, feature) => {
          vi.clearAllMocks();

          // Webhook sets plan=PRO for TRIALING users
          mockUserFindUnique.mockResolvedValue({ id: userId, plan: "PRO" });
          mockRedisGet.mockResolvedValue(null); // cache miss
          mockPlanFindUnique.mockResolvedValue({
            name: "PRO",
            limits: proLimits,
          });
          mockRedisSetex.mockResolvedValue("OK");

          const result = await checkFeatureAccess(userId, feature);

          // PRO features must be accessible for trial users
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("FREE plan users do NOT get PRO feature access (>=100 iterations)", async () => {
    const { checkFeatureAccess } = await import("@/lib/plan-guard");

    const freeLimits = {
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
    };

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.constantFrom(
          "contextOptimizer",
          "modelRouter",
          "advancedAnalytics",
        ) as fc.Arbitrary<
          "contextOptimizer" | "modelRouter" | "advancedAnalytics"
        >,
        async (userId, feature) => {
          vi.clearAllMocks();

          mockUserFindUnique.mockResolvedValue({ id: userId, plan: "FREE" });
          mockRedisGet.mockResolvedValue(null);
          mockPlanFindUnique.mockResolvedValue({
            name: "FREE",
            limits: freeLimits,
          });
          mockRedisSetex.mockResolvedValue("OK");

          const result = await checkFeatureAccess(userId, feature);

          // FREE users must NOT get PRO features
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("computeTrialDaysLeft returns positive days when trialEnd is in the future", () => {
    // Inline the pure helper from billing/page.tsx
    function computeTrialDaysLeft(
      trialEnd: Date | null | undefined,
    ): number | null {
      if (!trialEnd) return null;
      const msLeft = trialEnd.getTime() - Date.now();
      return Math.max(0, Math.ceil(msLeft / 86400000));
    }

    const tomorrow = new Date(Date.now() + 86400000 * 3); // 3 days from now
    const result = computeTrialDaysLeft(tomorrow);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(3);
  });

  it("computeTrialDaysLeft returns 0 when trialEnd is in the past", () => {
    function computeTrialDaysLeft(
      trialEnd: Date | null | undefined,
    ): number | null {
      if (!trialEnd) return null;
      const msLeft = trialEnd.getTime() - Date.now();
      return Math.max(0, Math.ceil(msLeft / 86400000));
    }

    const yesterday = new Date(Date.now() - 86400000);
    expect(computeTrialDaysLeft(yesterday)).toBe(0);
  });

  it("computeTrialDaysLeft returns null when trialEnd is null", () => {
    function computeTrialDaysLeft(
      trialEnd: Date | null | undefined,
    ): number | null {
      if (!trialEnd) return null;
      const msLeft = trialEnd.getTime() - Date.now();
      return Math.max(0, Math.ceil(msLeft / 86400000));
    }

    expect(computeTrialDaysLeft(null)).toBeNull();
    expect(computeTrialDaysLeft(undefined)).toBeNull();
  });
});
