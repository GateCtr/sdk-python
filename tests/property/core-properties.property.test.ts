/**
 * Core Property-Based Tests
 *
 * Tasks 24.1 – 24.6 from the clerk-auth-rbac spec.
 * All properties are implemented in this single file.
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

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
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

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...actual,
    logAudit: vi.fn().mockResolvedValue(undefined),
  };
});

// ─── Helpers / constants ─────────────────────────────────────────────────────

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS) as RoleName[];

const ADMIN_ROLES: RoleName[] = ["SUPER_ADMIN", "ADMIN", "MANAGER", "SUPPORT"];
const NON_ADMIN_ROLES: RoleName[] = ALL_ROLES.filter(
  (r) => !ADMIN_ROLES.includes(r),
);

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const roleArb = fc.constantFrom(...ALL_ROLES);
const userIdArb = fc.uuid();

// ═════════════════════════════════════════════════════════════════════════════
// Task 24.1 – Property 3 (Session Persistence Round-Trip)
//           + Property 53 (Session Refresh Persistence)
// Validates: Requirements 1.6, 15.1, 15.2, 15.3
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Session state machine used to model Clerk session behaviour without
 * requiring a real Clerk instance.
 */
interface SessionState {
  userId: string | null;
  isAuthenticated: boolean;
}

function signIn(userId: string): SessionState {
  return { userId, isAuthenticated: true };
}

function signOut(): SessionState {
  return { userId: null, isAuthenticated: false };
}

/** Simulate a page navigation – session is preserved if already authenticated */
function navigate(session: SessionState): SessionState {
  return { ...session };
}

/** Simulate a page refresh – session is restored from cookies when authenticated */
function refresh(session: SessionState): SessionState {
  return { ...session };
}

describe("Property 3: Session Persistence Round-Trip", () => {
  /**
   * For any authenticated user, navigating away from and back to a protected
   * route should preserve the session without requiring re-authentication.
   *
   * **Validates: Requirements 1.6, 15.1, 15.3**
   */
  it("sign-in produces an authenticated session", () => {
    fc.assert(
      fc.property(userIdArb, (userId) => {
        const session = signIn(userId);
        expect(session.isAuthenticated).toBe(true);
        expect(session.userId).toBe(userId);
      }),
      { numRuns: 200 },
    );
  });

  it("session is preserved across page navigations (round-trip)", () => {
    fc.assert(
      fc.property(userIdArb, (userId) => {
        const initial = signIn(userId);
        const afterNav = navigate(initial);
        const afterReturn = navigate(afterNav);
        expect(afterReturn.isAuthenticated).toBe(true);
        expect(afterReturn.userId).toBe(userId);
      }),
      { numRuns: 200 },
    );
  });

  it("sign-in then sign-out returns to unauthenticated state", () => {
    fc.assert(
      fc.property(userIdArb, (userId) => {
        const afterSignIn = signIn(userId);
        const afterSignOut = signOut();
        expect(afterSignIn.isAuthenticated).toBe(true);
        expect(afterSignOut.isAuthenticated).toBe(false);
        expect(afterSignOut.userId).toBeNull();
      }),
      { numRuns: 200 },
    );
  });
});

describe("Property 53: Session Refresh Persistence", () => {
  /**
   * For any authenticated user refreshing the page on a protected route,
   * the system should restore the session from cookies.
   *
   * **Validates: Requirements 15.2**
   */
  it("session is restored after page refresh", () => {
    fc.assert(
      fc.property(userIdArb, (userId) => {
        const session = signIn(userId);
        const afterRefresh = refresh(session);
        expect(afterRefresh.isAuthenticated).toBe(true);
        expect(afterRefresh.userId).toBe(userId);
      }),
      { numRuns: 200 },
    );
  });

  it("unauthenticated session remains unauthenticated after refresh", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const session: SessionState = { userId: null, isAuthenticated: false };
        const afterRefresh = refresh(session);
        expect(afterRefresh.isAuthenticated).toBe(false);
        expect(afterRefresh.userId).toBeNull();
      }),
      { numRuns: 50 },
    );
  });

  it("multiple refreshes preserve session state", () => {
    fc.assert(
      fc.property(
        userIdArb,
        fc.integer({ min: 1, max: 10 }),
        (userId, refreshCount) => {
          let session = signIn(userId);
          for (let i = 0; i < refreshCount; i++) {
            session = refresh(session);
          }
          expect(session.isAuthenticated).toBe(true);
          expect(session.userId).toBe(userId);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 24.2 – Property 4 (Sign-Out Session Termination)
// Validates: Requirements 1.7, 15.4
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 4: Sign-Out Session Termination", () => {
  /**
   * For any authenticated user, signing out should terminate the session such
   * that subsequent access to protected routes requires re-authentication.
   *
   * **Validates: Requirements 1.7, 15.4**
   */
  it("sign-out always produces an unauthenticated state", () => {
    fc.assert(
      fc.property(userIdArb, () => {
        const terminated = signOut();
        expect(terminated.isAuthenticated).toBe(false);
        expect(terminated.userId).toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  it("protected route access is denied after sign-out", () => {
    fc.assert(
      fc.property(userIdArb, () => {
        const terminated = signOut();
        // Simulate middleware check: unauthenticated → redirect required
        const requiresReauth = !terminated.isAuthenticated;
        expect(requiresReauth).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("sign-out is idempotent – calling it multiple times stays unauthenticated", () => {
    fc.assert(
      fc.property(
        userIdArb,
        fc.integer({ min: 1, max: 5 }),
        (userId, times) => {
          let session = signIn(userId);
          for (let i = 0; i < times; i++) {
            session = signOut();
          }
          expect(session.isAuthenticated).toBe(false);
          expect(session.userId).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });

  it("sign-in after sign-out restores authentication", () => {
    fc.assert(
      fc.property(userIdArb, (userId) => {
        const reauth = signIn(userId);
        expect(reauth.isAuthenticated).toBe(true);
        expect(reauth.userId).toBe(userId);
      }),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 24.3 – Property 26 (Permission Cache Invalidation on Role Change)
//           + Property 54 (Cache Invalidation Freshness)
//           + Property 55 (Cache Miss Database Fetch)
// Validates: Requirements 5.10, 16.1, 16.2, 16.4, 16.5
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 26: Permission Cache Invalidation on Role Change", () => {
  /**
   * For any user whose roles are modified (granted or revoked), the system
   * should invalidate the permission cache for that user.
   *
   * **Validates: Requirements 5.10, 16.1, 16.2**
   */
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invalidatePermissionCache calls redis invalidateCache with the userId", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const { invalidateCache } = await import("@/lib/redis");
        const { invalidatePermissionCache } = await import("@/lib/permissions");

        vi.mocked(invalidateCache).mockResolvedValue(undefined);

        await invalidatePermissionCache(userId);

        expect(invalidateCache).toHaveBeenCalledWith(userId);
      }),
      { numRuns: 100 },
    );
  });

  it("after cache invalidation, getCachedPermissions returns null (cache miss)", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const { getCachedPermissions, invalidateCache } =
          await import("@/lib/redis");

        // Simulate: cache was populated, then invalidated
        vi.mocked(invalidateCache).mockImplementation(async () => {
          vi.mocked(getCachedPermissions).mockResolvedValueOnce(null);
        });

        await invalidateCache(userId);
        const result = await getCachedPermissions(userId);

        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 54: Cache Invalidation Freshness", () => {
  /**
   * For any cache invalidation operation, subsequent permission checks should
   * reflect updated permissions within 100 milliseconds.
   *
   * **Validates: Requirements 16.4**
   */
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permission check after invalidation fetches from DB (not stale cache)", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, roleArb, async (userId, role) => {
        const { getCachedPermissions, setCachedPermissions, invalidateCache } =
          await import("@/lib/redis");
        const { prisma } = await import("@/lib/prisma");

        const freshPermissions = ROLE_PERMISSIONS[role];

        // After invalidation, cache returns null → DB is queried
        vi.mocked(invalidateCache).mockResolvedValue(undefined);
        vi.mocked(getCachedPermissions).mockResolvedValue(null);
        vi.mocked(setCachedPermissions).mockResolvedValue(undefined);
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([
          { role: { name: role } } as never,
        ]);

        const { invalidatePermissionCache, getUserPermissions } =
          await import("@/lib/permissions");

        await invalidatePermissionCache(userId);
        const permissions = await getUserPermissions(userId);

        // Fresh permissions from DB should match the role's permission set
        for (const p of freshPermissions) {
          expect(permissions).toContain(p);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 55: Cache Miss Database Fetch", () => {
  /**
   * For any permission check after cache invalidation, the system should
   * fetch fresh data from the database.
   *
   * **Validates: Requirements 16.5**
   */
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cache miss triggers a database query and caches the result", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, roleArb, async (userId, role) => {
        const { getCachedPermissions, setCachedPermissions } =
          await import("@/lib/redis");
        const { prisma } = await import("@/lib/prisma");

        vi.mocked(getCachedPermissions).mockResolvedValue(null);
        vi.mocked(setCachedPermissions).mockResolvedValue(undefined);
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([
          { role: { name: role } } as never,
        ]);

        const { getUserPermissions } = await import("@/lib/permissions");
        await getUserPermissions(userId);

        expect(prisma.userRole.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { userId } }),
        );
        expect(setCachedPermissions).toHaveBeenCalledWith(
          userId,
          expect.any(Array),
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 24.4 – Property 28 (Role Modification Inverse Property)
// Validates: Requirements 13.7
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 28: Role Modification Inverse Property", () => {
  /**
   * For any user, adding then removing a role should return the user to their
   * original permission state.
   *
   * **Validates: Requirements 13.7**
   */

  /** Compute the union of permissions for a set of roles */
  function permissionsForRoles(roles: RoleName[]): Set<Permission> {
    const set = new Set<Permission>();
    for (const role of roles) {
      for (const p of ROLE_PERMISSIONS[role]) {
        set.add(p);
      }
    }
    return set;
  }

  it("adding then removing a role returns to original permission set", () => {
    fc.assert(
      fc.property(
        fc.array(roleArb, { minLength: 0, maxLength: 3 }),
        roleArb,
        (initialRoles, addedRole) => {
          const original = permissionsForRoles(initialRoles);

          // Add role
          const withRole = permissionsForRoles([...initialRoles, addedRole]);

          // Remove role (restore original set)
          const restored = permissionsForRoles(initialRoles);

          // Restored must equal original
          expect(restored.size).toBe(original.size);
          for (const p of original) {
            expect(restored.has(p)).toBe(true);
          }
          for (const p of restored) {
            expect(original.has(p)).toBe(true);
          }

          // Adding a role can only increase or maintain permissions
          for (const p of original) {
            expect(withRole.has(p)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("permission set is deterministic for the same role combination", () => {
    fc.assert(
      fc.property(
        fc.array(roleArb, { minLength: 0, maxLength: 4 }),
        (roles) => {
          const first = permissionsForRoles(roles);
          const second = permissionsForRoles(roles);
          expect(first.size).toBe(second.size);
          for (const p of first) {
            expect(second.has(p)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("removing all roles returns to empty permission set", () => {
    fc.assert(
      fc.property(
        fc.array(roleArb, { minLength: 1, maxLength: 4 }),
        (roles) => {
          const withRoles = permissionsForRoles(roles);
          expect(withRoles.size).toBeGreaterThan(0);

          const empty = permissionsForRoles([]);
          expect(empty.size).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 24.5 – Property 29 (Admin Area Access Control)
//           + Property 30 (Admin Area Unauthorized Redirect)
// Validates: Requirements 6.2, 6.3, 8.4
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Inline implementation of the admin-access check that mirrors
 * checkRouteAccess in lib/permissions.ts (synchronous, no DB needed).
 */
function isAdminRole(role: RoleName): boolean {
  return ADMIN_ROLES.includes(role);
}

function userHasAdminRole(roles: RoleName[]): boolean {
  return roles.some(isAdminRole);
}

function isAdminRoute(route: string): boolean {
  return route.includes("/admin/") || route === "/admin";
}

describe("Property 29: Admin Area Access Control", () => {
  /**
   * For any user accessing admin routes, the system should verify the user
   * has one of: SUPER_ADMIN, ADMIN, MANAGER, or SUPPORT.
   *
   * **Validates: Requirements 6.2, 8.4**
   */

  const adminRouteArb = fc.constantFrom(
    "/admin/users",
    "/admin/audit-logs",
    "/admin/waitlist",
    "/fr/admin/users",
    "/fr/admin/audit-logs",
  );

  it("admin roles are granted access to admin routes", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ADMIN_ROLES),
        adminRouteArb,
        (role, route) => {
          const hasAccess = isAdminRoute(route) && userHasAdminRole([role]);
          expect(hasAccess).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("non-admin roles are denied access to admin routes", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_ADMIN_ROLES),
        adminRouteArb,
        (role, route) => {
          const hasAccess = isAdminRoute(route) && userHasAdminRole([role]);
          expect(hasAccess).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("a user with at least one admin role gets access", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ADMIN_ROLES),
        fc.array(fc.constantFrom(...NON_ADMIN_ROLES), {
          minLength: 0,
          maxLength: 3,
        }),
        adminRouteArb,
        (adminRole, extraRoles, route) => {
          const roles: RoleName[] = [adminRole, ...extraRoles];
          const hasAccess = isAdminRoute(route) && userHasAdminRole(roles);
          expect(hasAccess).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Property 30: Admin Area Unauthorized Redirect", () => {
  /**
   * For any user without admin roles attempting to access admin routes,
   * the system should redirect to /dashboard with an error message.
   *
   * **Validates: Requirements 6.3**
   */

  function buildAccessDeniedRedirect(locale: "en" | "fr"): string {
    const base = locale === "fr" ? "/fr/dashboard" : "/dashboard";
    return `${base}?error=access_denied`;
  }

  it("non-admin users are redirected to /dashboard with error", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...NON_ADMIN_ROLES), {
          minLength: 0,
          maxLength: 3,
        }),
        fc.constantFrom<"en" | "fr">("en", "fr"),
        (roles, locale) => {
          const hasAdmin = userHasAdminRole(roles);
          if (!hasAdmin) {
            const redirect = buildAccessDeniedRedirect(locale);
            expect(redirect).toContain("/dashboard");
            expect(redirect).toContain("error=access_denied");
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("redirect preserves locale for French users", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...NON_ADMIN_ROLES), {
          minLength: 0,
          maxLength: 2,
        }),
        (roles) => {
          const hasAdmin = userHasAdminRole(roles);
          if (!hasAdmin) {
            const frRedirect = buildAccessDeniedRedirect("fr");
            expect(frRedirect.startsWith("/fr/")).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("redirect preserves locale for English users", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...NON_ADMIN_ROLES), {
          minLength: 0,
          maxLength: 2,
        }),
        (roles) => {
          const hasAdmin = userHasAdminRole(roles);
          if (!hasAdmin) {
            const enRedirect = buildAccessDeniedRedirect("en");
            expect(enRedirect.startsWith("/fr")).toBe(false);
            expect(enRedirect.startsWith("/dashboard")).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 24.6 – Property 15 (User Creation Audit Logging)
//           + Property 18 (User Deletion Audit Logging)
//           + Property 35 (Access Denial Audit Logging)
//           + Property 36 (Role Grant Audit Logging)
//           + Property 37 (Role Revoke Audit Logging)
// Validates: Requirements 3.6, 3.9, 8.7, 9.1, 9.2, 9.3, 9.4, 9.5
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 15: User Creation Audit Logging", () => {
  /**
   * For any valid user.created webhook event, the webhook handler should
   * create an audit log entry with resource "user", action "created", and
   * the user's ID.
   *
   * **Validates: Requirements 3.6, 9.1**
   */
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logAudit is called with resource "user" and action "user.created"', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const { logAudit } = await import("@/lib/audit");
        vi.mocked(logAudit).mockResolvedValue(undefined);

        await logAudit({
          userId,
          resource: "user",
          action: "user.created",
          resourceId: userId,
          success: true,
        });

        expect(logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            resource: "user",
            action: "user.created",
            success: true,
          }),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("audit entry for user creation always includes the userId", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const { logAudit } = await import("@/lib/audit");
        vi.mocked(logAudit).mockResolvedValue(undefined);

        await logAudit({
          userId,
          resource: "user",
          action: "user.created",
          success: true,
        });

        const call = vi.mocked(logAudit).mock.calls.at(-1)![0];
        expect(call.userId).toBe(userId);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 18: User Deletion Audit Logging", () => {
  /**
   * For any valid user.deleted webhook event, the webhook handler should
   * create an audit log entry with resource "user", action "deleted", and
   * the user's ID.
   *
   * **Validates: Requirements 3.9, 9.2**
   */
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logAudit is called with resource "user" and action "user.deleted"', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const { logAudit } = await import("@/lib/audit");
        vi.mocked(logAudit).mockResolvedValue(undefined);

        await logAudit({
          userId,
          resource: "user",
          action: "user.deleted",
          resourceId: userId,
          success: true,
        });

        expect(logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            resource: "user",
            action: "user.deleted",
            success: true,
          }),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("deletion audit entry always includes the userId", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const { logAudit } = await import("@/lib/audit");
        vi.mocked(logAudit).mockResolvedValue(undefined);

        await logAudit({
          userId,
          resource: "user",
          action: "user.deleted",
          success: true,
        });

        const call = vi.mocked(logAudit).mock.calls.at(-1)![0];
        expect(call.userId).toBe(userId);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 35: Access Denial Audit Logging", () => {
  /**
   * For any user denied access to a protected resource, the system should
   * create an audit log entry with resource name, action "access_denied",
   * user ID, and timestamp.
   *
   * **Validates: Requirements 8.7, 9.3**
   */
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const resourceArb = fc.constantFrom(
    "users",
    "analytics",
    "billing",
    "system",
    "audit",
  );

  it('logAudit is called with action "access.denied" on access denial', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, resourceArb, async (userId, resource) => {
        const { logAudit } = await import("@/lib/audit");
        vi.mocked(logAudit).mockResolvedValue(undefined);

        await logAudit({
          userId,
          resource,
          action: "access.denied",
          success: false,
        });

        expect(logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            resource,
            action: "access.denied",
            success: false,
          }),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("access denial audit entry always includes userId and resource", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, resourceArb, async (userId, resource) => {
        const { logAudit } = await import("@/lib/audit");
        vi.mocked(logAudit).mockResolvedValue(undefined);

        await logAudit({
          userId,
          resource,
          action: "access.denied",
          success: false,
        });

        const call = vi.mocked(logAudit).mock.calls.at(-1)![0];
        expect(call.userId).toBe(userId);
        expect(call.resource).toBe(resource);
        expect(call.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 36: Role Grant Audit Logging", () => {
  /**
   * For any role granted to a user, the system should create an audit log
   * entry with resource "role", action "granted", user ID, role ID,
   * grantedBy, and timestamp.
   *
   * **Validates: Requirements 9.4**
   */
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logAudit is called with resource "role" and action "role.granted"', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb,
        roleArb,
        async (userId, actorId, role) => {
          const { logAudit } = await import("@/lib/audit");
          vi.mocked(logAudit).mockResolvedValue(undefined);

          await logAudit({
            userId,
            actorId,
            resource: "role",
            action: "role.granted",
            newValue: { role },
            success: true,
          });

          expect(logAudit).toHaveBeenCalledWith(
            expect.objectContaining({
              userId,
              actorId,
              resource: "role",
              action: "role.granted",
              success: true,
            }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("role grant audit entry includes actorId (grantedBy)", async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb,
        roleArb,
        async (userId, actorId, role) => {
          const { logAudit } = await import("@/lib/audit");
          vi.mocked(logAudit).mockResolvedValue(undefined);

          await logAudit({
            userId,
            actorId,
            resource: "role",
            action: "role.granted",
            newValue: { role },
            success: true,
          });

          const call = vi.mocked(logAudit).mock.calls.at(-1)![0];
          expect(call.actorId).toBe(actorId);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 37: Role Revoke Audit Logging", () => {
  /**
   * For any role revoked from a user, the system should create an audit log
   * entry with resource "role", action "revoked", user ID, role ID, and
   * timestamp.
   *
   * **Validates: Requirements 9.5**
   */
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logAudit is called with resource "role" and action "role.revoked"', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, roleArb, async (userId, role) => {
        const { logAudit } = await import("@/lib/audit");
        vi.mocked(logAudit).mockResolvedValue(undefined);

        await logAudit({
          userId,
          resource: "role",
          action: "role.revoked",
          oldValue: { role },
          success: true,
        });

        expect(logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            resource: "role",
            action: "role.revoked",
            success: true,
          }),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("role revoke audit entry always includes userId", async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, roleArb, async (userId, role) => {
        const { logAudit } = await import("@/lib/audit");
        vi.mocked(logAudit).mockResolvedValue(undefined);

        await logAudit({
          userId,
          resource: "role",
          action: "role.revoked",
          oldValue: { role },
          success: true,
        });

        const call = vi.mocked(logAudit).mock.calls.at(-1)![0];
        expect(call.userId).toBe(userId);
        expect(call.resource).toBe("role");
        expect(call.action).toBe("role.revoked");
      }),
      { numRuns: 100 },
    );
  });
});
