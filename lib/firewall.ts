import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { checkQuota } from "@/lib/plan-guard";
import { dispatchWebhook } from "@/lib/webhooks";
import { logAudit } from "@/lib/audit";

export interface BudgetCheckResult {
  allowed: boolean;
  overage?: boolean;
  reason?: string;
  scope?: "user" | "project";
  limit?: number;
  current?: number;
  budgetId?: string;
}

/**
 * Placeholder for budget threshold email — email implementation deferred.
 * Fire-and-forget; never throws.
 */
async function sendBudgetThresholdEmail(
  userId: string,
  scope: "user" | "project",
  id: string,
  percent: number,
): Promise<void> {
  console.log(
    `[budget] threshold email queued: scope=${scope} id=${id} userId=${userId} percent=${percent}%`,
  );
}

/**
 * Check whether a request should be allowed based on budget constraints.
 *
 * Checks (in order):
 *  1. User-level Budget + project-level Budget (parallel DB fetch)
 *  2. DailyUsageCache aggregated for current calendar month
 *  3. Plan-level quota via checkQuota
 *  4. Stricter-wins: any hard-stop exceeded → blocked; any soft limit exceeded → overage
 *  5. Alert threshold crossing (idempotent via Redis SET NX)
 *
 * All Redis operations are wrapped in try/catch (fail-open).
 * All post-response side effects are fire-and-forget.
 */
export async function checkBudget(
  userId: string,
  projectId?: string,
): Promise<BudgetCheckResult> {
  // 1. Fetch user Budget + project Budget in parallel
  const [userBudget, projectBudget] = await Promise.all([
    prisma.budget.findUnique({ where: { userId } }),
    projectId ? prisma.budget.findUnique({ where: { projectId } }) : null,
  ]);

  // 2. Aggregate DailyUsageCache for current calendar month
  const monthPrefix = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const [userAgg, projectAgg] = await Promise.all([
    prisma.dailyUsageCache.aggregate({
      where: { userId, date: { startsWith: monthPrefix } },
      _sum: { totalTokens: true, totalCostUsd: true },
    }),
    projectId
      ? prisma.dailyUsageCache.aggregate({
          where: { userId, projectId, date: { startsWith: monthPrefix } },
          _sum: { totalTokens: true, totalCostUsd: true },
        })
      : null,
  ]);

  const userTokens = userAgg._sum.totalTokens ?? 0;
  const userCost = userAgg._sum.totalCostUsd ?? 0;
  const projectTokens = projectAgg?._sum.totalTokens ?? 0;
  const projectCost = projectAgg?._sum.totalCostUsd ?? 0;

  // 3. Plan-level quota check
  const planQuota = await checkQuota(userId, "tokens_per_month");

  // 4. Apply stricter-wins logic
  let hardBlocked = false;
  let hardBlockResult: BudgetCheckResult | null = null;
  let overage = false;

  // Check user budget
  if (userBudget) {
    if (
      userBudget.maxTokensPerMonth !== null &&
      userTokens >= userBudget.maxTokensPerMonth
    ) {
      if (userBudget.hardStop) {
        hardBlocked = true;
        hardBlockResult = {
          allowed: false,
          scope: "user",
          limit: userBudget.maxTokensPerMonth,
          current: userTokens,
          budgetId: userBudget.id,
        };
      } else {
        overage = true;
      }
    }

    if (
      !hardBlocked &&
      userBudget.maxCostPerMonth !== null &&
      userCost >= userBudget.maxCostPerMonth
    ) {
      if (userBudget.hardStop) {
        hardBlocked = true;
        hardBlockResult = {
          allowed: false,
          scope: "user",
          limit: userBudget.maxCostPerMonth,
          current: userCost,
          budgetId: userBudget.id,
        };
      } else {
        overage = true;
      }
    }
  }

  // Check project budget
  if (!hardBlocked && projectBudget) {
    if (
      projectBudget.maxTokensPerMonth !== null &&
      projectTokens >= projectBudget.maxTokensPerMonth
    ) {
      if (projectBudget.hardStop) {
        hardBlocked = true;
        hardBlockResult = {
          allowed: false,
          scope: "project",
          limit: projectBudget.maxTokensPerMonth,
          current: projectTokens,
          budgetId: projectBudget.id,
        };
      } else {
        overage = true;
      }
    }

    if (
      !hardBlocked &&
      projectBudget.maxCostPerMonth !== null &&
      projectCost >= projectBudget.maxCostPerMonth
    ) {
      if (projectBudget.hardStop) {
        hardBlocked = true;
        hardBlockResult = {
          allowed: false,
          scope: "project",
          limit: projectBudget.maxCostPerMonth,
          current: projectCost,
          budgetId: projectBudget.id,
        };
      } else {
        overage = true;
      }
    }
  }

  // Check plan quota
  if (!planQuota.allowed) {
    // Plan quota blocked — fire-and-forget side effects then return
    return { allowed: false, reason: "plan_quota" };
  }

  // 5. Check alert threshold crossing (idempotent via Redis SET NX)
  await checkAndDispatchThresholdAlerts(
    userId,
    projectId,
    userBudget,
    projectBudget,
    userTokens,
    userCost,
    projectTokens,
    projectCost,
    monthPrefix,
  );

  // Handle hard stop
  if (hardBlocked && hardBlockResult) {
    const blockedBudget =
      hardBlockResult.scope === "project" ? projectBudget : userBudget;

    // Dispatch budget.exceeded webhook (fire-and-forget)
    if (blockedBudget?.notifyOnExceeded) {
      dispatchWebhook(userId, "budget.exceeded", {
        scope: hardBlockResult.scope,
        limit: hardBlockResult.limit,
        current: hardBlockResult.current,
        budgetId: hardBlockResult.budgetId,
      }).catch(() => {});
    }

    // Log hard stop to audit (fire-and-forget)
    logAudit({
      userId,
      resource: "budget",
      action: "hard_stop",
      resourceId: hardBlockResult.budgetId,
      success: false,
      newValue: {
        scope: hardBlockResult.scope,
        limit: hardBlockResult.limit,
        current: hardBlockResult.current,
      },
    }).catch(() => {});

    return hardBlockResult;
  }

  return { allowed: true, overage: overage || undefined };
}

/**
 * Check alert thresholds and dispatch notifications idempotently via Redis SET NX.
 * All side effects are fire-and-forget.
 */
async function checkAndDispatchThresholdAlerts(
  userId: string,
  projectId: string | undefined,
  userBudget: Awaited<ReturnType<typeof prisma.budget.findUnique>>,
  projectBudget: Awaited<ReturnType<typeof prisma.budget.findUnique>>,
  userTokens: number,
  userCost: number,
  projectTokens: number,
  projectCost: number,
  monthPrefix: string,
): Promise<void> {
  // Check user budget threshold
  if (userBudget) {
    const thresholdPct = userBudget.alertThresholdPct;

    const tokensCrossed =
      userBudget.maxTokensPerMonth !== null &&
      userBudget.maxTokensPerMonth > 0 &&
      (userTokens / userBudget.maxTokensPerMonth) * 100 >= thresholdPct;

    const costCrossed =
      userBudget.maxCostPerMonth !== null &&
      userBudget.maxCostPerMonth > 0 &&
      (userCost / userBudget.maxCostPerMonth) * 100 >= thresholdPct;

    if (tokensCrossed || costCrossed) {
      const alertKey = `budget:alert:user:${userId}:${monthPrefix}`;
      let isFirstCrossing = false;

      try {
        const result = await redis.set(alertKey, "1", {
          nx: true,
          ex: 86400 * 35,
        });
        isFirstCrossing = result !== null;
      } catch {
        // fail-open — skip alert dispatch on Redis error
      }

      if (isFirstCrossing) {
        const percentTokens =
          userBudget.maxTokensPerMonth && userBudget.maxTokensPerMonth > 0
            ? Math.round((userTokens / userBudget.maxTokensPerMonth) * 100)
            : 0;

        if (userBudget.notifyOnThreshold) {
          sendBudgetThresholdEmail(userId, "user", userId, percentTokens).catch(
            () => {},
          );
        }

        dispatchWebhook(userId, "budget.threshold", {
          scope: "user",
          tokens_used: userTokens,
          tokens_limit: userBudget.maxTokensPerMonth,
          cost_used: userCost,
          cost_limit: userBudget.maxCostPerMonth,
          percent: percentTokens,
          budgetId: userBudget.id,
        }).catch(() => {});
      }
    }
  }

  // Check project budget threshold
  if (projectBudget && projectId) {
    const thresholdPct = projectBudget.alertThresholdPct;

    const tokensCrossed =
      projectBudget.maxTokensPerMonth !== null &&
      projectBudget.maxTokensPerMonth > 0 &&
      (projectTokens / projectBudget.maxTokensPerMonth) * 100 >= thresholdPct;

    const costCrossed =
      projectBudget.maxCostPerMonth !== null &&
      projectBudget.maxCostPerMonth > 0 &&
      (projectCost / projectBudget.maxCostPerMonth) * 100 >= thresholdPct;

    if (tokensCrossed || costCrossed) {
      const alertKey = `budget:alert:project:${projectId}:${monthPrefix}`;
      let isFirstCrossing = false;

      try {
        const result = await redis.set(alertKey, "1", {
          nx: true,
          ex: 86400 * 35,
        });
        isFirstCrossing = result !== null;
      } catch {
        // fail-open
      }

      if (isFirstCrossing) {
        const percentTokens =
          projectBudget.maxTokensPerMonth && projectBudget.maxTokensPerMonth > 0
            ? Math.round(
                (projectTokens / projectBudget.maxTokensPerMonth) * 100,
              )
            : 0;

        if (projectBudget.notifyOnThreshold) {
          sendBudgetThresholdEmail(
            userId,
            "project",
            projectId,
            percentTokens,
          ).catch(() => {});
        }

        dispatchWebhook(userId, "budget.threshold", {
          scope: "project",
          projectId,
          tokens_used: projectTokens,
          tokens_limit: projectBudget.maxTokensPerMonth,
          cost_used: projectCost,
          cost_limit: projectBudget.maxCostPerMonth,
          percent: percentTokens,
          budgetId: projectBudget.id,
        }).catch(() => {});
      }
    }
  }
}

/**
 * Record usage in DailyUsageCache and re-evaluate threshold alerts.
 *
 * Uses upsert on (userId, projectId, date) unique constraint.
 * When projectId is undefined, stores null (not undefined) to match the constraint.
 */
export async function recordBudgetUsage(
  userId: string,
  projectId: string | undefined,
  tokens: number,
  costUsd: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const projectIdValue = projectId ?? null;

  await prisma.dailyUsageCache.upsert({
    where: {
      userId_projectId_date: {
        userId,
        projectId: projectIdValue as string,
        date: today,
      },
    },
    create: {
      userId,
      projectId: projectIdValue,
      date: today,
      totalTokens: tokens,
      totalRequests: 1,
      totalCostUsd: costUsd,
    },
    update: {
      totalTokens: { increment: tokens },
      totalRequests: { increment: 1 },
      totalCostUsd: { increment: costUsd },
      lastUpdated: new Date(),
    },
  });

  // Re-evaluate threshold alerts after recording usage
  const monthPrefix = today.slice(0, 7);

  const [userBudget, projectBudget] = await Promise.all([
    prisma.budget.findUnique({ where: { userId } }),
    projectId ? prisma.budget.findUnique({ where: { projectId } }) : null,
  ]);

  const [userAgg, projectAgg] = await Promise.all([
    prisma.dailyUsageCache.aggregate({
      where: { userId, date: { startsWith: monthPrefix } },
      _sum: { totalTokens: true, totalCostUsd: true },
    }),
    projectId
      ? prisma.dailyUsageCache.aggregate({
          where: { userId, projectId, date: { startsWith: monthPrefix } },
          _sum: { totalTokens: true, totalCostUsd: true },
        })
      : null,
  ]);

  await checkAndDispatchThresholdAlerts(
    userId,
    projectId,
    userBudget,
    projectBudget,
    userAgg._sum.totalTokens ?? 0,
    userAgg._sum.totalCostUsd ?? 0,
    projectAgg?._sum.totalTokens ?? 0,
    projectAgg?._sum.totalCostUsd ?? 0,
    monthPrefix,
  );
}
