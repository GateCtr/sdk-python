// Feature: api-logic-completion, Property 11: Accepting an invitation creates a TeamMember and sets acceptedAt
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { NextRequest } from "next/server";

/**
 * Validates: Requirements 3.6
 *
 * Property 11: Accepting an invitation creates a TeamMember and sets acceptedAt
 * - prisma.teamMember.create is called with the invitation's role
 * - prisma.teamInvitation.update is called with acceptedAt set to a non-null Date
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

const MEMBER_ID = "user-accept-test";
const CLERK_ID = "clerk_user-accept-test";

describe("P11: accepting an invitation creates a TeamMember and sets acceptedAt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      userId: CLERK_ID,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: MEMBER_ID,
    } as never);
    vi.mocked(prisma.teamMember.create).mockResolvedValue({
      id: "member-1",
    } as never);
    vi.mocked(prisma.teamInvitation.update).mockResolvedValue({
      id: "inv-1",
    } as never);
  });

  it("calls teamMember.create and teamInvitation.update with a non-null acceptedAt", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          token: fc.stringMatching(/^[0-9a-f]{64}$/),
          teamId: fc.uuid(),
          role: fc.constantFrom("MEMBER", "ADMIN", "VIEWER"),
        }),
        async ({ token, teamId, role }) => {
          vi.mocked(prisma.teamInvitation.findUnique).mockResolvedValue({
            id: "inv-1",
            token,
            teamId,
            role,
            acceptedAt: null,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          } as never);

          const req = new Request(
            `http://localhost/api/v1/teams/invitations/${token}/accept`,
            { method: "POST" },
          ) as NextRequest;

          const response = await POST(req, {
            params: Promise.resolve({ token }),
          });

          expect(response.status).toBe(200);

          // teamMember.create must have been called
          expect(prisma.teamMember.create).toHaveBeenCalled();
          const createArgs = vi
            .mocked(prisma.teamMember.create)
            .mock.calls.at(-1)?.[0] as {
            data: { teamId: string; userId: string; role: string };
          };
          expect(createArgs.data.teamId).toBe(teamId);
          expect(createArgs.data.role).toBe(role);

          // teamInvitation.update must have been called with a non-null Date
          expect(prisma.teamInvitation.update).toHaveBeenCalled();
          const updateArgs = vi
            .mocked(prisma.teamInvitation.update)
            .mock.calls.at(-1)?.[0] as {
            data: { acceptedAt: unknown };
          };
          expect(updateArgs.data.acceptedAt).toBeInstanceOf(Date);
          expect(updateArgs.data.acceptedAt).not.toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
