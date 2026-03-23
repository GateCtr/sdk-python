// Feature: api-logic-completion, Property 16: Optimization rules list contains only active rules ordered by priority
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ── Mocks ────────────────────────────────────────────────────────────────────
const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "clerk_user_1" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    optimizationRule: { findMany: mockFindMany },
  },
}));

import { GET } from "@/app/api/v1/optimization-rules/route";
import { NextRequest } from "next/server";

function makeReq() {
  return new NextRequest("http://localhost/api/v1/optimization-rules");
}

describe("Property 16: Optimization rules list contains only active rules ordered by priority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only active rules in descending priority order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 20 }),
            ruleType: fc.constantFrom("compression", "rewrite", "pruning"),
            isActive: fc.boolean(),
            priority: fc.integer({ min: -100, max: 100 }),
            createdAt: fc.constant(new Date()),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        async (allRules) => {
          // Simulate what Prisma returns: only active, sorted desc by priority
          const activeRules = allRules
            .filter((r) => r.isActive)
            .sort((a, b) => b.priority - a.priority);

          mockFindMany.mockResolvedValue(activeRules);

          const res = await GET(makeReq());
          const body = await res.json();

          expect(res.status).toBe(200);
          expect(Array.isArray(body)).toBe(true);

          // All returned rules must be active
          for (const rule of body) {
            expect(rule.isActive).toBe(true);
          }

          // Must be in descending priority order
          for (let i = 1; i < body.length; i++) {
            expect(body[i - 1].priority).toBeGreaterThanOrEqual(
              body[i].priority,
            );
          }

          // Verify Prisma was called with correct query shape
          expect(mockFindMany).toHaveBeenCalledWith({
            where: { isActive: true },
            orderBy: { priority: "desc" },
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });
});
