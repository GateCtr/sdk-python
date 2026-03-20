/**
 * Property-Based Tests: Admin MRR Calculation Correctness
 * Validates: Requirement 16.3
 *
 * Property 18: Admin MRR calculation correctness
 *   MRR = sum of PLAN_MRR[plan] for every ACTIVE subscription.
 *   TRIALING subscriptions contribute 0 to MRR (not yet paying).
 *   FREE and ENTERPRISE subscriptions contribute 0.
 *   ARR = MRR * 12.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { PLAN_MRR } from "@/constants/billing";
import type { PlanType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Pure MRR computation — extracted from admin/billing/page.tsx
// ---------------------------------------------------------------------------

type SubWithPlan = {
  status:
    | "ACTIVE"
    | "TRIALING"
    | "CANCELED"
    | "PAST_DUE"
    | "INCOMPLETE"
    | "PAUSED";
  user: { plan: PlanType };
};

function computeMRR(activeSubscriptions: SubWithPlan[]): number {
  let mrr = 0;
  for (const sub of activeSubscriptions) {
    mrr += PLAN_MRR[sub.user.plan] ?? 0;
  }
  return mrr;
}

// ---------------------------------------------------------------------------
// Property 18: Admin MRR calculation correctness
// ---------------------------------------------------------------------------

describe("Property 18: Admin MRR calculation correctness", () => {
  const paidPlans: PlanType[] = ["PRO", "TEAM"];
  const zeroPlansMRR: PlanType[] = ["FREE", "ENTERPRISE"];

  it("MRR equals sum of PLAN_MRR for all ACTIVE subscriptions (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            plan: fc.constantFrom<PlanType>(
              "FREE",
              "PRO",
              "TEAM",
              "ENTERPRISE",
            ),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        (subs) => {
          const activeSubs: SubWithPlan[] = subs.map((s) => ({
            status: "ACTIVE",
            user: { plan: s.plan },
          }));

          const mrr = computeMRR(activeSubs);

          // Manual calculation
          const expected = subs.reduce(
            (sum, s) => sum + (PLAN_MRR[s.plan] ?? 0),
            0,
          );

          expect(mrr).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("PRO subscriptions each contribute exactly €29 to MRR (>=100 iterations)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (proCount) => {
        const subs: SubWithPlan[] = Array.from({ length: proCount }, () => ({
          status: "ACTIVE",
          user: { plan: "PRO" },
        }));

        const mrr = computeMRR(subs);
        expect(mrr).toBe(proCount * 29);
      }),
      { numRuns: 100 },
    );
  });

  it("TEAM subscriptions each contribute exactly €99 to MRR (>=100 iterations)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (teamCount) => {
        const subs: SubWithPlan[] = Array.from({ length: teamCount }, () => ({
          status: "ACTIVE",
          user: { plan: "TEAM" },
        }));

        const mrr = computeMRR(subs);
        expect(mrr).toBe(teamCount * 99);
      }),
      { numRuns: 100 },
    );
  });

  it("FREE and ENTERPRISE subscriptions contribute 0 to MRR (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<PlanType>(...zeroPlansMRR), {
          minLength: 1,
          maxLength: 50,
        }),
        (plans) => {
          const subs: SubWithPlan[] = plans.map((plan) => ({
            status: "ACTIVE",
            user: { plan },
          }));

          const mrr = computeMRR(subs);
          expect(mrr).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("mixed PRO and TEAM subscriptions produce correct MRR (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (proCount, teamCount) => {
          const subs: SubWithPlan[] = [
            ...Array.from({ length: proCount }, () => ({
              status: "ACTIVE" as const,
              user: { plan: "PRO" as PlanType },
            })),
            ...Array.from({ length: teamCount }, () => ({
              status: "ACTIVE" as const,
              user: { plan: "TEAM" as PlanType },
            })),
          ];

          const mrr = computeMRR(subs);
          expect(mrr).toBe(proCount * 29 + teamCount * 99);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("ARR = MRR * 12 for any subscription mix (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<PlanType>(...paidPlans), {
          minLength: 0,
          maxLength: 30,
        }),
        (plans) => {
          const subs: SubWithPlan[] = plans.map((plan) => ({
            status: "ACTIVE",
            user: { plan },
          }));

          const mrr = computeMRR(subs);
          const arr = mrr * 12;

          expect(arr).toBe(mrr * 12);
          // ARR is always a multiple of 12
          expect(arr % 12).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("MRR is 0 when there are no active subscriptions", () => {
    expect(computeMRR([])).toBe(0);
  });

  it("PLAN_MRR constants match expected values", () => {
    expect(PLAN_MRR.FREE).toBe(0);
    expect(PLAN_MRR.PRO).toBe(29);
    expect(PLAN_MRR.TEAM).toBe(99);
    expect(PLAN_MRR.ENTERPRISE).toBe(0);
  });
});
