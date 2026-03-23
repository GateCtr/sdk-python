// Feature: api-logic-completion, Property 17: Cache stats exclude expired entries
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ── Mocks ────────────────────────────────────────────────────────────────────
const { mockCount, mockAggregate, mockGroupBy } = vi.hoisted(() => ({
  mockCount: vi.fn(),
  mockAggregate: vi.fn(),
  mockGroupBy: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "clerk_user_1" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cacheEntry: {
      count: mockCount,
      aggregate: mockAggregate,
      groupBy: mockGroupBy,
    },
  },
}));

import { GET } from "@/app/api/v1/cache/stats/route";

describe("Property 17: Cache stats exclude expired entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Prisma queries always use expiresAt > now filter", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a mix of active/expired entry counts
        fc.record({
          activeCount: fc.nat({ max: 1000 }),
          totalHits: fc.nat({ max: 100000 }),
          topModels: fc.array(
            fc.record({
              model: fc.constantFrom("gpt-4", "gpt-3.5-turbo", "claude-3"),
              provider: fc.constantFrom("openai", "anthropic"),
              _sum: fc.record({
                hitCount: fc.nat({ max: 500 }),
                promptTokens: fc.nat({ max: 2000 }),
              }),
              _count: fc.record({ id: fc.nat({ max: 100 }) }),
            }),
            { minLength: 0, maxLength: 10 },
          ),
        }),
        async ({ activeCount, totalHits, topModels }) => {
          mockCount.mockResolvedValue(activeCount);
          mockAggregate.mockResolvedValue({ _sum: { hitCount: totalHits } });
          mockGroupBy.mockResolvedValue(topModels);

          const res = await GET();
          const body = await res.json();

          expect(res.status).toBe(200);

          // Verify the where clause passed to Prisma always filters by expiresAt
          const countCall = mockCount.mock.calls[0][0];
          const aggCall = mockAggregate.mock.calls[0][0];
          const groupByCall = mockGroupBy.mock.calls[0][0];

          expect(countCall.where).toHaveProperty("expiresAt");
          expect(countCall.where.expiresAt).toHaveProperty("gt");
          expect(aggCall.where).toHaveProperty("expiresAt");
          expect(aggCall.where.expiresAt).toHaveProperty("gt");
          expect(groupByCall.where).toHaveProperty("expiresAt");
          expect(groupByCall.where.expiresAt).toHaveProperty("gt");

          // The gt value must be a Date (now)
          expect(countCall.where.expiresAt.gt).toBeInstanceOf(Date);

          // Response shape is correct
          expect(body).toHaveProperty("totalEntries", activeCount);
          expect(body).toHaveProperty("totalHits", totalHits);
          expect(body).toHaveProperty("topModels");
          expect(body).toHaveProperty("estimatedTokensSaved");
          expect(typeof body.estimatedTokensSaved).toBe("number");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("estimatedTokensSaved equals sum of promptTokens * hitCount across topModels", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            model: fc.string({ minLength: 1, maxLength: 10 }),
            provider: fc.string({ minLength: 1, maxLength: 10 }),
            _sum: fc.record({
              hitCount: fc.nat({ max: 1000 }),
              promptTokens: fc.nat({ max: 5000 }),
            }),
            _count: fc.record({ id: fc.nat({ max: 50 }) }),
          }),
          { minLength: 0, maxLength: 10 },
        ),
        async (topModels) => {
          mockCount.mockResolvedValue(topModels.length);
          mockAggregate.mockResolvedValue({ _sum: { hitCount: 0 } });
          mockGroupBy.mockResolvedValue(topModels);

          const res = await GET();
          const body = await res.json();

          const expected = topModels.reduce(
            (sum, m) =>
              sum + (m._sum.promptTokens ?? 0) * (m._sum.hitCount ?? 0),
            0,
          );

          expect(body.estimatedTokensSaved).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as never);

    const res = await GET();
    expect(res.status).toBe(401);
  });
});
