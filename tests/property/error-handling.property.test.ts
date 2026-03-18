/**
 * Property-Based Tests for Error Handling (Task 26.4)
 *
 * Property 62: Permission Check Fail-Secure
 * When permission checks fail due to errors, the system should deny access
 * (fail-secure property) rather than throwing or returning true.
 *
 * Also tests:
 * - Redis fallback: when Redis throws but DB succeeds, system falls back to DB
 * - DB error: when DB throws, hasPermission returns false (fail-secure)
 *
 * **Validates: Requirements 18.7**
 *
 * Library: fast-check (fc) + vitest
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import {
  ROLE_PERMISSIONS,
  type RoleName,
  type Permission,
} from "@/lib/permissions";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userRole: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  getCachedPermissions: vi.fn(),
  setCachedPermissions: vi.fn(),
  invalidateCache: vi.fn(),
  redis: {},
  CACHE_TTL: 300,
  PERMISSION_CACHE_PREFIX: "permissions:",
}));

// ─── Helpers / constants ──────────────────────────────────────────────────────

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS) as RoleName[];
const ALL_PERMISSIONS: Permission[] = Array.from(
  new Set(ALL_ROLES.flatMap((r) => ROLE_PERMISSIONS[r])),
);

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const userIdArb = fc.uuid();
const permissionArb = fc.constantFrom(...ALL_PERMISSIONS);
const roleArb = fc.constantFrom(...ALL_ROLES);

// ═════════════════════════════════════════════════════════════════════════════
// Property 62: Permission Check Fail-Secure
// Validates: Requirements 18.7
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 62: Permission Check Fail-Secure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * When both Redis AND the database throw errors, hasPermission must return
   * false (deny access) rather than throwing or returning true.
   *
   * **Validates: Requirements 18.7**
   */
  it("returns false when Redis throws AND database throws (fail-secure)", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, permissionArb, async (userId, permission) => {
        const { getCachedPermissions, setCachedPermissions } =
          await import("@/lib/redis");
        const { prisma } = await import("@/lib/prisma");
        const { hasPermission } = await import("@/lib/permissions");

        vi.mocked(getCachedPermissions).mockRejectedValue(
          new Error("Redis connection failed"),
        );
        vi.mocked(setCachedPermissions).mockRejectedValue(
          new Error("Redis connection failed"),
        );
        vi.mocked(prisma.userRole.findMany).mockRejectedValue(
          new Error("DB connection failed"),
        );

        const result = await hasPermission(userId, permission);

        // Fail-secure: errors must never grant access
        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * hasPermission must never throw — it should always resolve to a boolean.
   * Throwing would be a fail-open behaviour (caller might default to allowing).
   *
   * **Validates: Requirements 18.7**
   */
  it("never throws when both Redis and database fail", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, permissionArb, async (userId, permission) => {
        const { getCachedPermissions } = await import("@/lib/redis");
        const { prisma } = await import("@/lib/prisma");
        const { hasPermission } = await import("@/lib/permissions");

        vi.mocked(getCachedPermissions).mockRejectedValue(
          new Error("Redis unavailable"),
        );
        vi.mocked(prisma.userRole.findMany).mockRejectedValue(
          new Error("DB unavailable"),
        );

        // Must resolve, not reject
        await expect(hasPermission(userId, permission)).resolves.toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * When the database throws, hasPermission must return false regardless of
   * which permission is being checked.
   *
   * **Validates: Requirements 18.7**
   */
  it("returns false for every permission when database throws", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, permissionArb, async (userId, permission) => {
        const { getCachedPermissions, setCachedPermissions } =
          await import("@/lib/redis");
        const { prisma } = await import("@/lib/prisma");
        const { hasPermission } = await import("@/lib/permissions");

        // Redis returns null (cache miss) → falls through to DB
        vi.mocked(getCachedPermissions).mockResolvedValue(null);
        vi.mocked(setCachedPermissions).mockResolvedValue(undefined);
        vi.mocked(prisma.userRole.findMany).mockRejectedValue(
          new Error("DB error"),
        );

        const result = await hasPermission(userId, permission);

        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Errors must never result in granting access — even for permissions that
   * would normally be granted to a role.
   *
   * **Validates: Requirements 18.7**
   */
  it("errors never grant access even for permissions that would normally be allowed", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, roleArb, async (userId, role) => {
        const { getCachedPermissions } = await import("@/lib/redis");
        const { prisma } = await import("@/lib/prisma");
        const { hasPermission } = await import("@/lib/permissions");

        // Simulate total failure
        vi.mocked(getCachedPermissions).mockRejectedValue(
          new Error("Redis down"),
        );
        vi.mocked(prisma.userRole.findMany).mockRejectedValue(
          new Error("DB down"),
        );

        // Check every permission that this role would normally have
        const rolePermissions = ROLE_PERMISSIONS[role];
        for (const permission of rolePermissions) {
          const result = await hasPermission(userId, permission);
          // Even though the role has this permission, errors must deny access
          expect(result).toBe(false);
        }
      }),
      { numRuns: 50 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Redis Fallback: when Redis returns null (internal error handled), DB is used
// Validates: Requirements 10.8, 18.3
//
// Note: getCachedPermissions in lib/redis.ts catches Redis errors internally
// and returns null (cache miss). hasPermission then falls through to the DB.
// The fail-secure path (return false) only triggers when getCachedPermissions
// itself throws (which it doesn't — it catches internally).
// ═════════════════════════════════════════════════════════════════════════════

describe("Redis Fallback: DB is used when Redis is unavailable (returns null)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * When Redis is unavailable, getCachedPermissions returns null (internal
   * error handling in lib/redis.ts). hasPermission then falls back to the DB
   * and returns the correct permission result.
   *
   * **Validates: Requirements 10.8, 18.3**
   */
  it("falls back to database when Redis returns null (cache miss due to Redis error)", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, roleArb, async (userId, role) => {
        const { getCachedPermissions, setCachedPermissions } =
          await import("@/lib/redis");
        const { prisma } = await import("@/lib/prisma");
        const { hasPermission } = await import("@/lib/permissions");

        // Redis internally caught its error and returned null (cache miss)
        vi.mocked(getCachedPermissions).mockResolvedValue(null);
        vi.mocked(setCachedPermissions).mockResolvedValue(undefined);
        // DB succeeds and returns the role
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([
          { role: { name: role } } as never,
        ]);

        const rolePermissions = ROLE_PERMISSIONS[role];
        if (rolePermissions.length === 0) return;

        const permission = rolePermissions[0];
        const result = await hasPermission(userId, permission);

        // DB fallback should correctly grant the permission
        expect(result).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * When Redis returns null and DB returns no roles, permissions are denied.
   *
   * **Validates: Requirements 10.8, 18.3**
   */
  it("correctly denies permissions via DB fallback when user has no roles", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, permissionArb, async (userId, permission) => {
        const { getCachedPermissions, setCachedPermissions } =
          await import("@/lib/redis");
        const { prisma } = await import("@/lib/prisma");
        const { hasPermission } = await import("@/lib/permissions");

        // Redis returns null (cache miss)
        vi.mocked(getCachedPermissions).mockResolvedValue(null);
        vi.mocked(setCachedPermissions).mockResolvedValue(undefined);
        // DB returns no roles for this user
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([]);

        const result = await hasPermission(userId, permission);
        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * When Redis returns null and DB succeeds, hasPermission resolves without
   * throwing.
   *
   * **Validates: Requirements 10.8, 18.3**
   */
  it("never throws when Redis returns null but DB succeeds", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, permissionArb, async (userId, permission) => {
        const { getCachedPermissions, setCachedPermissions } =
          await import("@/lib/redis");
        const { prisma } = await import("@/lib/prisma");
        const { hasPermission } = await import("@/lib/permissions");

        vi.mocked(getCachedPermissions).mockResolvedValue(null);
        vi.mocked(setCachedPermissions).mockResolvedValue(undefined);
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([]);

        await expect(hasPermission(userId, permission)).resolves.toBeDefined();
      }),
      { numRuns: 100 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DB Error: hasPermission returns false when DB throws
// Validates: Requirements 18.7
// ═════════════════════════════════════════════════════════════════════════════

describe("DB Error: hasPermission returns false when database throws", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * When the cache misses and the database throws, hasPermission must return
   * false (fail-secure).
   *
   * **Validates: Requirements 18.7**
   */
  it("returns false on cache miss + DB error", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, permissionArb, async (userId, permission) => {
        const { getCachedPermissions, setCachedPermissions } =
          await import("@/lib/redis");
        const { prisma } = await import("@/lib/prisma");
        const { hasPermission } = await import("@/lib/permissions");

        vi.mocked(getCachedPermissions).mockResolvedValue(null); // cache miss
        vi.mocked(setCachedPermissions).mockResolvedValue(undefined);
        vi.mocked(prisma.userRole.findMany).mockRejectedValue(
          new Error("DB timeout"),
        );

        const result = await hasPermission(userId, permission);
        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * The fail-secure property holds regardless of the error type thrown by the DB.
   *
   * **Validates: Requirements 18.7**
   */
  it("returns false for any type of DB error", async () => {
    const errorArb = fc.oneof(
      fc.constant(new Error("Connection timeout")),
      fc.constant(new Error("Query failed")),
      fc.constant(new TypeError("Cannot read property of undefined")),
      fc.constant(new RangeError("Out of range")),
    );

    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        permissionArb,
        errorArb,
        async (userId, permission, error) => {
          const { getCachedPermissions, setCachedPermissions } =
            await import("@/lib/redis");
          const { prisma } = await import("@/lib/prisma");
          const { hasPermission } = await import("@/lib/permissions");

          vi.mocked(getCachedPermissions).mockResolvedValue(null);
          vi.mocked(setCachedPermissions).mockResolvedValue(undefined);
          vi.mocked(prisma.userRole.findMany).mockRejectedValue(error);

          const result = await hasPermission(userId, permission);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
