// Feature: api-logic-completion, Property 20: System health returns latest record per service
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ── Mocks ────────────────────────────────────────────────────────────────────
const { mockFindFirst } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    systemHealth: { findFirst: mockFindFirst },
  },
}));

import { GET } from "@/app/api/v1/system/health/route";

const SERVICES = ["app", "database", "redis", "queue", "stripe"] as const;

describe("Property 20: System health returns latest record per service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the most recent checkedAt per service", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.constantFrom("HEALTHY", "DEGRADED", "DOWN"),
          fc.constantFrom("HEALTHY", "DEGRADED", "DOWN"),
          fc.constantFrom("HEALTHY", "DEGRADED", "DOWN"),
          fc.constantFrom("HEALTHY", "DEGRADED", "DOWN"),
          fc.constantFrom("HEALTHY", "DEGRADED", "DOWN"),
        ),
        async ([s0, s1, s2, s3, s4]) => {
          // Reset inside property so call counts are per-iteration
          mockFindFirst.mockReset();

          const statuses = [s0, s1, s2, s3, s4];
          const now = new Date();

          statuses.forEach((status, i) => {
            const checkedAt = new Date(now.getTime() - i * 1000);
            mockFindFirst.mockResolvedValueOnce({
              service: SERVICES[i],
              status,
              checkedAt,
            });
          });

          const res = await GET();
          const body = await res.json();

          expect(res.status).toBe(200);
          expect(body).toHaveProperty("status");
          expect(body).toHaveProperty("services");

          for (const svc of SERVICES) {
            expect(body.services).toHaveProperty(svc);
            expect(body.services[svc]).toHaveProperty("status");
            expect(body.services[svc]).toHaveProperty("checkedAt");
          }

          // Exactly 5 calls per GET (one per service)
          expect(mockFindFirst).toHaveBeenCalledTimes(5);

          // Each call uses orderBy: { checkedAt: "desc" }
          for (const call of mockFindFirst.mock.calls) {
            expect(call[0].orderBy).toEqual({ checkedAt: "desc" });
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns unknown status for services with no DB record", async () => {
    // All findFirst calls return null
    mockFindFirst.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    for (const svc of SERVICES) {
      expect(body.services[svc].status).toBe("unknown");
      expect(body.services[svc].checkedAt).toBeNull();
    }
    // Overall status when all unknown — computeOverallStatus returns "healthy"
    // (no DOWN or DEGRADED in the list)
    expect(body.status).toBe("healthy");
  });

  it("overall status is down when any service is DOWN", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 4 }), async (downIndex) => {
        mockFindFirst.mockReset();
        SERVICES.forEach((svc, i) => {
          mockFindFirst.mockResolvedValueOnce({
            service: svc,
            status: i === downIndex ? "DOWN" : "HEALTHY",
            checkedAt: new Date(),
          });
        });

        const res = await GET();
        const body = await res.json();
        expect(body.status).toBe("down");
      }),
      { numRuns: 50 },
    );
  });

  it("overall status is degraded when any service is DEGRADED (no DOWN)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }),
        async (degradedIndex) => {
          mockFindFirst.mockReset();
          SERVICES.forEach((svc, i) => {
            mockFindFirst.mockResolvedValueOnce({
              service: svc,
              status: i === degradedIndex ? "DEGRADED" : "HEALTHY",
              checkedAt: new Date(),
            });
          });

          const res = await GET();
          const body = await res.json();
          expect(body.status).toBe("degraded");
        },
      ),
      { numRuns: 50 },
    );
  });

  it("includes X-GateCtr-Request-Id header", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await GET();
    expect(res.headers.get("X-GateCtr-Request-Id")).toMatch(/^[0-9a-f]{16}$/);
  });
});
