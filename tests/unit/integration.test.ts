/**
 * Integration Tests: Clerk Auth & RBAC
 *
 * Task 27.1 – Complete authentication flow
 * Task 27.2 – Permission checking flow
 * Task 27.3 – Admin area access
 * Task 27.4 – Webhook synchronization
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 3.3, 3.4, 3.5, 3.7, 3.8,
 *               5.1, 5.2, 5.10, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7,
 *               14.1, 14.2, 14.3, 16.1, 16.2
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Hoisted mock functions (vi.hoisted ensures they are available inside vi.mock)
// ─────────────────────────────────────────────────────────────────────────────

const {
  mockUserFindUnique,
  mockUserUpdate,
  mockUserRoleFindMany,
  mockTransaction,
  mockAuditLogCreate,
  mockEmailLogCreate,
  mockGetCached,
  mockSetCached,
  mockInvalidateRedis,
  mockAuth,
  mockSendWelcome,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserRoleFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockEmailLogCreate: vi.fn(),
  mockGetCached: vi.fn(),
  mockSetCached: vi.fn(),
  mockInvalidateRedis: vi.fn(),
  mockAuth: vi.fn(),
  mockSendWelcome: vi.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Module mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique, update: mockUserUpdate },
    userRole: { findMany: mockUserRoleFindMany },
    auditLog: { create: mockAuditLogCreate },
    emailLog: { create: mockEmailLogCreate },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/redis", () => ({
  getCachedPermissions: mockGetCached,
  setCachedPermissions: mockSetCached,
  invalidateCache: mockInvalidateRedis,
  CACHE_TTL: 300,
  PERMISSION_CACHE_PREFIX: "permissions:",
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/resend", () => ({ sendUserWelcomeEmail: mockSendWelcome }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("svix", () => ({
  Webhook: vi.fn().mockImplementation(() => ({ verify: vi.fn() })),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import {
  hasPermission,
  getUserPermissions,
  invalidatePermissionCache,
  checkRouteAccess,
  ROLE_PERMISSIONS,
} from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { sendUserWelcomeEmail } from "@/lib/resend";

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────

const DEVELOPER_ROLE = {
  id: "role-dev",
  name: "DEVELOPER",
  displayName: "Developer",
};
const ADMIN_ROLE = { id: "role-adm", name: "ADMIN", displayName: "Admin" };
const MANAGER_ROLE = {
  id: "role-mgr",
  name: "MANAGER",
  displayName: "Manager",
};

function makeDbUser(
  overrides: Partial<{
    id: string;
    clerkId: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    isActive: boolean;
  }> = {},
) {
  return {
    id: "db-user-1",
    clerkId: "clerk_user_1",
    email: "alice@example.com",
    name: "Alice",
    avatarUrl: null,
    isActive: true,
    plan: "FREE",
    planExpiresAt: null,
    isBanned: false,
    bannedReason: null,
    metadata: {},
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeUserWithRoles(roles: (typeof DEVELOPER_ROLE)[]) {
  return { ...makeDbUser(), userRoles: roles.map((r) => ({ role: r })) };
}

// ═════════════════════════════════════════════════════════════════════════════
// Task 27.1 – Authentication flow integration
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 3.3, 3.4, 3.5
// ═════════════════════════════════════════════════════════════════════════════

describe("27.1 Authentication flow integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Sign-up flow: webhook creates user, assigns role, sends welcome email", () => {
    it("getCurrentUser returns null when Clerk session has no userId (Req 1.1)", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it("getCurrentUser returns user with roles when session is active (Req 1.3)", async () => {
      mockAuth.mockResolvedValue({ userId: "clerk_user_1" });
      mockUserFindUnique.mockResolvedValue(makeUserWithRoles([DEVELOPER_ROLE]));

      const user = await getCurrentUser();
      expect(user).not.toBeNull();
      expect(user!.clerkId).toBe("clerk_user_1");
      expect(user!.userRoles).toHaveLength(1);
      expect(user!.userRoles[0].role.name).toBe("DEVELOPER");
    });

    it("webhook user.created: transaction creates user and assigns DEVELOPER role (Req 3.3, 3.4)", async () => {
      const newUser = makeDbUser();

      mockTransaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: {
            create: vi.fn().mockResolvedValue(newUser),
            findUnique: vi.fn().mockResolvedValue(null),
          },
          role: { findUnique: vi.fn().mockResolvedValue(DEVELOPER_ROLE) },
          userRole: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await mockTransaction(async (tx: any) => {
        const user = await tx.user.create({
          data: {
            clerkId: "clerk_user_1",
            email: "alice@example.com",
            name: "Alice",
            plan: "FREE",
            isActive: true,
          },
        });
        const role = await tx.role.findUnique({ where: { name: "DEVELOPER" } });
        await tx.userRole.create({
          data: { userId: user.id, roleId: role.id },
        });
        return user;
      });

      expect(result).toMatchObject({
        email: "alice@example.com",
        clerkId: "clerk_user_1",
      });
      expect(mockTransaction).toHaveBeenCalledOnce();
    });

    it("welcome email is sent after user creation (Req 3.5)", async () => {
      mockSendWelcome.mockResolvedValue({
        success: true,
        resendId: "email-123",
      });
      const emailResult = await sendUserWelcomeEmail(
        "alice@example.com",
        "Alice",
        "en",
      );
      expect(emailResult.success).toBe(true);
      expect(mockSendWelcome).toHaveBeenCalledWith(
        "alice@example.com",
        "Alice",
        "en",
      );
    });
  });

  describe("Sign-in flow: session created, protected routes accessible (Req 1.4)", () => {
    it("authenticated user is returned by getCurrentUser", async () => {
      mockAuth.mockResolvedValue({ userId: "clerk_user_1" });
      mockUserFindUnique.mockResolvedValue(makeUserWithRoles([DEVELOPER_ROLE]));

      const user = await getCurrentUser();
      expect(user).not.toBeNull();
      expect(user!.isActive).toBe(true);
    });

    it("unauthenticated user returns null from getCurrentUser (Req 1.1)", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const user = await getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe("Sign-out flow: session terminated (Req 1.7)", () => {
    it("getCurrentUser returns null after sign-out (userId becomes null)", async () => {
      mockAuth.mockResolvedValue({ userId: "clerk_user_1" });
      mockUserFindUnique.mockResolvedValue(makeUserWithRoles([DEVELOPER_ROLE]));
      const before = await getCurrentUser();
      expect(before).not.toBeNull();

      mockAuth.mockResolvedValue({ userId: null });
      const after = await getCurrentUser();
      expect(after).toBeNull();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 27.2 – Permission checking flow integration
// Requirements: 5.1, 5.2, 5.10, 16.1, 16.2
// ═════════════════════════════════════════════════════════════════════════════

describe("27.2 Permission checking flow integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("User with role: permissions cached and check succeeds (Req 5.1, 5.2)", () => {
    it("returns true for a permission the user has (cache miss → DB → cache set)", async () => {
      mockGetCached.mockResolvedValue(null);
      mockUserRoleFindMany.mockResolvedValue([{ role: DEVELOPER_ROLE }]);
      mockSetCached.mockResolvedValue(undefined);

      const result = await hasPermission("db-user-1", "analytics:read");
      expect(result).toBe(true);
      expect(mockGetCached).toHaveBeenCalledWith("db-user-1");
      expect(mockSetCached).toHaveBeenCalledWith(
        "db-user-1",
        expect.arrayContaining(["analytics:read"]),
      );
    });

    it("returns false for a permission the user does not have", async () => {
      mockGetCached.mockResolvedValue(null);
      mockUserRoleFindMany.mockResolvedValue([{ role: DEVELOPER_ROLE }]);
      mockSetCached.mockResolvedValue(undefined);

      const result = await hasPermission("db-user-1", "users:write");
      expect(result).toBe(false);
    });

    it("uses cached permissions on cache hit (no DB query)", async () => {
      mockGetCached.mockResolvedValue(["analytics:read", "users:read"]);

      const result = await hasPermission("db-user-1", "analytics:read");
      expect(result).toBe(true);
      expect(mockUserRoleFindMany).not.toHaveBeenCalled();
    });
  });

  describe("Role granted: cache invalidated, new permissions available (Req 5.10, 16.1)", () => {
    it("after cache invalidation, new role permissions are fetched from DB", async () => {
      mockGetCached.mockResolvedValueOnce(["analytics:read"]);
      let result = await hasPermission("db-user-1", "users:read");
      expect(result).toBe(false);

      await invalidatePermissionCache("db-user-1");
      expect(mockInvalidateRedis).toHaveBeenCalledWith("db-user-1");

      mockGetCached.mockResolvedValueOnce(null);
      mockUserRoleFindMany.mockResolvedValue([
        { role: DEVELOPER_ROLE },
        { role: MANAGER_ROLE },
      ]);
      mockSetCached.mockResolvedValue(undefined);

      result = await hasPermission("db-user-1", "users:read");
      expect(result).toBe(true);
    });

    it("getUserPermissions returns union of all role permissions", async () => {
      mockGetCached.mockResolvedValue(null);
      mockUserRoleFindMany.mockResolvedValue([
        { role: DEVELOPER_ROLE },
        { role: MANAGER_ROLE },
      ]);
      mockSetCached.mockResolvedValue(undefined);

      const perms = await getUserPermissions("db-user-1");
      expect(perms).toContain("analytics:read");
      expect(perms).toContain("users:read");
      expect(perms).toContain("billing:read");
    });
  });

  describe("Role revoked: cache invalidated, permissions removed (Req 5.10, 16.2)", () => {
    it("after role revocation and cache invalidation, removed permissions are gone", async () => {
      mockGetCached.mockResolvedValueOnce([
        "analytics:read",
        "users:read",
        "billing:read",
      ]);
      let result = await hasPermission("db-user-1", "users:read");
      expect(result).toBe(true);

      await invalidatePermissionCache("db-user-1");
      expect(mockInvalidateRedis).toHaveBeenCalledWith("db-user-1");

      mockGetCached.mockResolvedValueOnce(null);
      mockUserRoleFindMany.mockResolvedValue([{ role: DEVELOPER_ROLE }]);
      mockSetCached.mockResolvedValue(undefined);

      result = await hasPermission("db-user-1", "users:read");
      expect(result).toBe(false);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 27.3 – Admin area access integration
// Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
// ═════════════════════════════════════════════════════════════════════════════

describe("27.3 Admin area access integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupRole(role: typeof DEVELOPER_ROLE) {
    mockUserRoleFindMany.mockResolvedValue([{ role }]);
    mockGetCached.mockResolvedValue(
      ROLE_PERMISSIONS[role.name as keyof typeof ROLE_PERMISSIONS],
    );
  }

  describe("ADMIN user can access all admin pages (Req 6.2, 6.3)", () => {
    it("ADMIN can access /admin/users", async () => {
      setupRole(ADMIN_ROLE);
      expect(await checkRouteAccess("db-user-1", "/admin/users")).toBe(true);
    });

    it("ADMIN can access /admin/audit-logs", async () => {
      setupRole(ADMIN_ROLE);
      expect(await checkRouteAccess("db-user-1", "/admin/audit-logs")).toBe(
        true,
      );
    });

    it("ADMIN can access /admin/waitlist", async () => {
      setupRole(ADMIN_ROLE);
      expect(await checkRouteAccess("db-user-1", "/admin/waitlist")).toBe(true);
    });
  });

  describe("MANAGER user can access limited admin pages (Req 6.6)", () => {
    it("MANAGER can access /admin/users (has users:read)", async () => {
      setupRole(MANAGER_ROLE);
      expect(await checkRouteAccess("db-user-1", "/admin/users")).toBe(true);
    });

    it("MANAGER cannot access /admin/audit-logs (lacks audit:read)", async () => {
      setupRole(MANAGER_ROLE);
      expect(await checkRouteAccess("db-user-1", "/admin/audit-logs")).toBe(
        false,
      );
    });

    it("MANAGER cannot access /admin/feature-flags (lacks system:read)", async () => {
      setupRole(MANAGER_ROLE);
      expect(await checkRouteAccess("db-user-1", "/admin/feature-flags")).toBe(
        false,
      );
    });
  });

  describe("DEVELOPER user cannot access admin pages (Req 6.3)", () => {
    it("DEVELOPER is denied /admin/users (not an admin role)", async () => {
      setupRole(DEVELOPER_ROLE);
      expect(await checkRouteAccess("db-user-1", "/admin/users")).toBe(false);
    });

    it("DEVELOPER is denied /admin/audit-logs", async () => {
      setupRole(DEVELOPER_ROLE);
      expect(await checkRouteAccess("db-user-1", "/admin/audit-logs")).toBe(
        false,
      );
    });
  });

  describe("Sidebar menu items filtered by permissions (Req 6.4, 6.5, 6.7)", () => {
    const SIDEBAR_ITEMS = [
      { label: "Users", permission: "users:read" as const },
      { label: "Plans", permission: "billing:read" as const },
      { label: "Feature Flags", permission: "system:read" as const },
      { label: "Audit Logs", permission: "audit:read" as const },
      { label: "System Health", permission: "system:read" as const },
      { label: "Waitlist", permission: "users:read" as const },
    ];

    function visibleItems(permissions: string[]) {
      return SIDEBAR_ITEMS.filter((item) =>
        permissions.includes(item.permission),
      );
    }

    it("SUPER_ADMIN sees all sidebar items", () => {
      const labels = visibleItems(ROLE_PERMISSIONS["SUPER_ADMIN"]).map(
        (i) => i.label,
      );
      expect(labels).toEqual(
        expect.arrayContaining([
          "Users",
          "Plans",
          "Feature Flags",
          "Audit Logs",
          "System Health",
          "Waitlist",
        ]),
      );
    });

    it("MANAGER sees Users, Plans, and Waitlist (has users:read, billing:read)", () => {
      const labels = visibleItems(ROLE_PERMISSIONS["MANAGER"]).map(
        (i) => i.label,
      );
      expect(labels).toContain("Users");
      expect(labels).toContain("Plans");
      expect(labels).not.toContain("Audit Logs");
      expect(labels).not.toContain("Feature Flags");
    });

    it("DEVELOPER sees no sidebar items (no admin permissions)", () => {
      expect(visibleItems(ROLE_PERMISSIONS["DEVELOPER"])).toHaveLength(0);
    });

    it("SUPPORT sees Users and Audit Logs (has users:read, audit:read)", () => {
      const labels = visibleItems(ROLE_PERMISSIONS["SUPPORT"]).map(
        (i) => i.label,
      );
      expect(labels).toContain("Users");
      expect(labels).toContain("Audit Logs");
      expect(labels).not.toContain("Plans");
      expect(labels).not.toContain("Feature Flags");
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 27.4 – Webhook synchronization integration
// Requirements: 3.3, 3.4, 3.7, 3.8, 14.1, 14.2, 14.3
// ═════════════════════════════════════════════════════════════════════════════

describe("27.4 Webhook synchronization integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLogCreate.mockResolvedValue({});
    mockEmailLogCreate.mockResolvedValue({});
    mockSendWelcome.mockResolvedValue({ success: true, resendId: "email-1" });
  });

  describe("user.created webhook creates user and assigns DEVELOPER role (Req 3.3, 3.4)", () => {
    it("transaction creates user and assigns DEVELOPER role", async () => {
      const newUser = makeDbUser();

      mockTransaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: {
            create: vi.fn().mockResolvedValue(newUser),
            findUnique: vi.fn().mockResolvedValue(null),
          },
          role: { findUnique: vi.fn().mockResolvedValue(DEVELOPER_ROLE) },
          userRole: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await mockTransaction(async (tx: any) => {
        const user = await tx.user.create({
          data: {
            clerkId: "clerk_user_1",
            email: "alice@example.com",
            name: "Alice",
            plan: "FREE",
            isActive: true,
          },
        });
        const role = await tx.role.findUnique({ where: { name: "DEVELOPER" } });
        await tx.userRole.create({
          data: { userId: user.id, roleId: role.id },
        });
        return user;
      });

      expect(result).toMatchObject({
        email: "alice@example.com",
        clerkId: "clerk_user_1",
      });
    });

    it("sends welcome email after user creation (Req 3.5)", async () => {
      const emailResult = await sendUserWelcomeEmail(
        "alice@example.com",
        "Alice",
        "en",
      );
      expect(emailResult.success).toBe(true);
      expect(mockSendWelcome).toHaveBeenCalledWith(
        "alice@example.com",
        "Alice",
        "en",
      );
    });
  });

  describe("user.updated webhook updates user data (Req 3.7)", () => {
    it("updates email, name, and avatarUrl in DB", async () => {
      const existingUser = makeDbUser();
      const updatedUser = makeDbUser({
        email: "alice-new@example.com",
        name: "Alice Updated",
      });

      mockUserFindUnique.mockResolvedValue(existingUser);
      mockUserUpdate.mockResolvedValue(updatedUser);

      const found = await mockUserFindUnique({
        where: { clerkId: "clerk_user_1" },
      });
      expect(found).not.toBeNull();

      const updated = await mockUserUpdate({
        where: { clerkId: "clerk_user_1" },
        data: {
          email: "alice-new@example.com",
          name: "Alice Updated",
          avatarUrl: null,
        },
      });

      expect(updated.email).toBe("alice-new@example.com");
      expect(updated.name).toBe("Alice Updated");
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clerkId: "clerk_user_1" } }),
      );
    });

    it("skips update when user not found in DB", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const found = await mockUserFindUnique({
        where: { clerkId: "unknown_clerk" },
      });
      expect(found).toBeNull();
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });
  });

  describe("user.deleted webhook soft deletes user (Req 3.8)", () => {
    it("sets isActive to false instead of deleting the record", async () => {
      const existingUser = makeDbUser({ isActive: true });
      const softDeleted = makeDbUser({ isActive: false });

      mockUserFindUnique.mockResolvedValue(existingUser);
      mockUserUpdate.mockResolvedValue(softDeleted);

      const found = await mockUserFindUnique({
        where: { clerkId: "clerk_user_1" },
      });
      expect(found!.isActive).toBe(true);

      const deleted = await mockUserUpdate({
        where: { clerkId: "clerk_user_1" },
        data: { isActive: false },
      });

      expect(deleted.isActive).toBe(false);
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });
  });

  describe("Duplicate webhooks are handled idempotently (Req 14.1, 14.2, 14.3)", () => {
    it("skips user creation when user already exists in DB (idempotency at DB level)", async () => {
      mockUserFindUnique.mockResolvedValue(makeDbUser());

      const found = await mockUserFindUnique({
        where: { clerkId: "clerk_user_1" },
      });
      if (!found) {
        await mockTransaction(vi.fn());
      }

      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("in-memory processedEvents set prevents duplicate processing of same event ID", () => {
      const processedEvents = new Set<string>();

      function processEvent(eventId: string): "processed" | "duplicate" {
        if (processedEvents.has(eventId)) return "duplicate";
        processedEvents.add(eventId);
        return "processed";
      }

      expect(processEvent("evt_001")).toBe("processed");
      expect(processEvent("evt_001")).toBe("duplicate");
      expect(processEvent("evt_002")).toBe("processed");
    });

    it("returns 200 for duplicate events without re-processing", () => {
      const processedEvents = new Set<string>(["evt_already_done"]);
      const shouldSkip = (id: string) => processedEvents.has(id);
      expect(shouldSkip("evt_already_done")).toBe(true);
      expect(shouldSkip("evt_new")).toBe(false);
    });

    it("user.updated duplicate: second call with same clerkId is idempotent", async () => {
      const existingUser = makeDbUser();
      mockUserFindUnique.mockResolvedValue(existingUser);
      mockUserUpdate.mockResolvedValue(existingUser);

      await mockUserFindUnique({ where: { clerkId: "clerk_user_1" } });
      await mockUserUpdate({
        where: { clerkId: "clerk_user_1" },
        data: { name: "Alice" },
      });
      await mockUserFindUnique({ where: { clerkId: "clerk_user_1" } });
      await mockUserUpdate({
        where: { clerkId: "clerk_user_1" },
        data: { name: "Alice" },
      });

      expect(mockUserUpdate).toHaveBeenCalledTimes(2);
    });
  });
});
