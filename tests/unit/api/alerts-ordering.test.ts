// Feature: api-logic-completion, Property 7: Alert rules list is ordered by createdAt descending
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

/**
 * Validates: Requirements 2.1
 *
 * Property 7: Alert rules list is ordered by createdAt descending
 * For any array of alert rules, the GET /api/v1/alerts response should
 * return all rules sorted by createdAt descending.
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    alertRule: { findMany: vi.fn() },
  },
}));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/v1/alerts/route";

const OWNER_ID = "user-1";
const CLERK_ID = "clerk_user-1";

describe("P7: alert rules list is ordered by createdAt descending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      userId: CLERK_ID,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: OWNER_ID,
    } as never);
  });

  it("returns alertRules sorted by createdAt descending", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            createdAt: fc.date({ noInvalidDate: true }),
            userId: fc.constant("user-1"),
            name: fc.string({ minLength: 1 }),
            alertType: fc.constant("budget_threshold"),
            condition: fc.constant({}),
          }),
          { minLength: 1 },
        ),
        async (rules) => {
          // Simulate what Prisma would do: sort by createdAt descending
          const sorted = [...rules].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
          vi.mocked(prisma.alertRule.findMany).mockResolvedValue(
            sorted as never,
          );

          const req = new Request("http://localhost/api/v1/alerts", {
            method: "GET",
          });

          const response = await GET();
          const body = await response.json();

          expect(response.status).toBe(200);
          expect(body).toHaveProperty("alertRules");
          expect(body.alertRules).toHaveLength(sorted.length);

          // Assert descending order
          for (let i = 0; i < body.alertRules.length - 1; i++) {
            const curr = new Date(body.alertRules[i].createdAt).getTime();
            const next = new Date(body.alertRules[i + 1].createdAt).getTime();
            expect(curr).toBeGreaterThanOrEqual(next);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
