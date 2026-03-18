import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  hasPermission,
  getUserPermissions,
  type Permission,
} from "@/lib/permissions";

export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "MANAGER"
  | "DEVELOPER"
  | "VIEWER"
  | "SUPPORT";

/**
 * Get the current authenticated user with their roles
 */
export async function getCurrentUser() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });

  return user;
}

/**
 * Check if the current user has a specific role
 */
export async function hasRole(role: UserRole): Promise<boolean> {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  return user.userRoles.some((ur) => ur.role.name === role);
}

/**
 * Check if the current user has any of the specified roles
 */
export async function hasAnyRole(roles: UserRole[]): Promise<boolean> {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  return user.userRoles.some((ur) => roles.includes(ur.role.name as UserRole));
}

/**
 * Check if the current user is an admin (SUPER_ADMIN or ADMIN)
 */
export async function isAdmin(): Promise<boolean> {
  return hasAnyRole(["SUPER_ADMIN", "ADMIN"]);
}

/**
 * Get user roles as string array
 */
export async function getUserRoles(): Promise<UserRole[]> {
  const user = await getCurrentUser();

  if (!user) {
    return [];
  }

  return user.userRoles.map((ur) => ur.role.name as UserRole);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHORIZATION HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Require admin role or throw error
 * Throws an error if the current user is not a SUPER_ADMIN or ADMIN
 *
 * Requirements: 6.2, 6.3
 *
 * @throws Error if user is not authenticated or lacks admin role
 */
export async function requireAdmin(): Promise<void> {
  const admin = await isAdmin();

  if (!admin) {
    throw new Error("Unauthorized: Admin access required");
  }
}

/**
 * Require specific permission or throw error
 * Throws an error if the current user lacks the specified permission
 *
 * Requirements: 6.2, 6.3
 *
 * @param permission - The permission to require (e.g., 'users:read')
 * @throws Error if user is not authenticated or lacks permission
 */
export async function requirePermission(permission: Permission): Promise<void> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Unauthorized: Authentication required");
  }

  const hasRequiredPermission = await hasPermission(user.id, permission);

  if (!hasRequiredPermission) {
    throw new Error(
      `Unauthorized: Missing required permission '${permission}'`,
    );
  }
}

/**
 * Check if the current user has all specified permissions
 * Returns true only if the user has ALL of the specified permissions
 *
 * Requirements: 6.2, 6.3
 *
 * @param permissions - Array of permissions to check
 * @returns true if user has all permissions, false otherwise
 */
export async function hasPermissions(
  permissions: Permission[],
): Promise<boolean> {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  // Get all user permissions
  const userPermissions = await getUserPermissions(user.id);

  // Check if user has all required permissions
  return permissions.every((permission) =>
    userPermissions.includes(permission),
  );
}
