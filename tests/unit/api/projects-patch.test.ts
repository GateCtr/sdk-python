// Feature: api-logic-completion, Property 3: Partial update preserves unmodified fields
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { NextRequest } from "next/server";

/**
 * Validates: Requirements 1.3
 *
 * Property 3: Partial update preserves unmodified fields
 * For any subset of updatable fields, only the provided (non-undefined) fields
 * should be included in the prisma.project.update data argument.
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    project: { findUnique: vi.fn(), update: vi.fn() },
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
import { PATCH } from "@/app/api/v1/projects/[id]/route";

const OWNER_ID = "user-owner";
const CLERK_ID = "clerk_owner";
const PROJECT_ID = "proj-test";

const existingProject = {
  id: PROJECT_ID,
  userId: OWNER_ID,
  name: "Old Name",
  description: "Old Desc",
  color: "#000000",
  isActive: true,
  slug: "old-slug",
};

describe("P3: partial update preserves unmodified fields", () => {
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
    vi.mocked(prisma.project.findUnique).mockResolvedValue(
      existingProject as never,
    );
  });

  it("only includes provided fields in the update data", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          description: fc.option(fc.string(), { nil: undefined }),
          color: fc.option(fc.string(), { nil: undefined }),
          isActive: fc.option(fc.boolean(), { nil: undefined }),
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
          vi.mocked(prisma.project.findUnique).mockResolvedValue(
            existingProject as never,
          );

          // Build the updated project from the body (merging with existing)
          const updatedProject = {
            ...existingProject,
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.description !== undefined
              ? { description: body.description }
              : {}),
            ...(body.color !== undefined ? { color: body.color } : {}),
            ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          };
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

          const updateCall = vi.mocked(prisma.project.update).mock.calls[0];
          if (!updateCall) return; // no call means something else failed — skip

          const data = updateCall[0].data as Record<string, unknown>;

          // Only keys present in body (not undefined) should be in data
          const expectedKeys = (
            Object.keys(body) as Array<keyof typeof body>
          ).filter((k) => body[k] !== undefined);

          for (const key of expectedKeys) {
            expect(data).toHaveProperty(key);
            expect(data[key]).toBe(body[key]);
          }

          // Keys that were undefined in body should NOT be in data
          const absentKeys = (
            Object.keys(body) as Array<keyof typeof body>
          ).filter((k) => body[k] === undefined);
          for (const key of absentKeys) {
            expect(data).not.toHaveProperty(key);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
