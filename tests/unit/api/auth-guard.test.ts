// Feature: api-logic-completion, Property 21: Unauthenticated requests to protected endpoints return 401
import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

// ── Mock auth to return null userId ──────────────────────────────────────────
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
}));

// Minimal prisma mock — should never be reached for 401 paths
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    project: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    alertRule: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    teamInvitation: { create: vi.fn(), findFirst: vi.fn() },
    integrationConnector: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    teamMember: { findUnique: vi.fn(), update: vi.fn() },
    optimizationRule: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    cacheEntry: { count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  },
}));

vi.mock("@/lib/encryption", () => ({ encrypt: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/webhooks", () => ({ dispatchWebhook: vi.fn() }));
vi.mock("@/lib/plan-guard", () => ({ checkFeatureAccess: vi.fn() }));

import {
  GET as projectsGet,
  POST as projectsPost,
} from "@/app/api/v1/projects/route";
import {
  GET as projectGet,
  PATCH as projectPatch,
  DELETE as projectDelete,
} from "@/app/api/v1/projects/[id]/route";
import {
  GET as alertsGet,
  POST as alertsPost,
} from "@/app/api/v1/alerts/route";
import { POST as invitePost } from "@/app/api/v1/teams/invitations/route";
import { POST as acceptPost } from "@/app/api/v1/teams/invitations/[token]/accept/route";
import {
  GET as integrationsGet,
  POST as integrationsPost,
  DELETE as integrationsDelete,
} from "@/app/api/v1/integrations/route";
import { PATCH as memberRolePatch } from "@/app/api/v1/teams/members/[memberId]/role/route";
import {
  GET as optimizationGet,
  POST as optimizationPost,
} from "@/app/api/v1/optimization-rules/route";
import { GET as cacheStatsGet } from "@/app/api/v1/cache/stats/route";
import { NextRequest } from "next/server";

function req(
  url = "http://localhost/api/v1/test",
  method = "GET",
  body?: object,
) {
  return new NextRequest(url, {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }
      : {}),
  });
}

const protectedHandlers: Array<{ name: string; fn: () => Promise<Response> }> =
  [
    { name: "GET /projects", fn: () => projectsGet(req()) },
    {
      name: "POST /projects",
      fn: () =>
        projectsPost(req("http://localhost", "POST", { name: "x", slug: "x" })),
    },
    {
      name: "GET /projects/[id]",
      fn: () => projectGet(req(), { params: Promise.resolve({ id: "id1" }) }),
    },
    {
      name: "PATCH /projects/[id]",
      fn: () =>
        projectPatch(req("http://localhost", "PATCH", {}), {
          params: Promise.resolve({ id: "id1" }),
        }),
    },
    {
      name: "DELETE /projects/[id]",
      fn: () =>
        projectDelete(req("http://localhost", "DELETE"), {
          params: Promise.resolve({ id: "id1" }),
        }),
    },
    { name: "GET /alerts", fn: () => alertsGet() },
    {
      name: "POST /alerts",
      fn: () => alertsPost(req("http://localhost", "POST", {})),
    },
    {
      name: "POST /teams/invitations",
      fn: () => invitePost(req("http://localhost", "POST", {})),
    },
    {
      name: "POST /teams/invitations/[token]/accept",
      fn: () =>
        acceptPost(req("http://localhost", "POST"), {
          params: Promise.resolve({ token: "tok" }),
        }),
    },
    { name: "GET /integrations", fn: () => integrationsGet() },
    {
      name: "POST /integrations",
      fn: () => integrationsPost(req("http://localhost", "POST", {})),
    },
    {
      name: "DELETE /integrations",
      fn: () => integrationsDelete(req("http://localhost?id=x", "DELETE")),
    },
    {
      name: "PATCH /teams/members/[memberId]/role",
      fn: () =>
        memberRolePatch(req("http://localhost", "PATCH", {}), {
          params: Promise.resolve({ memberId: "m1" }),
        }),
    },
    { name: "GET /optimization-rules", fn: () => optimizationGet(req()) },
    {
      name: "POST /optimization-rules",
      fn: () => optimizationPost(req("http://localhost", "POST", {})),
    },
    { name: "GET /cache/stats", fn: () => cacheStatsGet() },
  ];

describe("Property 21: Unauthenticated requests to protected endpoints return 401", () => {
  it("all protected handlers return 401 with { error: 'Unauthorized' } when auth returns null", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: protectedHandlers.length - 1 }),
        async (index) => {
          const handler = protectedHandlers[index];
          const res = await handler.fn();
          const body = await res.json();

          expect(res.status, `${handler.name} should return 401`).toBe(401);
          expect(body.error, `${handler.name} should return Unauthorized`).toBe(
            "Unauthorized",
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("each handler individually returns 401", async () => {
    for (const handler of protectedHandlers) {
      const res = await handler.fn();
      expect(res.status, `${handler.name} should return 401`).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    }
  });
});
