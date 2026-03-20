/**
 * Property-Based Tests: Seat Overage Calculation Correctness
 * Validates: Requirements 15.1, 15.2, 15.3
 *
 * Property 17: Seat overage calculation correctness
 *   For any member count N:
 *   - overageSeats = max(0, N - INCLUDED_SEATS)
 *   - Stripe is called with exactly that quantity
 *   - When N <= INCLUDED_SEATS, Stripe is called with quantity 0
 *   - When subscription is not ACTIVE or has no stripeSeatsItemId, Stripe is NOT called
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStripeSubscriptionsUpdate = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: {
      update: mockStripeSubscriptionsUpdate,
    },
  },
}));

const mockSubscriptionFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: { findUnique: mockSubscriptionFindUnique },
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// INCLUDED_SEATS in lib/seats.ts is 3
const INCLUDED_SEATS = 3;

// ---------------------------------------------------------------------------
// Property 17: Seat overage calculation correctness
// ---------------------------------------------------------------------------

describe("Property 17: Seat overage calculation correctness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls Stripe with overageSeats = max(0, N - INCLUDED_SEATS) for any member count (>=100 iterations)", async () => {
    const { updateSeatCount } = await import("@/lib/seats");

    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 200 }), // member count 0–200
        async (memberCount) => {
          vi.clearAllMocks();

          mockSubscriptionFindUnique.mockResolvedValue({
            stripeSubscriptionId: "sub_team_001",
            stripeSeatsItemId: "si_seats_001",
            status: "ACTIVE",
          });
          mockStripeSubscriptionsUpdate.mockResolvedValue({
            id: "sub_team_001",
          });

          await updateSeatCount("user_team", memberCount);

          const expectedOverage = Math.max(0, memberCount - INCLUDED_SEATS);

          expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
            "sub_team_001",
            expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({
                  id: "si_seats_001",
                  quantity: expectedOverage,
                }),
              ]),
              proration_behavior: "always_invoice",
            }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("calls Stripe with quantity 0 when memberCount <= INCLUDED_SEATS (>=100 iterations)", async () => {
    const { updateSeatCount } = await import("@/lib/seats");

    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: INCLUDED_SEATS }), // 0 to INCLUDED_SEATS
        async (memberCount) => {
          vi.clearAllMocks();

          mockSubscriptionFindUnique.mockResolvedValue({
            stripeSubscriptionId: "sub_team_002",
            stripeSeatsItemId: "si_seats_002",
            status: "ACTIVE",
          });
          mockStripeSubscriptionsUpdate.mockResolvedValue({
            id: "sub_team_002",
          });

          await updateSeatCount("user_team", memberCount);

          expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
            "sub_team_002",
            expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({ quantity: 0 }),
              ]),
            }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does NOT call Stripe when subscription status is not ACTIVE (>=100 iterations)", async () => {
    const { updateSeatCount } = await import("@/lib/seats");

    const nonActiveStatuses = [
      "CANCELED",
      "PAST_DUE",
      "TRIALING",
      "INCOMPLETE",
      "PAUSED",
    ] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonActiveStatuses),
        fc.nat({ max: 50 }),
        async (status, memberCount) => {
          vi.clearAllMocks();

          mockSubscriptionFindUnique.mockResolvedValue({
            stripeSubscriptionId: "sub_team_003",
            stripeSeatsItemId: "si_seats_003",
            status,
          });

          await updateSeatCount("user_team", memberCount);

          expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does NOT call Stripe when stripeSeatsItemId is null (>=100 iterations)", async () => {
    const { updateSeatCount } = await import("@/lib/seats");

    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 50 }), async (memberCount) => {
        vi.clearAllMocks();

        mockSubscriptionFindUnique.mockResolvedValue({
          stripeSubscriptionId: "sub_team_004",
          stripeSeatsItemId: null,
          status: "ACTIVE",
        });

        await updateSeatCount("user_team", memberCount);

        expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it("does NOT call Stripe when subscription is not found", async () => {
    const { updateSeatCount } = await import("@/lib/seats");
    vi.clearAllMocks();

    mockSubscriptionFindUnique.mockResolvedValue(null);

    await updateSeatCount("user_no_sub", 10);

    expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("rethrows Stripe errors (callers must handle)", async () => {
    const { updateSeatCount } = await import("@/lib/seats");
    vi.clearAllMocks();

    mockSubscriptionFindUnique.mockResolvedValue({
      stripeSubscriptionId: "sub_team_err",
      stripeSeatsItemId: "si_seats_err",
      status: "ACTIVE",
    });
    mockStripeSubscriptionsUpdate.mockRejectedValue(
      new Error("Stripe API error"),
    );

    await expect(updateSeatCount("user_team", 5)).rejects.toThrow(
      "Stripe API error",
    );
  });
});
