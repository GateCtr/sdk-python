// Feature: api-logic-completion, Property 5: Webhook-triggering operations dispatch the correct event
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { NextRequest } from "next/server";

/**
 * Validates: Requirements 1.7
 *
 * Property 5: Webhook-triggering operations dispatch the correct event
 * - PATCH: dispatchWebhook called with event "project.updated"
 * - DELETE: dispatchWebhook called with event "project.deleted"
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
import { dispatchWebhook } from "@/lib/webhooks";
import { resolveTeamContext } from "@/lib/team-context";
import { PATCH, DELETE } from "@/app/api/v1/projects/[id]/route";

const OWNER_ID = "user-webhook";
const CLERK_ID = "clerk_webhook";
const PROJECT_ID = "proj-webhook";

const existingProject = {
  id: PROJECT_ID,
  userId: OWNER_ID,
  name: "Webhook Project",
  description: "desc",
  color: "#fff",
  isActive: true,
  slug: "webhook-project",
};

describe("P5: webhook-triggering operations dispatch the correct event", () => {
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
  });

  it("PATCH dispatches project.updated event", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
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
          vi.mocked(prisma.project.update).mockResolvedValue({
            ...existingProject,
            ...body,
          } as never);

          const req = new Request(
            `http://localhost/api/v1/projects/${PROJECT_ID}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          ) as NextRequest;

          await PATCH(req, { params: Promise.resolve({ id: PROJECT_ID }) });

          expect(dispatchWebhook).toHaveBeenCalledOnce();
          const [, event] = vi.mocked(dispatchWebhook).mock.calls[0];
          expect(event).toBe("project.updated");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("DELETE dispatches project.deleted event", async () => {
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

        expect(dispatchWebhook).toHaveBeenCalledOnce();
        const [, event] = vi.mocked(dispatchWebhook).mock.calls[0];
        expect(event).toBe("project.deleted");
      }),
      { numRuns: 100 },
    );
  });
});
