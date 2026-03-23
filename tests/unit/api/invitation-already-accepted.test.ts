// Feature: api-logic-completion, Property 12: Already-accepted invitation returns 409
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { NextRequest } from "next/server";

/**
 * Validates: Requirements 3.7
 *
 * Property 12: Already-accepted invitation returns 409
 * - When acceptedAt is not null, POST to accept returns 409
 *   with error: "invitation_already_accepted"
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    teamInvitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    teamMember: { create: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/webhooks", () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/v1/teams/invitations/[token]/accept/route";

const MEMBER_ID = "user-already-accepted-test";
const CLERK_ID = "clerk_user-already-accepted-test";

describe("P12: already-accepted invitation returns 409", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      userId: CLERK_ID,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: MEMBER_ID,
    } as never);
  });

  it("returns 409 with invitation_already_accepted when acceptedAt is not null", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          token: fc.stringMatching(/^[0-9a-f]{64}$/),
          teamId: fc.uuid(),
          role: fc.constantFrom("MEMBER", "ADMIN", "VIEWER"),
          // acceptedAt is a past date (not null)
          acceptedAt: fc.date({ max: new Date() }),
        }),
        async ({ token, teamId, role, acceptedAt }) => {
          vi.mocked(prisma.teamInvitation.findUnique).mockResolvedValue({
            id: "inv-1",
            token,
            teamId,
            role,
            acceptedAt,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          } as never);

          const req = new Request(
            `http://localhost/api/v1/teams/invitations/${token}/accept`,
            { method: "POST" },
          ) as NextRequest;

          const response = await POST(req, {
            params: Promise.resolve({ token }),
          });

          const body = await response.json();

          expect(response.status).toBe(409);
          expect(body.error).toBe("invitation_already_accepted");
        },
      ),
      { numRuns: 100 },
    );
  });
});
