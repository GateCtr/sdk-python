// Feature: api-logic-completion, Property 22: Unhandled exceptions return 500 without stack traces
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ── Mocks ────────────────────────────────────────────────────────────────────
const { mockUserFindUnique, mockFindMany } = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "clerk_user_1" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    alertRule: { findMany: mockFindMany },
  },
}));

// GET /alerts has try/catch — returns 500 on unhandled errors
import { GET } from "@/app/api/v1/alerts/route";

describe("Property 22: Unhandled exceptions return 500 without stack traces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 with { error: 'internal_error' } when Prisma throws", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (errorMessage) => {
          mockUserFindUnique.mockResolvedValue({ id: "user_1" });
          mockFindMany.mockRejectedValue(new Error(errorMessage));

          const res = await GET();
          const body = await res.json();

          expect(res.status).toBe(500);
          expect(body).toEqual({ error: "internal_error" });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("response body never contains stack trace strings", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (errorMessage) => {
          mockUserFindUnique.mockResolvedValue({ id: "user_1" });
          mockFindMany.mockRejectedValue(new Error(errorMessage));

          const res = await GET();
          const bodyText = await res.text();

          expect(bodyText).not.toContain("at Object.");
          expect(bodyText).not.toContain("at async");
          expect(bodyText).not.toContain(".ts:");
          expect(bodyText).not.toContain(".js:");
          expect(bodyText).not.toContain("Error:");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("response body contains only { error: 'internal_error' } — no extra fields", async () => {
    await fc.assert(
      fc.asyncProperty(fc.anything(), async (thrownValue) => {
        mockUserFindUnique.mockResolvedValue({ id: "user_1" });
        mockFindMany.mockRejectedValue(thrownValue);

        const res = await GET();
        const body = await res.json();

        expect(Object.keys(body)).toEqual(["error"]);
        expect(body.error).toBe("internal_error");
      }),
      { numRuns: 100 },
    );
  });
});
