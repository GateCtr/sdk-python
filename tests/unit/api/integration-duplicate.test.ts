// Feature: api-logic-completion, Property 15: Duplicate integration returns 409
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ── Mocks ────────────────────────────────────────────────────────────────────
const { mockFindUnique, mockCreate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "clerk_user_1" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockFindUnique },
    integrationConnector: { create: mockCreate },
  },
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn().mockReturnValue("iv:tag:cipher"),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/v1/integrations/route";
import { NextRequest } from "next/server";

function makeReq(body: object) {
  return new NextRequest("http://localhost/api/v1/integrations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// Prisma unique constraint error
const prismaUniqueError = Object.assign(new Error("Unique constraint"), {
  code: "P2002",
});

describe("Property 15: Duplicate integration returns 409", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue({ id: "user_1" });
  });

  it("returns 409 with integration_already_exists for any valid duplicate payload", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 30 }),
          type: fc.constantFrom(
            "slack",
            "teams",
            "discord",
            "zapier",
            "custom",
          ),
          config: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 10 }),
            fc.string(),
          ),
        }),
        async (payload) => {
          mockCreate.mockRejectedValue(prismaUniqueError);

          const res = await POST(makeReq(payload));
          const body = await res.json();

          expect(res.status).toBe(409);
          expect(body.error).toBe("integration_already_exists");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns 400 validation_error when required fields are missing", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            // At least one of name/type/config is missing
            name: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            type: fc.option(
              fc.constantFrom("slack", "teams", "discord", "zapier", "custom"),
              { nil: undefined },
            ),
            config: fc.option(fc.constant({ key: "val" }), { nil: undefined }),
          })
          .filter((p) => !p.name || !p.type || !p.config),
        async (payload) => {
          const res = await POST(makeReq(payload));
          expect(res.status).toBe(400);
          const body = await res.json();
          expect(body.error).toBe("validation_error");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns 400 invalid_integration_type for unknown type values", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter(
            (s) =>
              !["slack", "teams", "discord", "zapier", "custom"].includes(s),
          ),
        async (badType) => {
          const res = await POST(
            makeReq({ name: "test", type: badType, config: { k: "v" } }),
          );
          expect(res.status).toBe(400);
          const body = await res.json();
          expect(body.error).toBe("invalid_integration_type");
        },
      ),
      { numRuns: 100 },
    );
  });
});
