// Feature: api-logic-completion, Property 13: Integration GET response never includes encryptedConfig
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ── Mocks ────────────────────────────────────────────────────────────────────
const { mockFindUnique, mockFindMany } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "clerk_user_1" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockFindUnique },
    integrationConnector: { findMany: mockFindMany },
  },
}));

import { GET } from "@/app/api/v1/integrations/route";

describe("Property 13: Integration GET response never includes encryptedConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue({ id: "user_1" });
  });

  it("omits encryptedConfig for any number of integrations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            userId: fc.constant("user_1"),
            type: fc.constantFrom(
              "slack",
              "teams",
              "discord",
              "zapier",
              "custom",
            ),
            name: fc.string({ minLength: 1, maxLength: 30 }),
            eventMapping: fc.constant({}),
            isActive: fc.boolean(),
            lastSyncAt: fc.constant(null),
            createdAt: fc.constant(new Date()),
            updatedAt: fc.constant(new Date()),
          }),
          { minLength: 0, maxLength: 10 },
        ),
        async (rows) => {
          mockFindMany.mockResolvedValue(rows);

          const res = await GET();
          const body = await res.json();

          expect(Array.isArray(body)).toBe(true);
          for (const item of body) {
            expect(item).not.toHaveProperty("encryptedConfig");
          }
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
