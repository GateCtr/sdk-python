// Feature: api-logic-completion, Property 9: Duplicate invitation returns 409
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { NextRequest } from "next/server";

/**
 * Validates: Requirements 3.3
 *
 * Property 9: Duplicate invitation returns 409
 * - When a TeamInvitation already exists for (teamId, email), POST returns 409
 *   with error: "invitation_already_exists"
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    team: { findUnique: vi.fn() },
    teamInvitation: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/v1/teams/invitations/route";

const OWNER_ID = "user-dup-test";
const CLERK_ID = "clerk_user-dup-test";
const TEAM_ID = "team-dup-test";

describe("P9: duplicate invitation returns 409", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      userId: CLERK_ID,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: OWNER_ID,
    } as never);
    vi.mocked(prisma.team.findUnique).mockResolvedValue({
      id: TEAM_ID,
      ownerId: OWNER_ID,
    } as never);
    // Simulate existing invitation
    vi.mocked(prisma.teamInvitation.findFirst).mockResolvedValue({
      id: "existing-inv",
      teamId: TEAM_ID,
      email: "existing@example.com",
    } as never);
  });

  it("returns 409 with invitation_already_exists when duplicate (teamId, email) exists", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          teamId: fc.constant(TEAM_ID),
          email: fc.emailAddress(),
          role: fc.constant("MEMBER"),
        }),
        async ({ teamId, email, role }) => {
          const req = new Request("http://localhost/api/v1/teams/invitations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamId, email, role }),
          }) as NextRequest;

          const response = await POST(req);
          const body = await response.json();

          expect(response.status).toBe(409);
          expect(body.error).toBe("invitation_already_exists");
        },
      ),
      { numRuns: 100 },
    );
  });
});
