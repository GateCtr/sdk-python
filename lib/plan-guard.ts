import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import type { PlanLimit, PlanType } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuotaType =
  | "tokens_per_month"
  | "requests_per_day"
  | "requests_per_minute"
  | "projects"
  | "api_keys"
  | "webhooks"
  | "team_members";

export type QuotaResult =
  | { allowed: true; overage?: boolean }
  | { allowed: false; quota: QuotaType; limit: number; current: number };

export type FeatureKey =
  | "contextOptimizer"
  | "modelRouter"
  | "advancedAnalytics"
  | "auditLogs";

const PLAN_CACHE_TTL = 300; // 5 minutes

// ─── Plan limits ──────────────────────────────────────────────────────────────

/**
 * Get plan limits — Redis-first, DB fallback, write-back on miss.
 * Fail-open if Redis is unavailable.
 */
export async function getPlanLimits(
  planType: PlanType,
): Promise<PlanLimit | null> {
  const cacheKey = `plan_limits:${planType}`;

  // 1. Try Redis
  try {
    const cached = await redis.get<PlanLimit>(cacheKey);
    if (cached) return cached;
  } catch {
    // fail-open — continue to DB
  }

  // 2. DB fallback
  const plan = await prisma.plan.findUnique({
    where: { name: planType },
    include: { limits: true },
  });
  const limits = plan?.limits ?? null;

  // 3. Write-back to Redis
  if (limits) {
    try {
      await redis.setex(cacheKey, PLAN_CACHE_TTL, JSON.stringify(limits));
    } catch {
      // fail-open
    }
  }

  return limits;
}

/**
 * Get the PlanType for a user by their internal DB id.
 */
export async function getUserPlanType(userId: string): Promise<PlanType> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  return user?.plan ?? "FREE";
}

/**
 * Invalidate the plan limits cache for a given plan type.
 * Called after plan changes so the next request re-fetches from DB.
 */
export async function invalidatePlanCache(
  planType: PlanType | string,
): Promise<void> {
  try {
    await redis.del(`plan_limits:${planType}`);
  } catch {
    // fail-open
  }
}

// ─── Quota check ──────────────────────────────────────────────────────────────

/**
 * Check whether a user is within quota for a given quota type.
 * Returns { allowed: true } immediately when the limit is null (unlimited).
 * For tokens_per_month on PRO/TEAM, returns { allowed: true, overage: true } instead of blocking.
 */
export async function checkQuota(
  userId: string,
  type: QuotaType,
): Promise<QuotaResult> {
  const planType = await getUserPlanType(userId);
  const limits = await getPlanLimits(planType);

  if (!limits) return { allowed: true };

  switch (type) {
    case "tokens_per_month": {
      const limit = limits.maxTokensPerMonth;
      if (limit === null) return { allowed: true };

      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const agg = await prisma.dailyUsageCache.aggregate({
        where: {
          userId,
          date: { startsWith: monthStart },
        },
        _sum: { totalTokens: true },
      });
      const current = agg._sum.totalTokens ?? 0;

      if (current < limit) return { allowed: true };

      // PRO/TEAM: allow with overage flag instead of blocking
      if (planType === "PRO" || planType === "TEAM") {
        return { allowed: true, overage: true };
      }

      return { allowed: false, quota: type, limit, current };
    }

    case "requests_per_day": {
      const limit = limits.maxRequestsPerDay;
      if (limit === null) return { allowed: true };

      const today = new Date().toISOString().slice(0, 10);
      const agg = await prisma.dailyUsageCache.aggregate({
        where: { userId, date: today },
        _sum: { totalRequests: true },
      });
      const current = agg._sum.totalRequests ?? 0;
      if (current < limit) return { allowed: true };
      return { allowed: false, quota: type, limit, current };
    }

    case "requests_per_minute": {
      const limit = limits.maxRequestsPerMinute;
      if (limit === null || limit === 0) return { allowed: true };

      // Upstash sliding window via Redis INCR + TTL
      const windowKey = `ratelimit:${userId}:rpm`;
      try {
        const count = await redis.incr(windowKey);
        if (count === 1) {
          // First request in this window — set 60s TTL
          await redis.expire(windowKey, 60);
        }
        if (count > limit) {
          return { allowed: false, quota: type, limit, current: count };
        }
      } catch {
        // fail-open on Redis error
      }
      return { allowed: true };
    }

    case "projects": {
      const limit = limits.maxProjects;
      if (limit === null) return { allowed: true };
      const current = await prisma.project.count({
        where: { userId, isActive: true },
      });
      if (current < limit) return { allowed: true };
      return { allowed: false, quota: type, limit, current };
    }

    case "api_keys": {
      const limit = limits.maxApiKeys;
      if (limit === null) return { allowed: true };
      const current = await prisma.apiKey.count({
        where: { userId, isActive: true },
      });
      if (current < limit) return { allowed: true };
      return { allowed: false, quota: type, limit, current };
    }

    case "webhooks": {
      const limit = limits.maxWebhooks;
      if (limit === null) return { allowed: true };
      const current = await prisma.webhook.count({
        where: { userId, isActive: true },
      });
      if (current < limit) return { allowed: true };
      return { allowed: false, quota: type, limit, current };
    }

    case "team_members": {
      const limit = limits.maxTeamMembers;
      if (limit === null) return { allowed: true };
      // Count members in teams owned by this user
      const team = await prisma.team.findFirst({ where: { ownerId: userId } });
      if (!team) return { allowed: true };
      const current = await prisma.teamMember.count({
        where: { teamId: team.id },
      });
      if (current < limit) return { allowed: true };
      return { allowed: false, quota: type, limit, current };
    }

    default:
      return { allowed: true };
  }
}

// ─── Feature access ───────────────────────────────────────────────────────────

/**
 * Check whether a user's plan grants access to a boolean feature.
 */
export async function checkFeatureAccess(
  userId: string,
  feature: FeatureKey,
): Promise<boolean> {
  const planType = await getUserPlanType(userId);
  const limits = await getPlanLimits(planType);
  if (!limits) return false;

  switch (feature) {
    case "contextOptimizer":
      return limits.contextOptimizerEnabled;
    case "modelRouter":
      return limits.modelRouterEnabled;
    case "advancedAnalytics":
      return limits.advancedAnalytics;
    case "auditLogs":
      return limits.auditLogsRetentionDays > 0;
    default:
      return false;
  }
}
