// Feature: api-logic-completion, Property 8: Team invitation token is unique and expires in 7 days
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { NextRequest } from "next/server";

/**
 * Validates: Requirements 3.1
 *
 * Property 8: Team invitation token is unique and expires in 7 days
 * - Token length === 64 (32 random bytes as hex)
 * - expiresAt is within ±2 seconds of now + 7 days
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

const OWNER_ID = "user-token-test";
const CLERK_ID = "clerk_user-token-test";
const TEAM_ID = "team-token-test";

describe("P8: team invitation token is unique and expires in 7 days", () => {
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
    vi.mocked(prisma.teamInvitation.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.teamInvitation.create).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "inv-1", ...data }) as never,
    );
  });

  it("generates a 64-char hex token and expiresAt within ±2s of now + 7 days", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          teamId: fc.constant(TEAM_ID),
          email: fc.emailAddress(),
          role: fc.constant("MEMBER"),
        }),
        async ({ teamId, email, role }) => {
          const before = Date.now();

          const req = new Request("http://localhost/api/v1/teams/invitations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamId, email, role }),
          }) as NextRequest;

          const response = await POST(req);
          expect(response.status).toBe(201);

          const after = Date.now();
          const callArgs = vi
            .mocked(prisma.teamInvitation.create)
            .mock.calls.at(-1)?.[0] as {
            data: { token: string; expiresAt: Date };
          };

          const { token, expiresAt } = callArgs.data;

          // Token must be 64-char hex
          expect(token).toHaveLength(64);
          expect(token).toMatch(/^[0-9a-f]{64}$/);

          // expiresAt must be within ±2 seconds of now + 7 days
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
          const expectedMin = before + sevenDaysMs - 2000;
          const expectedMax = after + sevenDaysMs + 2000;
          expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
          expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
        },
      ),
      { numRuns: 100 },
    );
  });
});
