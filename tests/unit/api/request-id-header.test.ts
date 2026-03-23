// Feature: api-logic-completion, Property 6: All responses include X-GateCtr-Request-Id header
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { NextRequest } from "next/server";

/**
 * Validates: Requirements 1.8, 10.5
 *
 * Property 6: All responses include X-GateCtr-Request-Id header
 * For GET, PATCH, DELETE handlers (happy path), the response must include
 * an X-GateCtr-Request-Id header matching /^[0-9a-f]{16}$/
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
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
import { GET, PATCH, DELETE } from "@/app/api/v1/projects/[id]/route";

const REQUEST_ID_REGEX = /^[0-9a-f]{16}$/;

const OWNER_ID = "user-rid";
const CLERK_ID = "clerk_rid";
const PROJECT_ID = "proj-rid";

const project = {
  id: PROJECT_ID,
  userId: OWNER_ID,
  name: "RID Project",
  description: "desc",
  color: "#fff",
  isActive: true,
  slug: "rid-project",
};

describe("P6: all responses include X-GateCtr-Request-Id header", () => {
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
    vi.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
    vi.mocked(prisma.project.update).mockResolvedValue(project as never);
    vi.mocked(prisma.project.delete).mockResolvedValue(project as never);
  });

  it("GET response includes a valid X-GateCtr-Request-Id header", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const req = new Request(
          `http://localhost/api/v1/projects/${PROJECT_ID}`,
          { method: "GET" },
        ) as NextRequest;

        const response = await GET(req, {
          params: Promise.resolve({ id: PROJECT_ID }),
        });

        const rid = response.headers.get("X-GateCtr-Request-Id");
        expect(rid).not.toBeNull();
        expect(rid).toMatch(REQUEST_ID_REGEX);
      }),
      { numRuns: 100 },
    );
  });

  it("PATCH response includes a valid X-GateCtr-Request-Id header", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const req = new Request(
          `http://localhost/api/v1/projects/${PROJECT_ID}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Updated" }),
          },
        ) as NextRequest;

        const response = await PATCH(req, {
          params: Promise.resolve({ id: PROJECT_ID }),
        });

        const rid = response.headers.get("X-GateCtr-Request-Id");
        expect(rid).not.toBeNull();
        expect(rid).toMatch(REQUEST_ID_REGEX);
      }),
      { numRuns: 100 },
    );
  });

  it("DELETE response includes a valid X-GateCtr-Request-Id header", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const req = new Request(
          `http://localhost/api/v1/projects/${PROJECT_ID}`,
          { method: "DELETE" },
        ) as NextRequest;

        const response = await DELETE(req, {
          params: Promise.resolve({ id: PROJECT_ID }),
        });

        const rid = response.headers.get("X-GateCtr-Request-Id");
        expect(rid).not.toBeNull();
        expect(rid).toMatch(REQUEST_ID_REGEX);
      }),
      { numRuns: 100 },
    );
  });
});
