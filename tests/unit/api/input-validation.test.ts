// Feature: api-logic-completion, Property 2: Input validation rejects invalid enum values and missing fields
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { NextRequest } from "next/server";

/**
 * Validates: Requirements 2.3, 2.4
 *
 * Property 2: Input validation rejects invalid enum values and missing fields
 * - POST with alertType outside the allowed set → 400 invalid_alert_type
 * - POST with missing required fields → 400 validation_error
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    alertRule: { create: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/v1/alerts/route";

const VALID_ALERT_TYPES = [
  "budget_threshold",
  "token_limit",
  "error_rate",
  "latency",
];

const OWNER_ID = "user-validation";
const CLERK_ID = "clerk_user-validation";

describe("P2: input validation rejects invalid enum values and missing fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      userId: CLERK_ID,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: OWNER_ID,
    } as never);
  });

  it("returns 400 invalid_alert_type when alertType is not in the allowed set", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1 })
          .filter((s) => !VALID_ALERT_TYPES.includes(s)),
        async (invalidType) => {
          const req = new Request("http://localhost/api/v1/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "test",
              alertType: invalidType,
              condition: {},
            }),
          }) as NextRequest;

          const response = await POST(req);
          const body = await response.json();

          expect(response.status).toBe(400);
          expect(body.error).toBe("invalid_alert_type");
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
            name: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            alertType: fc.option(fc.constant("budget_threshold"), {
              nil: undefined,
            }),
            condition: fc.option(fc.constant({}), { nil: undefined }),
          })
          .filter((b) => !b.name || !b.alertType || !b.condition),
        async (body) => {
          const req = new Request("http://localhost/api/v1/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }) as NextRequest;

          const response = await POST(req);
          const responseBody = await response.json();

          expect(response.status).toBe(400);
          expect(responseBody.error).toBe("validation_error");
        },
      ),
      { numRuns: 100 },
    );
  });
});
