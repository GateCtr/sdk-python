/**
 * Property-Based Tests for Permission Matrix Correctness
 *
 * These tests verify that the RBAC permission matrix is correctly enforced
 * across all roles and permissions in the system.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  ROLE_PERMISSIONS,
  type RoleName,
  type Permission,
} from "@/lib/permissions";

// Mock modules - must be hoisted before imports
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

describe("Permission Matrix Property Tests", () => {
  let hasPermission: (
    userId: string,
    permission: Permission,
  ) => Promise<boolean>;
  let getUserPermissions: (userId: string) => Promise<Permission[]>;
  let mockPrisma: {
    userRole: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let mockRedis: {
    getCachedPermissions: ReturnType<typeof vi.fn>;
    setCachedPermissions: ReturnType<typeof vi.fn>;
    invalidateCache: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    // Get mock instances
    const prismaModule = await import("@/lib/prisma");
    const redisModule = await import("@/lib/redis");

    // Use unknown as intermediate type to avoid type conflicts
    mockPrisma = prismaModule.prisma as unknown as typeof mockPrisma;
    mockRedis = {
      getCachedPermissions:
        redisModule.getCachedPermissions as unknown as ReturnType<typeof vi.fn>,
      setCachedPermissions:
        redisModule.setCachedPermissions as unknown as ReturnType<typeof vi.fn>,
      invalidateCache: redisModule.invalidateCache as unknown as ReturnType<
        typeof vi.fn
      >,
    };

    // Import the module (will use mocked dependencies)
    const permissionsModule = await import("@/lib/permissions");
    hasPermission = permissionsModule.hasPermission;
    getUserPermissions = permissionsModule.getUserPermissions;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Feature: clerk-auth-rbac, Property 21: Permission Matrix Correctness
   *
   * For any role and any permission, the hasPermission function should return
   * true if and only if the permission is explicitly defined in the permission
   * matrix for that role.
   *
   * This property verifies that:
   * 1. Users with a role have exactly the permissions defined in ROLE_PERMISSIONS
   * 2. Users with a role do NOT have permissions not defined in ROLE_PERMISSIONS
   * 3. The permission matrix is the single source of truth
   *
   * Validates: Requirements 5.3, 5.4, 13.1, 13.2, 13.3
   */
  describe("Property 21: Permission Matrix Correctness", () => {
    // Generate all possible permissions
    const allPermissions: Permission[] = [
      "users:read",
      "users:write",
      "users:delete",
      "analytics:read",
      "analytics:export",
      "billing:read",
      "billing:write",
      "system:read",
      "audit:read",
    ];

    // Generate all role names
    const allRoles: RoleName[] = [
      "SUPER_ADMIN",
      "ADMIN",
      "MANAGER",
      "DEVELOPER",
      "VIEWER",
      "SUPPORT",
    ];

    it("should grant permissions that are explicitly defined in the permission matrix", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.uuid(), // Generate random user ID
          async (roleName, userId) => {
            // Get permissions defined for this role in the matrix
            const definedPermissions = ROLE_PERMISSIONS[roleName];

            // Mock database to return this role for the user
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check each permission defined for this role
            for (const permission of definedPermissions) {
              const result = await hasPermission(userId, permission);

              // Should return true for permissions in the matrix
              expect(result).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should deny permissions that are NOT defined in the permission matrix", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.uuid(), // Generate random user ID
          async (roleName, userId) => {
            // Get permissions defined for this role in the matrix
            const definedPermissions = ROLE_PERMISSIONS[roleName];

            // Get permissions NOT defined for this role
            const undefinedPermissions = allPermissions.filter(
              (p) => !definedPermissions.includes(p),
            );

            // Skip if all permissions are defined (e.g., SUPER_ADMIN)
            if (undefinedPermissions.length === 0) {
              return;
            }

            // Mock database to return this role for the user
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check each permission NOT defined for this role
            for (const permission of undefinedPermissions) {
              const result = await hasPermission(userId, permission);

              // Should return false for permissions not in the matrix
              expect(result).toBe(false);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should return exactly the permissions defined in the matrix for any role", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.uuid(), // Generate random user ID
          async (roleName, userId) => {
            // Get expected permissions from the matrix
            const expectedPermissions = ROLE_PERMISSIONS[roleName];

            // Mock database to return this role for the user
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Get user permissions
            const actualPermissions = await getUserPermissions(userId);

            // Sort both arrays for comparison
            const sortedExpected = [...expectedPermissions].sort();
            const sortedActual = [...actualPermissions].sort();

            // Should match exactly
            expect(sortedActual).toEqual(sortedExpected);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should enforce the permission matrix for all role-permission combinations", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (roleName, permission, userId) => {
            // Determine if this permission should be granted
            const shouldHavePermission =
              ROLE_PERMISSIONS[roleName].includes(permission);

            // Mock database to return this role for the user
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check permission
            const actualHasPermission = await hasPermission(userId, permission);

            // Should match the permission matrix
            expect(actualHasPermission).toBe(shouldHavePermission);
          },
        ),
        { numRuns: 200 }, // More runs to cover all combinations
      );
    });

    it("should verify SUPER_ADMIN has all permissions", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (permission, userId) => {
            // Mock database to return SUPER_ADMIN role
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "super-admin-id",
                role: {
                  id: "super-admin-id",
                  name: "SUPER_ADMIN",
                  displayName: "Super Administrator",
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // SUPER_ADMIN should have ALL permissions
            const result = await hasPermission(userId, permission);
            expect(result).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should verify ADMIN does NOT have users:delete permission", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // Generate random user ID
          async (userId) => {
            // Mock database to return ADMIN role
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "admin-id",
                role: {
                  id: "admin-id",
                  name: "ADMIN",
                  displayName: "Administrator",
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // ADMIN should NOT have users:delete
            const result = await hasPermission(userId, "users:delete");
            expect(result).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should verify DEVELOPER and VIEWER only have analytics:read", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom("DEVELOPER", "VIEWER"), // Test both roles
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (roleName, permission, userId) => {
            // Mock database to return the role
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Should only have analytics:read
            const result = await hasPermission(userId, permission);
            const expected = permission === "analytics:read";
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should verify SUPPORT has exactly users:read and audit:read", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (permission, userId) => {
            // Mock database to return SUPPORT role
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "support-id",
                role: {
                  id: "support-id",
                  name: "SUPPORT",
                  displayName: "Support",
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Should only have users:read and audit:read
            const result = await hasPermission(userId, permission);
            const expected =
              permission === "users:read" || permission === "audit:read";
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should verify MANAGER has exactly analytics:read, users:read, and billing:read", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (permission, userId) => {
            // Mock database to return MANAGER role
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "manager-id",
                role: {
                  id: "manager-id",
                  name: "MANAGER",
                  displayName: "Manager",
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Should only have analytics:read, users:read, and billing:read
            const result = await hasPermission(userId, permission);
            const expected =
              permission === "analytics:read" ||
              permission === "users:read" ||
              permission === "billing:read";
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should return consistent results when checking the same permission multiple times", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (roleName, permission, userId) => {
            // Mock database to return this role for the user
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check permission multiple times
            const result1 = await hasPermission(userId, permission);
            const result2 = await hasPermission(userId, permission);
            const result3 = await hasPermission(userId, permission);

            // All results should be identical (idempotence)
            expect(result1).toBe(result2);
            expect(result2).toBe(result3);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should work correctly with cached permissions", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.uuid(), // Generate random user ID
          async (roleName, userId) => {
            // Get expected permissions from the matrix
            const expectedPermissions = ROLE_PERMISSIONS[roleName];

            // Mock cache hit with the correct permissions
            mockRedis.getCachedPermissions.mockResolvedValue(
              expectedPermissions,
            );

            // Check each permission
            for (const permission of allPermissions) {
              const result = await hasPermission(userId, permission);
              const expected = expectedPermissions.includes(permission);

              // Should match the permission matrix even with cached data
              expect(result).toBe(expected);
            }

            // Verify database was NOT queried (cache hit)
            expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: clerk-auth-rbac, Property 22: Multiple Role Permission Union
   *
   * For any user with multiple roles, the system should grant the union of all
   * permissions from all assigned roles. This ensures that:
   * 1. Users with multiple roles have AT LEAST the permissions of each individual role
   * 2. Users with multiple roles have EXACTLY the union (no duplicates, no extras)
   * 3. Adding a role never removes existing permissions (monotonicity)
   *
   * Validates: Requirements 4.9, 13.4
   */
  describe("Property 22: Multiple Role Permission Union", () => {
    const allRoles: RoleName[] = [
      "SUPER_ADMIN",
      "ADMIN",
      "MANAGER",
      "DEVELOPER",
      "VIEWER",
      "SUPPORT",
    ];

    it("should grant the union of permissions from all assigned roles", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a non-empty subset of roles (1 to 6 roles)
          fc.subarray(allRoles, { minLength: 1, maxLength: 6 }),
          fc.uuid(), // Generate random user ID
          async (roles, userId) => {
            // Calculate expected permissions (union of all role permissions)
            const expectedPermissions = new Set<Permission>();
            for (const roleName of roles) {
              const rolePermissions = ROLE_PERMISSIONS[roleName];
              rolePermissions.forEach((p) => expectedPermissions.add(p));
            }

            // Mock database to return all assigned roles
            mockPrisma.userRole.findMany.mockResolvedValue(
              roles.map((roleName, index) => ({
                userId,
                roleId: `role-${index}`,
                role: {
                  id: `role-${index}`,
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              })),
            );

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Get user permissions
            const actualPermissions = await getUserPermissions(userId);

            // Convert to sets for comparison
            const expectedSet = new Set(expectedPermissions);
            const actualSet = new Set(actualPermissions);

            // Should have exactly the union of all permissions
            expect(actualSet).toEqual(expectedSet);
            expect(actualPermissions.length).toBe(expectedSet.size);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("should have at least the permissions of each individual role", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a non-empty subset of roles (2 to 6 roles for meaningful test)
          fc.subarray(allRoles, { minLength: 2, maxLength: 6 }),
          fc.uuid(), // Generate random user ID
          async (roles, userId) => {
            // Mock database to return all assigned roles
            mockPrisma.userRole.findMany.mockResolvedValue(
              roles.map((roleName, index) => ({
                userId,
                roleId: `role-${index}`,
                role: {
                  id: `role-${index}`,
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              })),
            );

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Get user permissions
            const actualPermissions = await getUserPermissions(userId);
            const actualSet = new Set(actualPermissions);

            // For each role, verify all its permissions are present
            for (const roleName of roles) {
              const rolePermissions = ROLE_PERMISSIONS[roleName];
              for (const permission of rolePermissions) {
                expect(actualSet.has(permission)).toBe(true);
              }
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    it("should correctly check individual permissions for users with multiple roles", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a non-empty subset of roles
          fc.subarray(allRoles, { minLength: 1, maxLength: 6 }),
          fc.constantFrom(
            "users:read",
            "users:write",
            "users:delete",
            "analytics:read",
            "analytics:export",
            "billing:read",
            "billing:write",
            "system:read",
            "audit:read",
          ), // Generate random permission to check
          fc.uuid(), // Generate random user ID
          async (roles, permission, userId) => {
            // Determine if user should have this permission
            const shouldHavePermission = roles.some((roleName) =>
              ROLE_PERMISSIONS[roleName].includes(permission),
            );

            // Mock database to return all assigned roles
            mockPrisma.userRole.findMany.mockResolvedValue(
              roles.map((roleName, index) => ({
                userId,
                roleId: `role-${index}`,
                role: {
                  id: `role-${index}`,
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              })),
            );

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check permission
            const actualHasPermission = await hasPermission(userId, permission);

            // Should match the union logic
            expect(actualHasPermission).toBe(shouldHavePermission);
          },
        ),
        { numRuns: 300 },
      );
    });

    it("should demonstrate permission monotonicity (adding roles never removes permissions)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Initial role
          fc.constantFrom(...allRoles), // Additional role to add
          fc.uuid(), // Generate random user ID
          async (initialRole, additionalRole, userId) => {
            // Get permissions with just the initial role
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-1",
                role: {
                  id: "role-1",
                  name: initialRole,
                  displayName: initialRole,
                  isSystem: true,
                },
              },
            ]);
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            const permissionsWithOneRole = await getUserPermissions(userId);
            const permissionsSetOne = new Set(permissionsWithOneRole);

            // Clear mocks
            vi.clearAllMocks();

            // Get permissions with both roles
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-1",
                role: {
                  id: "role-1",
                  name: initialRole,
                  displayName: initialRole,
                  isSystem: true,
                },
              },
              {
                userId,
                roleId: "role-2",
                role: {
                  id: "role-2",
                  name: additionalRole,
                  displayName: additionalRole,
                  isSystem: true,
                },
              },
            ]);
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            const permissionsWithTwoRoles = await getUserPermissions(userId);
            const permissionsSetTwo = new Set(permissionsWithTwoRoles);

            // All permissions from the initial role should still be present
            for (const permission of permissionsSetOne) {
              expect(permissionsSetTwo.has(permission)).toBe(true);
            }

            // The set with two roles should have >= permissions than with one role
            expect(permissionsSetTwo.size).toBeGreaterThanOrEqual(
              permissionsSetOne.size,
            );
          },
        ),
        { numRuns: 200 },
      );
    });

    it("should handle duplicate roles gracefully (no duplicate permissions)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.uuid(), // Generate random user ID
          async (roleName, userId) => {
            // Mock database to return the same role twice (edge case)
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-1",
                role: {
                  id: "role-1",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
              {
                userId,
                roleId: "role-2",
                role: {
                  id: "role-2",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Get user permissions
            const actualPermissions = await getUserPermissions(userId);
            const expectedPermissions = ROLE_PERMISSIONS[roleName];

            // Should have no duplicates
            const uniquePermissions = new Set(actualPermissions);
            expect(actualPermissions.length).toBe(uniquePermissions.size);

            // Should match the role's permissions exactly
            expect(uniquePermissions).toEqual(new Set(expectedPermissions));
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should verify specific multi-role scenarios", async () => {
      const testCases: Array<{
        roles: RoleName[];
        expectedPermissions: Permission[];
        description: string;
      }> = [
        {
          roles: ["DEVELOPER", "SUPPORT"],
          expectedPermissions: ["analytics:read", "users:read", "audit:read"],
          description: "DEVELOPER + SUPPORT",
        },
        {
          roles: ["MANAGER", "DEVELOPER"],
          expectedPermissions: ["analytics:read", "users:read", "billing:read"],
          description: "MANAGER + DEVELOPER (DEVELOPER is subset)",
        },
        {
          roles: ["ADMIN", "MANAGER"],
          expectedPermissions: [
            "users:read",
            "users:write",
            "analytics:read",
            "analytics:export",
            "billing:read",
            "billing:write",
            "system:read",
            "audit:read",
          ],
          description: "ADMIN + MANAGER (MANAGER is subset)",
        },
        {
          roles: ["VIEWER", "SUPPORT"],
          expectedPermissions: ["analytics:read", "users:read", "audit:read"],
          description: "VIEWER + SUPPORT",
        },
      ];

      for (const testCase of testCases) {
        await fc.assert(
          fc.asyncProperty(fc.uuid(), async (userId) => {
            // Mock database to return the specified roles
            mockPrisma.userRole.findMany.mockResolvedValue(
              testCase.roles.map((roleName, index) => ({
                userId,
                roleId: `role-${index}`,
                role: {
                  id: `role-${index}`,
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              })),
            );

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Get user permissions
            const actualPermissions = await getUserPermissions(userId);

            // Sort both arrays for comparison
            const sortedExpected = [...testCase.expectedPermissions].sort();
            const sortedActual = [...actualPermissions].sort();

            // Should match exactly
            expect(sortedActual).toEqual(sortedExpected);
          }),
          { numRuns: 50 },
        );
      }
    });

    it("should work correctly with cached permissions for multi-role users", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.subarray(allRoles, { minLength: 2, maxLength: 4 }),
          fc.uuid(),
          async (roles, userId) => {
            // Calculate expected permissions
            const expectedPermissions = new Set<Permission>();
            for (const roleName of roles) {
              ROLE_PERMISSIONS[roleName].forEach((p) =>
                expectedPermissions.add(p),
              );
            }
            const expectedArray = Array.from(expectedPermissions);

            // Mock cache hit with the union of permissions
            mockRedis.getCachedPermissions.mockResolvedValue(expectedArray);

            // Get user permissions
            const actualPermissions = await getUserPermissions(userId);

            // Should return cached permissions
            expect(new Set(actualPermissions)).toEqual(expectedPermissions);

            // Verify database was NOT queried (cache hit)
            expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: clerk-auth-rbac, Property 23: No Role Permission Denial
   *
   * For any user with no roles and any permission, the hasPermission function
   * should return false. This ensures that:
   * 1. Users without roles have no permissions
   * 2. The system fails secure (deny by default)
   * 3. Permissions are only granted through explicit role assignments
   *
   * Validates: Requirements 13.5
   */
  describe("Property 23: No Role Permission Denial", () => {
    const allPermissions: Permission[] = [
      "users:read",
      "users:write",
      "users:delete",
      "analytics:read",
      "analytics:export",
      "billing:read",
      "billing:write",
      "system:read",
      "audit:read",
    ];

    it("should deny all permissions for users with no roles", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (permission, userId) => {
            // Mock database to return empty array (no roles)
            mockPrisma.userRole.findMany.mockResolvedValue([]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check permission
            const result = await hasPermission(userId, permission);

            // Should always return false for users with no roles
            expect(result).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should return empty permissions array for users with no roles", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // Generate random user ID
          async (userId) => {
            // Mock database to return empty array (no roles)
            mockPrisma.userRole.findMany.mockResolvedValue([]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Get user permissions
            const permissions = await getUserPermissions(userId);

            // Should return empty array
            expect(permissions).toEqual([]);
            expect(permissions.length).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should consistently deny all permissions for the same user with no roles", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (permission, userId) => {
            // Mock database to return empty array (no roles)
            mockPrisma.userRole.findMany.mockResolvedValue([]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check permission multiple times
            const result1 = await hasPermission(userId, permission);
            const result2 = await hasPermission(userId, permission);
            const result3 = await hasPermission(userId, permission);

            // All results should be false (consistent denial)
            expect(result1).toBe(false);
            expect(result2).toBe(false);
            expect(result3).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should deny all permissions when checking multiple permissions for user with no roles", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // Generate random user ID
          async (userId) => {
            // Mock database to return empty array (no roles)
            mockPrisma.userRole.findMany.mockResolvedValue([]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check all permissions
            const results = await Promise.all(
              allPermissions.map((permission) =>
                hasPermission(userId, permission),
              ),
            );

            // All should be false
            expect(results.every((result) => result === false)).toBe(true);
            expect(results.filter((result) => result === true).length).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should work correctly with cached empty permissions", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (permission, userId) => {
            // Mock cache hit with empty array
            mockRedis.getCachedPermissions.mockResolvedValue([]);

            // Check permission
            const result = await hasPermission(userId, permission);

            // Should return false even with cached empty permissions
            expect(result).toBe(false);

            // Verify database was NOT queried (cache hit)
            expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should demonstrate fail-secure behavior (deny by default)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // Generate random user ID
          async (userId) => {
            // Mock database to return empty array (no roles)
            mockPrisma.userRole.findMany.mockResolvedValue([]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Test high-privilege permissions specifically
            const highPrivilegePermissions: Permission[] = [
              "users:delete",
              "users:write",
              "billing:write",
              "system:read",
            ];

            for (const permission of highPrivilegePermissions) {
              const result = await hasPermission(userId, permission);

              // Should deny all high-privilege permissions
              expect(result).toBe(false);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should verify no permissions are granted without explicit role assignment", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // Generate random user ID
          async (userId) => {
            // Mock database to return empty array (no roles)
            mockPrisma.userRole.findMany.mockResolvedValue([]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Get all permissions
            const permissions = await getUserPermissions(userId);

            // Verify no permissions are granted
            expect(permissions).toEqual([]);

            // Verify each permission check returns false
            for (const permission of allPermissions) {
              const hasIt = await hasPermission(userId, permission);
              expect(hasIt).toBe(false);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should handle edge case of null or undefined roles gracefully", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (permission, userId) => {
            // Mock database to return empty array (simulating no roles found)
            mockPrisma.userRole.findMany.mockResolvedValue([]);

            // Mock cache miss
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Should not throw error and should deny permission
            const result = await hasPermission(userId, permission);
            expect(result).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should verify that getUserPermissions returns empty array consistently", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // Generate random user ID
          async (userId) => {
            // Mock database to return empty array (no roles)
            mockPrisma.userRole.findMany.mockResolvedValue([]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Call getUserPermissions multiple times
            const permissions1 = await getUserPermissions(userId);
            const permissions2 = await getUserPermissions(userId);
            const permissions3 = await getUserPermissions(userId);

            // All should return empty array
            expect(permissions1).toEqual([]);
            expect(permissions2).toEqual([]);
            expect(permissions3).toEqual([]);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should verify no permissions are granted for any combination of user and permission", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (permission, userId) => {
            // Mock database to return empty array (no roles)
            mockPrisma.userRole.findMany.mockResolvedValue([]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check permission
            const result = await hasPermission(userId, permission);

            // Should always be false regardless of user ID or permission
            expect(result).toBe(false);
          },
        ),
        { numRuns: 200 }, // More runs to cover more combinations
      );
    });
  });

  /**
   * Feature: clerk-auth-rbac, Property 27: Permission Check Idempotence
   *
   * For all permission checks, the RBAC system should return consistent results
   * within the cache TTL period. This ensures that:
   * 1. Multiple calls to hasPermission with the same parameters return the same result
   * 2. Permission checks are deterministic and predictable
   * 3. Cache consistency is maintained throughout the TTL period
   * 4. No race conditions or timing issues affect permission checks
   *
   * Idempotence property: f(x) = f(f(x)) = f(f(f(x))) = ...
   *
   * Validates: Requirements 13.6
   */
  describe("Property 27: Permission Check Idempotence", () => {
    const allPermissions: Permission[] = [
      "users:read",
      "users:write",
      "users:delete",
      "analytics:read",
      "analytics:export",
      "billing:read",
      "billing:write",
      "system:read",
      "audit:read",
    ];

    const allRoles: RoleName[] = [
      "SUPER_ADMIN",
      "ADMIN",
      "MANAGER",
      "DEVELOPER",
      "VIEWER",
      "SUPPORT",
    ];

    it("should return identical results when checking the same permission multiple times", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          fc.integer({ min: 3, max: 10 }), // Number of times to check (3-10)
          async (roleName, permission, userId, numChecks) => {
            // Mock database to return this role for the user
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check permission multiple times
            const results: boolean[] = [];
            for (let i = 0; i < numChecks; i++) {
              const result = await hasPermission(userId, permission);
              results.push(result);
            }

            // All results should be identical
            const firstResult = results[0];
            expect(results.every((r) => r === firstResult)).toBe(true);

            // Verify the result matches the permission matrix
            const expectedResult =
              ROLE_PERMISSIONS[roleName].includes(permission);
            expect(firstResult).toBe(expectedResult);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("should return identical results for getUserPermissions when called multiple times", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.uuid(), // Generate random user ID
          fc.integer({ min: 3, max: 10 }), // Number of times to check (3-10)
          async (roleName, userId, numChecks) => {
            // Mock database to return this role for the user
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Get permissions multiple times
            const results: Permission[][] = [];
            for (let i = 0; i < numChecks; i++) {
              const permissions = await getUserPermissions(userId);
              results.push(permissions);
            }

            // All results should be identical (same permissions in same order or set equality)
            const firstResult = new Set(results[0]);
            for (const result of results) {
              expect(new Set(result)).toEqual(firstResult);
            }

            // Verify the result matches the permission matrix
            const expectedPermissions = new Set(ROLE_PERMISSIONS[roleName]);
            expect(firstResult).toEqual(expectedPermissions);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("should maintain idempotence with cached permissions", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (roleName, permission, userId) => {
            // Get expected permissions from the matrix
            const expectedPermissions = ROLE_PERMISSIONS[roleName];

            // Mock cache hit with the correct permissions
            mockRedis.getCachedPermissions.mockResolvedValue(
              expectedPermissions,
            );

            // Check permission multiple times with cache hit
            const result1 = await hasPermission(userId, permission);
            const result2 = await hasPermission(userId, permission);
            const result3 = await hasPermission(userId, permission);
            const result4 = await hasPermission(userId, permission);
            const result5 = await hasPermission(userId, permission);

            // All results should be identical
            expect(result1).toBe(result2);
            expect(result2).toBe(result3);
            expect(result3).toBe(result4);
            expect(result4).toBe(result5);

            // Verify the result matches the permission matrix
            const expectedResult = expectedPermissions.includes(permission);
            expect(result1).toBe(expectedResult);

            // Verify database was NOT queried (cache hit)
            expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 200 },
      );
    });

    it("should maintain idempotence for users with multiple roles", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.subarray(allRoles, { minLength: 2, maxLength: 4 }), // Multiple roles
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (roles, permission, userId) => {
            // Mock database to return all assigned roles
            mockPrisma.userRole.findMany.mockResolvedValue(
              roles.map((roleName, index) => ({
                userId,
                roleId: `role-${index}`,
                role: {
                  id: `role-${index}`,
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              })),
            );

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check permission multiple times
            const results: boolean[] = [];
            for (let i = 0; i < 5; i++) {
              const result = await hasPermission(userId, permission);
              results.push(result);
            }

            // All results should be identical
            const firstResult = results[0];
            expect(results.every((r) => r === firstResult)).toBe(true);

            // Verify the result matches the union of permissions
            const expectedResult = roles.some((roleName) =>
              ROLE_PERMISSIONS[roleName].includes(permission),
            );
            expect(firstResult).toBe(expectedResult);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("should maintain idempotence for users with no roles", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          fc.integer({ min: 5, max: 15 }), // Number of times to check (5-15)
          async (permission, userId, numChecks) => {
            // Mock database to return empty array (no roles)
            mockPrisma.userRole.findMany.mockResolvedValue([]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check permission multiple times
            const results: boolean[] = [];
            for (let i = 0; i < numChecks; i++) {
              const result = await hasPermission(userId, permission);
              results.push(result);
            }

            // All results should be false (consistent denial)
            expect(results.every((r) => r === false)).toBe(true);
            expect(results.length).toBe(numChecks);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("should maintain idempotence across different permission checks for the same user", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.uuid(), // Generate random user ID
          async (roleName, userId) => {
            // Mock database to return this role for the user
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check all permissions twice
            const firstPass: Record<Permission, boolean> = {} as Record<
              Permission,
              boolean
            >;
            const secondPass: Record<Permission, boolean> = {} as Record<
              Permission,
              boolean
            >;

            for (const permission of allPermissions) {
              firstPass[permission] = await hasPermission(userId, permission);
            }

            for (const permission of allPermissions) {
              secondPass[permission] = await hasPermission(userId, permission);
            }

            // Results should be identical for both passes
            for (const permission of allPermissions) {
              expect(firstPass[permission]).toBe(secondPass[permission]);
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    it("should demonstrate f(x) = f(f(x)) = f(f(f(x))) property", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (roleName, permission, userId) => {
            // Mock database to return this role for the user
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // f(x)
            const result1 = await hasPermission(userId, permission);

            // f(f(x)) - calling with the same parameters again
            const result2 = await hasPermission(userId, permission);

            // f(f(f(x))) - calling with the same parameters again
            const result3 = await hasPermission(userId, permission);

            // Idempotence: f(x) = f(f(x)) = f(f(f(x)))
            expect(result1).toBe(result2);
            expect(result2).toBe(result3);
            expect(result1).toBe(result3);
          },
        ),
        { numRuns: 300 },
      );
    });

    it("should maintain idempotence when alternating between hasPermission and getUserPermissions", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (roleName, permission, userId) => {
            // Mock database to return this role for the user
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Alternate between hasPermission and getUserPermissions
            const hasResult1 = await hasPermission(userId, permission);
            const allPermissions1 = await getUserPermissions(userId);
            const hasResult2 = await hasPermission(userId, permission);
            const allPermissions2 = await getUserPermissions(userId);
            const hasResult3 = await hasPermission(userId, permission);

            // hasPermission results should be identical
            expect(hasResult1).toBe(hasResult2);
            expect(hasResult2).toBe(hasResult3);

            // getUserPermissions results should be identical
            expect(new Set(allPermissions1)).toEqual(new Set(allPermissions2));

            // hasPermission result should be consistent with getUserPermissions
            const expectedResult = allPermissions1.includes(permission);
            expect(hasResult1).toBe(expectedResult);
            expect(hasResult2).toBe(expectedResult);
            expect(hasResult3).toBe(expectedResult);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("should maintain idempotence with rapid successive calls", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.constantFrom(...allPermissions), // Generate random permission
          fc.uuid(), // Generate random user ID
          async (roleName, permission, userId) => {
            // Mock database to return this role for the user
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Make rapid successive calls (simulating concurrent requests)
            const results = await Promise.all([
              hasPermission(userId, permission),
              hasPermission(userId, permission),
              hasPermission(userId, permission),
              hasPermission(userId, permission),
              hasPermission(userId, permission),
            ]);

            // All results should be identical
            const firstResult = results[0];
            expect(results.every((r) => r === firstResult)).toBe(true);

            // Verify the result matches the permission matrix
            const expectedResult =
              ROLE_PERMISSIONS[roleName].includes(permission);
            expect(firstResult).toBe(expectedResult);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("should maintain idempotence regardless of call order", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allRoles), // Generate random role
          fc.uuid(), // Generate random user ID
          async (roleName, userId) => {
            // Mock database to return this role for the user
            mockPrisma.userRole.findMany.mockResolvedValue([
              {
                userId,
                roleId: "role-id",
                role: {
                  id: "role-id",
                  name: roleName,
                  displayName: roleName,
                  isSystem: true,
                },
              },
            ]);

            // Mock cache miss to force database query
            mockRedis.getCachedPermissions.mockResolvedValue(null);
            mockRedis.setCachedPermissions.mockResolvedValue(undefined);

            // Check permissions in different orders
            const order1 = [
              "users:read",
              "analytics:read",
              "billing:read",
            ] as Permission[];
            const order2 = [
              "billing:read",
              "users:read",
              "analytics:read",
            ] as Permission[];
            const order3 = [
              "analytics:read",
              "billing:read",
              "users:read",
            ] as Permission[];

            const results1: Record<string, boolean> = {};
            const results2: Record<string, boolean> = {};
            const results3: Record<string, boolean> = {};

            for (const permission of order1) {
              results1[permission] = await hasPermission(userId, permission);
            }

            for (const permission of order2) {
              results2[permission] = await hasPermission(userId, permission);
            }

            for (const permission of order3) {
              results3[permission] = await hasPermission(userId, permission);
            }

            // Results should be identical regardless of order
            for (const permission of order1) {
              expect(results1[permission]).toBe(results2[permission]);
              expect(results2[permission]).toBe(results3[permission]);
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
