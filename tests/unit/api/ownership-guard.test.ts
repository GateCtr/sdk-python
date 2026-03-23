// Feature: api-logic-completion, Property 1: Ownership guard blocks non-owners
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { NextRequest } from "next/server";

/**
 * Validates: Requirements 1.2
 *
 * Property 1: Ownership guard blocks non-owners
 * For any userId and resourceUserId where they differ, the GET handler
 * should return 403 Forbidden.
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/team-context", () => ({
  resolveTeamContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/webhooks", () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { resolveTeamContext } from "@/lib/team-context";
import { GET } from "@/app/api/v1/projects/[id]/route";

describe("P1: ownership guard blocks non-owners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when the authenticated user does not own the project", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            userId: fc.string({ minLength: 1 }),
            resourceUserId: fc.string({ minLength: 1 }),
          })
          .filter(({ userId, resourceUserId }) => userId !== resourceUserId),
        async ({ userId, resourceUserId }) => {
          const clerkId = `clerk_${userId}`;
          const teamId = `team_${userId}`;

          vi.mocked(auth).mockResolvedValue({ userId: clerkId } as ReturnType<
            typeof auth
          > extends Promise<infer T>
            ? T
            : never);

          // resolveTeamContext returns the authenticated user's context
          vi.mocked(resolveTeamContext).mockResolvedValue({
            userId,
            teamId,
          });

          // Project belongs to a different user and a different team
          vi.mocked(prisma.project.findUnique).mockResolvedValue({
            id: "proj1",
            userId: resourceUserId,
            teamId: `team_${resourceUserId}`,
          } as never);

          const req = new Request("http://localhost/api/v1/projects/proj1", {
            method: "GET",
          }) as NextRequest;

          const response = await GET(req, {
            params: Promise.resolve({ id: "proj1" }),
          });

          expect(response.status).toBe(403);
        },
      ),
      { numRuns: 100 },
    );
  });
});
