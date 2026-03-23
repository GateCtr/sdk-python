// Feature: api-logic-completion, Property 10: Invitation fetch by token is a round-trip
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { NextRequest } from "next/server";

/**
 * Validates: Requirements 3.4
 *
 * Property 10: Invitation fetch by token is a round-trip
 * - GET /api/v1/teams/invitations/[token] returns invitation including team.name
 * - No auth check is performed (auth mock not called)
 */

const mockAuth = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    teamInvitation: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/v1/teams/invitations/[token]/route";

describe("P10: invitation fetch by token is a round-trip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns invitation with team.name and does not call auth", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          token: fc.stringMatching(/^[0-9a-f]{64}$/),
          teamId: fc.uuid(),
          email: fc.emailAddress(),
          role: fc.constant("MEMBER"),
          teamName: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        async ({ token, teamId, email, role, teamName }) => {
          const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          vi.mocked(prisma.teamInvitation.findUnique).mockResolvedValue({
            id: "inv-1",
            token,
            teamId,
            email,
            role,
            expiresAt: futureDate,
            acceptedAt: null,
            team: { name: teamName },
          } as never);

          const req = new Request(
            `http://localhost/api/v1/teams/invitations/${token}`,
          ) as NextRequest;

          const response = await GET(req, {
            params: Promise.resolve({ token }),
          });

          const body = await response.json();

          expect(response.status).toBe(200);
          expect(body.team.name).toBe(teamName);
          expect(body.token).toBe(token);

          // Auth must NOT have been called
          expect(mockAuth).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});
