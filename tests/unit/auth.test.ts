/**
 * Unit Tests for Auth Utilities
 *
 * These tests verify the correctness of authentication and authorization
 * helper functions, including user retrieval, role checking, and permission
 * enforcement.
 *
 * Validates Requirements: 6.2, 6.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCurrentUser,
  hasRole,
  hasAnyRole,
  isAdmin,
  getUserRoles,
  requireAdmin,
  requirePermission,
  hasPermissions,
  type UserRole,
} from "@/lib/auth";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock Prisma client
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock permissions module
vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(),
  getUserPermissions: vi.fn(),
}));

describe("Auth Utilities Unit Tests", () => {
  let mockAuth: ReturnType<typeof vi.fn>;
  let mockPrismaUser: { findUnique: ReturnType<typeof vi.fn> };
  let mockHasPermission: ReturnType<typeof vi.fn>;
  let mockGetUserPermissions: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get mocked modules
    const clerkModule = await import("@clerk/nextjs/server");
    mockAuth = clerkModule.auth as unknown as ReturnType<typeof vi.fn>;

    const { prisma } = await import("@/lib/prisma");
    mockPrismaUser = prisma.user as unknown as {
      findUnique: ReturnType<typeof vi.fn>;
    };

    const permissionsModule = await import("@/lib/permissions");
    mockHasPermission = permissionsModule.hasPermission as ReturnType<
      typeof vi.fn
    >;
    mockGetUserPermissions = permissionsModule.getUserPermissions as ReturnType<
      typeof vi.fn
    >;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test Suite: getCurrentUser function
   * Validates: Requirement 6.2
   */
  describe("getCurrentUser", () => {
    it("should return user with roles when authenticated", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "DEVELOPER",
              displayName: "Developer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await getCurrentUser();

      // Assert
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { clerkId: "clerk_abc" },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });
      expect(result).toEqual(mockUser);
    });

    it("should return null when not authenticated", async () => {
      // Arrange
      mockAuth.mockResolvedValue({ userId: null });

      // Act
      const result = await getCurrentUser();

      // Assert
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockPrismaUser.findUnique).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("should return null when user not found in database", async () => {
      // Arrange
      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(null);

      // Act
      const result = await getCurrentUser();

      // Assert
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { clerkId: "clerk_abc" },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });
      expect(result).toBeNull();
    });

    it("should return user with multiple roles", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "admin@example.com",
        name: "Admin User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "ADMIN",
              displayName: "Admin",
            },
          },
          {
            id: "ur_2",
            userId: "user_123",
            roleId: "role_2",
            role: {
              id: "role_2",
              name: "DEVELOPER",
              displayName: "Developer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await getCurrentUser();

      // Assert
      expect(result).toEqual(mockUser);
      expect(result?.userRoles).toHaveLength(2);
    });
  });

  /**
   * Test Suite: hasRole function
   * Validates: Requirement 6.2
   */
  describe("hasRole", () => {
    it("should return true when user has the specified role", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "DEVELOPER",
              displayName: "Developer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await hasRole("DEVELOPER");

      // Assert
      expect(result).toBe(true);
    });

    it("should return false when user does not have the specified role", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "DEVELOPER",
              displayName: "Developer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await hasRole("ADMIN");

      // Assert
      expect(result).toBe(false);
    });

    it("should return false when user is not authenticated", async () => {
      // Arrange
      mockAuth.mockResolvedValue({ userId: null });

      // Act
      const result = await hasRole("ADMIN");

      // Assert
      expect(result).toBe(false);
    });

    it("should correctly identify SUPER_ADMIN role", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "superadmin@example.com",
        name: "Super Admin",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "SUPER_ADMIN",
              displayName: "Super Admin",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await hasRole("SUPER_ADMIN");

      // Assert
      expect(result).toBe(true);
    });

    it("should correctly identify MANAGER role", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "manager@example.com",
        name: "Manager User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "MANAGER",
              displayName: "Manager",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await hasRole("MANAGER");

      // Assert
      expect(result).toBe(true);
    });

    it("should correctly identify SUPPORT role", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "support@example.com",
        name: "Support User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "SUPPORT",
              displayName: "Support",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await hasRole("SUPPORT");

      // Assert
      expect(result).toBe(true);
    });

    it("should correctly identify VIEWER role", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "viewer@example.com",
        name: "Viewer User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "VIEWER",
              displayName: "Viewer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await hasRole("VIEWER");

      // Assert
      expect(result).toBe(true);
    });
  });

  /**
   * Test Suite: hasAnyRole function
   * Validates: Requirement 6.2
   */
  describe("hasAnyRole", () => {
    it("should return true when user has one of the specified roles", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "DEVELOPER",
              displayName: "Developer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await hasAnyRole(["ADMIN", "DEVELOPER", "MANAGER"]);

      // Assert
      expect(result).toBe(true);
    });

    it("should return false when user does not have any of the specified roles", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "VIEWER",
              displayName: "Viewer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await hasAnyRole(["ADMIN", "SUPER_ADMIN"]);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false when user is not authenticated", async () => {
      // Arrange
      mockAuth.mockResolvedValue({ userId: null });

      // Act
      const result = await hasAnyRole(["ADMIN", "DEVELOPER"]);

      // Assert
      expect(result).toBe(false);
    });

    it("should return true when user has multiple roles and one matches", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "ADMIN",
              displayName: "Admin",
            },
          },
          {
            id: "ur_2",
            userId: "user_123",
            roleId: "role_2",
            role: {
              id: "role_2",
              name: "DEVELOPER",
              displayName: "Developer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await hasAnyRole(["MANAGER", "DEVELOPER"]);

      // Assert
      expect(result).toBe(true);
    });
  });

  /**
   * Test Suite: isAdmin function
   * Validates: Requirement 6.2
   */
  describe("isAdmin", () => {
    it("should return true for SUPER_ADMIN role", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "superadmin@example.com",
        name: "Super Admin",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "SUPER_ADMIN",
              displayName: "Super Admin",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await isAdmin();

      // Assert
      expect(result).toBe(true);
    });

    it("should return true for ADMIN role", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "admin@example.com",
        name: "Admin User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "ADMIN",
              displayName: "Admin",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await isAdmin();

      // Assert
      expect(result).toBe(true);
    });

    it("should return false for non-admin roles", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "DEVELOPER",
              displayName: "Developer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await isAdmin();

      // Assert
      expect(result).toBe(false);
    });

    it("should return false when user is not authenticated", async () => {
      // Arrange
      mockAuth.mockResolvedValue({ userId: null });

      // Act
      const result = await isAdmin();

      // Assert
      expect(result).toBe(false);
    });
  });

  /**
   * Test Suite: getUserRoles function
   * Validates: Requirement 6.2
   */
  describe("getUserRoles", () => {
    it("should return array of role names", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "ADMIN",
              displayName: "Admin",
            },
          },
          {
            id: "ur_2",
            userId: "user_123",
            roleId: "role_2",
            role: {
              id: "role_2",
              name: "DEVELOPER",
              displayName: "Developer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await getUserRoles();

      // Assert
      expect(result).toEqual(["ADMIN", "DEVELOPER"]);
    });

    it("should return empty array when user has no roles", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await getUserRoles();

      // Assert
      expect(result).toEqual([]);
    });

    it("should return empty array when user is not authenticated", async () => {
      // Arrange
      mockAuth.mockResolvedValue({ userId: null });

      // Act
      const result = await getUserRoles();

      // Assert
      expect(result).toEqual([]);
    });
  });

  /**
   * Test Suite: requireAdmin function
   * Validates: Requirements 6.2, 6.3
   */
  describe("requireAdmin", () => {
    it("should not throw error for SUPER_ADMIN role", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "superadmin@example.com",
        name: "Super Admin",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "SUPER_ADMIN",
              displayName: "Super Admin",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(requireAdmin()).resolves.toBeUndefined();
    });

    it("should not throw error for ADMIN role", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "admin@example.com",
        name: "Admin User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "ADMIN",
              displayName: "Admin",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(requireAdmin()).resolves.toBeUndefined();
    });

    it("should throw error for non-admin users (DEVELOPER)", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "DEVELOPER",
              displayName: "Developer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(requireAdmin()).rejects.toThrow(
        "Unauthorized: Admin access required",
      );
    });

    it("should throw error for non-admin users (MANAGER)", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "manager@example.com",
        name: "Manager User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "MANAGER",
              displayName: "Manager",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(requireAdmin()).rejects.toThrow(
        "Unauthorized: Admin access required",
      );
    });

    it("should throw error for non-admin users (SUPPORT)", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "support@example.com",
        name: "Support User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "SUPPORT",
              displayName: "Support",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(requireAdmin()).rejects.toThrow(
        "Unauthorized: Admin access required",
      );
    });

    it("should throw error for non-admin users (VIEWER)", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "viewer@example.com",
        name: "Viewer User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "VIEWER",
              displayName: "Viewer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(requireAdmin()).rejects.toThrow(
        "Unauthorized: Admin access required",
      );
    });

    it("should throw error when user is not authenticated", async () => {
      // Arrange
      mockAuth.mockResolvedValue({ userId: null });

      // Act & Assert
      await expect(requireAdmin()).rejects.toThrow(
        "Unauthorized: Admin access required",
      );
    });

    it("should throw error when user has no roles", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(requireAdmin()).rejects.toThrow(
        "Unauthorized: Admin access required",
      );
    });
  });

  /**
   * Test Suite: requirePermission function
   * Validates: Requirements 6.2, 6.3
   */
  describe("requirePermission", () => {
    it("should not throw error when user has the required permission", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "ADMIN",
              displayName: "Admin",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);
      mockHasPermission.mockResolvedValue(true);

      // Act & Assert
      await expect(requirePermission("users:read")).resolves.toBeUndefined();
      expect(mockHasPermission).toHaveBeenCalledWith("user_123", "users:read");
    });

    it("should throw error when user lacks the required permission", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "VIEWER",
              displayName: "Viewer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);
      mockHasPermission.mockResolvedValue(false);

      // Act & Assert
      await expect(requirePermission("users:write")).rejects.toThrow(
        "Unauthorized: Missing required permission 'users:write'",
      );
      expect(mockHasPermission).toHaveBeenCalledWith("user_123", "users:write");
    });

    it("should throw error when user is not authenticated", async () => {
      // Arrange
      mockAuth.mockResolvedValue({ userId: null });

      // Act & Assert
      await expect(requirePermission("users:read")).rejects.toThrow(
        "Unauthorized: Authentication required",
      );
      expect(mockHasPermission).not.toHaveBeenCalled();
    });

    it("should throw error for analytics:export permission when user lacks it", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "DEVELOPER",
              displayName: "Developer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);
      mockHasPermission.mockResolvedValue(false);

      // Act & Assert
      await expect(requirePermission("analytics:export")).rejects.toThrow(
        "Unauthorized: Missing required permission 'analytics:export'",
      );
    });

    it("should throw error for billing:write permission when user lacks it", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "MANAGER",
              displayName: "Manager",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);
      mockHasPermission.mockResolvedValue(false);

      // Act & Assert
      await expect(requirePermission("billing:write")).rejects.toThrow(
        "Unauthorized: Missing required permission 'billing:write'",
      );
    });

    it("should throw error for users:delete permission when user lacks it", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "admin@example.com",
        name: "Admin User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "ADMIN",
              displayName: "Admin",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);
      mockHasPermission.mockResolvedValue(false);

      // Act & Assert
      await expect(requirePermission("users:delete")).rejects.toThrow(
        "Unauthorized: Missing required permission 'users:delete'",
      );
    });
  });

  /**
   * Test Suite: hasPermissions function
   * Validates: Requirements 6.2, 6.3
   */
  describe("hasPermissions", () => {
    it("should return true when user has all required permissions", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "admin@example.com",
        name: "Admin User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "ADMIN",
              displayName: "Admin",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);
      mockGetUserPermissions.mockResolvedValue([
        "users:read",
        "users:write",
        "analytics:read",
        "analytics:export",
        "billing:read",
        "billing:write",
        "system:read",
        "audit:read",
      ]);

      // Act
      const result = await hasPermissions(["users:read", "analytics:read"]);

      // Assert
      expect(result).toBe(true);
      expect(mockGetUserPermissions).toHaveBeenCalledWith("user_123");
    });

    it("should return false when user lacks one or more required permissions", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "DEVELOPER",
              displayName: "Developer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);
      mockGetUserPermissions.mockResolvedValue(["analytics:read"]);

      // Act
      const result = await hasPermissions(["analytics:read", "users:write"]);

      // Assert
      expect(result).toBe(false);
      expect(mockGetUserPermissions).toHaveBeenCalledWith("user_123");
    });

    it("should return false when user is not authenticated", async () => {
      // Arrange
      mockAuth.mockResolvedValue({ userId: null });

      // Act
      const result = await hasPermissions(["users:read"]);

      // Assert
      expect(result).toBe(false);
      expect(mockGetUserPermissions).not.toHaveBeenCalled();
    });

    it("should return true when checking empty permissions array", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "VIEWER",
              displayName: "Viewer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);
      mockGetUserPermissions.mockResolvedValue(["analytics:read"]);

      // Act
      const result = await hasPermissions([]);

      // Assert
      expect(result).toBe(true);
      expect(mockGetUserPermissions).toHaveBeenCalledWith("user_123");
    });

    it("should return false when user has no permissions", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);
      mockGetUserPermissions.mockResolvedValue([]);

      // Act
      const result = await hasPermissions(["users:read"]);

      // Assert
      expect(result).toBe(false);
    });

    it("should return true when user has all permissions from multiple roles", async () => {
      // Arrange
      const mockUser = {
        id: "user_123",
        clerkId: "clerk_abc",
        email: "user@example.com",
        name: "Test User",
        userRoles: [
          {
            id: "ur_1",
            userId: "user_123",
            roleId: "role_1",
            role: {
              id: "role_1",
              name: "ADMIN",
              displayName: "Admin",
            },
          },
          {
            id: "ur_2",
            userId: "user_123",
            roleId: "role_2",
            role: {
              id: "role_2",
              name: "DEVELOPER",
              displayName: "Developer",
            },
          },
        ],
      };

      mockAuth.mockResolvedValue({ userId: "clerk_abc" });
      mockPrismaUser.findUnique.mockResolvedValue(mockUser);
      mockGetUserPermissions.mockResolvedValue([
        "users:read",
        "users:write",
        "analytics:read",
        "analytics:export",
        "billing:read",
        "billing:write",
        "system:read",
        "audit:read",
      ]);

      // Act
      const result = await hasPermissions([
        "users:read",
        "analytics:read",
        "billing:read",
      ]);

      // Assert
      expect(result).toBe(true);
    });
  });
});
