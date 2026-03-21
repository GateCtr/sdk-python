import { redis } from "@/lib/redis";
import { checkQuota } from "@/lib/plan-guard";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
}

// ─── Sliding window (sorted sets) ────────────────────────────────────────────

/**
 * True sliding window rate limiter using Redis sorted sets.
 * Fail-open: if Redis throws, returns { allowed: true }.
 *
 * @param key       Redis key, e.g. "ratelimit:key:{apiKeyId}:rpm"
 * @param limit     Max requests allowed in the window
 * @param windowMs  Window duration in milliseconds (e.g. 60_000)
 */
export async function slidingWindow(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowSeconds = Math.ceil(windowMs / 1000);
  const resetAt = Math.floor((now + windowMs) / 1000);

  try {
    const pipeline = redis.pipeline();

    // 1. Add current timestamp as both score and member
    pipeline.zadd(key, { score: now, member: String(now) });
    // 2. Remove entries outside the window
    pipeline.zremrangebyscore(key, 0, now - windowMs);
    // 3. Count remaining entries
    pipeline.zcount(key, "-inf", "+inf");
    // 4. Set TTL for auto-cleanup
    pipeline.expire(key, windowSeconds);

    const results = await pipeline.exec();

    // ZCOUNT result is at index 2 (0-indexed)
    const count = (results?.[2] as number) ?? 0;

    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch {
    // Fail-open: Redis unavailable → allow request
    return {
      allowed: true,
      limit,
      remaining: limit,
      resetAt: 0,
    };
  }
}

// ─── Composite rate limit check ───────────────────────────────────────────────

/**
 * Check rate limits in order: per-key → per-project → plan-level.
 * Short-circuits on the first exceeded limit.
 *
 * @param apiKeyId   The API key ID
 * @param projectId  Optional project ID
 * @param userId     The user ID (for plan-level check)
 */
export async function checkRateLimits(
  apiKeyId: string,
  projectId: string | undefined,
  userId: string,
): Promise<RateLimitResult> {
  // 1. Per-key limit (default 60 rpm)
  const keyResult = await slidingWindow(
    `ratelimit:key:${apiKeyId}:rpm`,
    60,
    60_000,
  );
  if (!keyResult.allowed) {
    return keyResult;
  }

  // 2. Per-project limit (default 120 rpm), only if projectId is provided
  if (projectId) {
    const projectResult = await slidingWindow(
      `ratelimit:project:${projectId}:rpm`,
      120,
      60_000,
    );
    if (!projectResult.allowed) {
      return projectResult;
    }
  }

  // 3. Plan-level limit via checkQuota
  const quotaResult = await checkQuota(userId, "requests_per_minute");
  if (!quotaResult.allowed) {
    return {
      allowed: false,
      limit: "limit" in quotaResult ? (quotaResult.limit ?? 60) : 60,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 60,
    };
  }

  // All checks passed — return the last successful result
  return keyResult;
}
