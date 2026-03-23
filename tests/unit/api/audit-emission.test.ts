// Feature: api-logic-completion, Property 4: Mutating operations emit audit log entries
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { NextRequest } from "next/server";

/**
 * Validates: Requirements 1.5, 1.6
 *
 * Property 4: Mutating operations emit audit log entries
 * - PATCH: logAudit called with resource: "project", action: "updated", oldValue and newValue present
 * - DELETE: logAudit called with resource: "project", action: "deleted"
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/team-context", () => ({
  resolveTeamContext: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    project: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
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
import { logAudit } from "@/lib/audit";
import { resolveTeamContext } from "@/lib/team-context";
import { PATCH, DELETE } from "@/app/api/v1/projects/[id]/route";

const OWNER_ID = "user-audit";
const CLERK_ID = "clerk_audit";
const PROJECT_ID = "proj-audit";

const existingProject = {
  id: PROJECT_ID,
  userId: OWNER_ID,
  name: "Audit Project",
  description: "desc",
  color: "#fff",
  isActive: true,
  slug: "audit-project",
};

describe("P4: mutating operations emit audit log entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ userId: CLERK_ID } as ReturnType<
      typeof auth
    > extends Promise<infer T>
      ? T
      : never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: OWNER_ID,
    } as never);
    vi.mocked(resolveTeamContext).mockResolvedValue({
      userId: OWNER_ID,
      teamId: "team-1",
    });
    vi.mocked(prisma.project.findUnique).mockResolvedValue(
      existingProject as never,
    );
    vi.mocked(prisma.project.delete).mockResolvedValue(
      existingProject as never,
    );
  });

  it("PATCH emits audit log with resource=project, action=updated, oldValue and newValue", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          description: fc.option(fc.string(), { nil: undefined }),
        }),
        async (body) => {
          vi.clearAllMocks();
          vi.mocked(auth).mockResolvedValue({ userId: CLERK_ID } as ReturnType<
            typeof auth
          > extends Promise<infer T>
            ? T
            : never);
          vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: OWNER_ID,
          } as never);
          vi.mocked(resolveTeamContext).mockResolvedValue({
            userId: OWNER_ID,
            teamId: "team-1",
          });
          vi.mocked(prisma.project.findUnique).mockResolvedValue(
            existingProject as never,
          );

          const updatedProject = { ...existingProject, ...body };
          vi.mocked(prisma.project.update).mockResolvedValue(
            updatedProject as never,
          );

          const req = new Request(
            `http://localhost/api/v1/projects/${PROJECT_ID}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          ) as NextRequest;

          await PATCH(req, { params: Promise.resolve({ id: PROJECT_ID }) });

          expect(logAudit).toHaveBeenCalledOnce();
          const callArg = vi.mocked(logAudit).mock.calls[0][0];
          expect(callArg.resource).toBe("project");
          expect(callArg.action).toBe("updated");
          expect(callArg).toHaveProperty("oldValue");
          expect(callArg).toHaveProperty("newValue");
          expect(callArg.oldValue).not.toBeUndefined();
          expect(callArg.newValue).not.toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("DELETE emits audit log with resource=project, action=deleted", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({ userId: CLERK_ID } as ReturnType<
          typeof auth
        > extends Promise<infer T>
          ? T
          : never);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          id: OWNER_ID,
        } as never);
        vi.mocked(resolveTeamContext).mockResolvedValue({
          userId: OWNER_ID,
          teamId: "team-1",
        });
        vi.mocked(prisma.project.findUnique).mockResolvedValue(
          existingProject as never,
        );
        vi.mocked(prisma.project.delete).mockResolvedValue(
          existingProject as never,
        );

        const req = new Request(
          `http://localhost/api/v1/projects/${PROJECT_ID}`,
          { method: "DELETE" },
        ) as NextRequest;

        await DELETE(req, { params: Promise.resolve({ id: PROJECT_ID }) });

        expect(logAudit).toHaveBeenCalledOnce();
        const callArg = vi.mocked(logAudit).mock.calls[0][0];
        expect(callArg.resource).toBe("project");
        expect(callArg.action).toBe("deleted");
      }),
      { numRuns: 100 },
    );
  });
});
