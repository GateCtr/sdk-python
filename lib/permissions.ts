import { prisma } from "@/lib/prisma";
import {
  getCachedPermissions,
  setCachedPermissions,
  invalidateCache as redisInvalidateCache,
} from "@/lib/redis";

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resource types in the RBAC system
 */
export type Resource = "users" | "analytics" | "billing" | "system" | "audit";

/**
 * Action types that can be performed on resources
 */
export type Action = "read" | "write" | "delete" | "export";

/**
 * Permission format: resource:action
 * Examples: 'users:read', 'analytics:export', 'billing:write'
 */
export type Permission = `${Resource}:${Action}`;

/**
 * Role names matching the database RoleName enum
 */
export type RoleName =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "MANAGER"
  | "DEVELOPER"
  | "VIEWER"
  | "SUPPORT";

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSION MATRIX
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Permission matrix defining which permissions each role has
 * This is the source of truth for role-permission mappings
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.3
 */
export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  SUPER_ADMIN: [
    "users:read",
    "users:write",
    "users:delete",
    "analytics:read",
    "analytics:export",
    "billing:read",
    "billing:write",
    "system:read",
    "audit:read",
  ],
  ADMIN: [
    "users:read",
    "users:write",
    "analytics:read",
    "analytics:export",
    "billing:read",
    "billing:write",
    "system:read",
    "audit:read",
  ],
  MANAGER: ["analytics:read", "users:read", "billing:read"],
  DEVELOPER: ["analytics:read"],
  VIEWER: ["analytics:read"],
  SUPPORT: ["users:read", "audit:read"],
};

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE-PERMISSION MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps route patterns to required permissions
 * Used by checkRouteAccess to determine if a user can access a route
 */
const ROUTE_PERMISSIONS: Record<string, Permission> = {
  "/admin/users": "users:read",
  "/admin/plans": "billing:read",
  "/admin/feature-flags": "system:read",
  "/admin/audit-logs": "audit:read",
  "/admin/system": "system:read",
  "/admin/waitlist": "users:read",
  // French routes
  "/fr/admin/users": "users:read",
  "/fr/admin/plans": "billing:read",
  "/fr/admin/feature-flags": "system:read",
  "/fr/admin/audit-logs": "audit:read",
  "/fr/admin/system": "system:read",
  "/fr/admin/waitlist": "users:read",
};

/**
 * Admin roles that have access to the admin area
 */
const ADMIN_ROLES: RoleName[] = ["SUPER_ADMIN", "ADMIN", "MANAGER", "SUPPORT"];

// ═══════════════════════════════════════════════════════════════════════════
// CORE PERMISSION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a user has a specific permission
 *
 * Algorithm:
 * 1. Check Redis cache first (5-minute TTL)
 * 2. If cache miss, query database for user roles
 * 3. Compute union of permissions from all roles
 * 4. Cache result in Redis
 * 5. Return true if permission is in the set
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 5.8
 *
 * @param userId - The user's ID
 * @param permission - The permission to check (e.g., 'users:read')
 * @returns true if user has the permission, false otherwise
 */
export async function hasPermission(
  userId: string,
  permission: Permission,
): Promise<boolean> {
  try {
    // Step 1: Check cache first
    const cachedPermissions = await getCachedPermissions(userId);

    if (cachedPermissions !== null) {
      // Cache hit - return result (cast from string[] to Permission[])
      return (cachedPermissions as Permission[]).includes(permission);
    }

    // Step 2: Cache miss - query database
    const userPermissions = await getUserPermissionsFromDB(userId);

    // Step 3: Cache the result
    await setCachedPermissions(userId, userPermissions);

    // Step 4: Check if permission exists
    return userPermissions.includes(permission);
  } catch (error) {
    console.error("hasPermission error:", error);
    // Fail-secure: deny access on errors (Requirement 18.7)
    return false;
  }
}

/**
 * Get all permissions for a user
 *
 * Algorithm:
 * 1. Check Redis cache first
 * 2. If cache miss, query database for user roles
 * 3. Compute union of all permissions from all roles
 * 4. Cache result in Redis
 * 5. Return permissions array
 *
 * Requirements: 4.9, 5.5, 5.6
 *
 * @param userId - The user's ID
 * @returns Array of all permissions the user has
 */
export async function getUserPermissions(
  userId: string,
): Promise<Permission[]> {
  try {
    // Step 1: Check cache first
    const cachedPermissions = await getCachedPermissions(userId);

    if (cachedPermissions !== null) {
      // Cache hit - return cached result (cast from string[] to Permission[])
      return cachedPermissions as Permission[];
    }

    // Step 2: Cache miss - query database
    const userPermissions = await getUserPermissionsFromDB(userId);

    // Step 3: Cache the result
    await setCachedPermissions(userId, userPermissions);

    // Step 4: Return permissions
    return userPermissions;
  } catch (error) {
    console.error("getUserPermissions error:", error);
    // Fail-secure: return empty array on errors
    return [];
  }
}

/**
 * Internal helper: Query database for user permissions
 * Computes union of all permissions from all user roles
 *
 * @param userId - The user's ID
 * @returns Array of permissions
 */
async function getUserPermissionsFromDB(userId: string): Promise<Permission[]> {
  // Query user roles from database
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: true,
    },
  });

  // If user has no roles, return empty array
  if (userRoles.length === 0) {
    return [];
  }

  // Compute union of all permissions from all roles
  const permissionsSet = new Set<Permission>();

  for (const userRole of userRoles) {
    const roleName = userRole.role.name as RoleName;
    const rolePermissions = ROLE_PERMISSIONS[roleName] || [];

    for (const permission of rolePermissions) {
      permissionsSet.add(permission);
    }
  }

  // Convert Set to Array
  return Array.from(permissionsSet);
}

/**
 * Invalidate cached permissions for a user
 * Should be called when user roles are modified (granted or revoked)
 *
 * Requirements: 5.10
 *
 * @param userId - The user's ID
 */
export async function invalidatePermissionCache(userId: string): Promise<void> {
  try {
    await redisInvalidateCache(userId);
  } catch (error) {
    console.error("invalidatePermissionCache error:", error);
    // Don't throw - cache invalidation failure shouldn't break the application
  }
}

/**
 * Check if a user can access a specific route
 *
 * Algorithm:
 * 1. Check if route requires admin role (any /admin/* route)
 * 2. If admin route, verify user has an admin role
 * 3. Check if route has specific permission requirement
 * 4. If permission required, verify user has that permission
 * 5. Return true if authorized, false otherwise
 *
 * Requirements: 6.2, 6.3
 *
 * @param userId - The user's ID
 * @param route - The route path (e.g., '/admin/users')
 * @returns true if user can access the route, false otherwise
 */
export async function checkRouteAccess(
  userId: string,
  route: string,
): Promise<boolean> {
  try {
    // Check if this is an admin route
    const isAdminRoute = route.includes("/admin/");

    if (isAdminRoute) {
      // Verify user has an admin role
      const hasAdminRole = await userHasAnyRole(userId, ADMIN_ROLES);

      if (!hasAdminRole) {
        return false;
      }
    }

    // Check if route has specific permission requirement
    const requiredPermission = ROUTE_PERMISSIONS[route];

    if (requiredPermission) {
      // Verify user has the required permission
      return await hasPermission(userId, requiredPermission);
    }

    // If no specific permission required and user passed admin check, allow access
    return isAdminRoute ? true : true;
  } catch (error) {
    console.error("checkRouteAccess error:", error);
    // Fail-secure: deny access on errors
    return false;
  }
}

/**
 * Internal helper: Check if user has any of the specified roles
 *
 * @param userId - The user's ID
 * @param roles - Array of role names to check
 * @returns true if user has at least one of the roles
 */
async function userHasAnyRole(
  userId: string,
  roles: RoleName[],
): Promise<boolean> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: true,
    },
  });

  return userRoles.some((userRole) =>
    roles.includes(userRole.role.name as RoleName),
  );
}
