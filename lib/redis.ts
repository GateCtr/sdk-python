import { Redis } from "@upstash/redis";

// Redis client singleton for permission caching
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Cache configuration constants
export const CACHE_TTL = 300; // 5 minutes in seconds
export const PERMISSION_CACHE_PREFIX = "permissions:";

// Permission type (matches lib/permissions.ts)
// Using string to avoid circular dependency, but will be cast to Permission type in lib/permissions.ts
export type Permission = string;

/**
 * Request-level in-memory cache.
 * Avoids redundant Redis round-trips within a single request lifecycle.
 * Keyed by userId; cleared between requests automatically (module scope per request in Next.js edge/serverless).
 */
const requestCache = new Map<string, Permission[]>();

/**
 * Retrieve cached permissions for a user from Redis
 * @param userId - The user's ID
 * @returns Array of permissions or null if cache miss
 */
export async function getCachedPermissions(
  userId: string,
): Promise<Permission[] | null> {
  // 1. Request-level cache hit (fastest path)
  if (requestCache.has(userId)) {
    return requestCache.get(userId)!;
  }

  try {
    const cacheKey = `${PERMISSION_CACHE_PREFIX}${userId}`;
    const cached = await redis.get<Permission[]>(cacheKey);
    if (cached) {
      requestCache.set(userId, cached);
    }
    return cached;
  } catch (error) {
    console.error("Redis getCachedPermissions error:", error);
    return null; // Fallback to null on error (will trigger database query)
  }
}

/**
 * Store user permissions in Redis cache with TTL
 * @param userId - The user's ID
 * @param permissions - Array of permissions to cache
 */
export async function setCachedPermissions(
  userId: string,
  permissions: Permission[],
): Promise<void> {
  // Populate request-level cache immediately
  requestCache.set(userId, permissions);

  try {
    const cacheKey = `${PERMISSION_CACHE_PREFIX}${userId}`;
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(permissions));
  } catch (error) {
    console.error("Redis setCachedPermissions error:", error);
    // Don't throw - caching failure shouldn't break the application
  }
}

/**
 * Invalidate cached permissions for a user
 * Called when user roles are modified
 * @param userId - The user's ID
 */
export async function invalidateCache(userId: string): Promise<void> {
  // Clear request-level cache too
  requestCache.delete(userId);

  try {
    const cacheKey = `${PERMISSION_CACHE_PREFIX}${userId}`;
    await redis.del(cacheKey);
  } catch (error) {
    console.error("Redis invalidateCache error:", error);
    // Don't throw - cache invalidation failure shouldn't break the application
  }
}

/**
 * Bulk-invalidate permissions for multiple users using Redis pipelining.
 * Used when a role's permission set changes (affects all users with that role).
 * @param userIds - Array of user IDs whose caches should be cleared
 */
export async function bulkInvalidateCache(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;

  // Clear request-level caches
  for (const userId of userIds) {
    requestCache.delete(userId);
  }

  try {
    const pipeline = redis.pipeline();
    for (const userId of userIds) {
      pipeline.del(`${PERMISSION_CACHE_PREFIX}${userId}`);
    }
    await pipeline.exec();
  } catch (error) {
    console.error("Redis bulkInvalidateCache error:", error);
  }
}
