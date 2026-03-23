import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, requireScope, ApiAuthError } from "@/lib/api-auth";
import { checkFeatureAccess } from "@/lib/plan-guard";
import { resolveTeamContext } from "@/lib/team-context";

/** Returns all userIds in the active team (for aggregated team analytics) */
async function resolveTeamUserIds(
  clerkId: string,
): Promise<{ userIds: string[]; primaryUserId: string } | null> {
  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) return null;

  const members = await prisma.teamMember.findMany({
    where: { teamId: ctx.teamId },
    select: { userId: true },
  });

  return {
    userIds: members.map((m) => m.userId),
    primaryUserId: ctx.userId,
  };
}

export async function GET(req: NextRequest) {
  // ── Auth: Clerk session or API key with "read" scope ─────────────────────────
  let userIds: string[];
  let primaryUserId: string;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer gct_")) {
    // API key auth — scoped to the key owner only
    try {
      const ctx = await authenticateApiKey(req);
      requireScope(ctx.scopes, "read");
      userIds = [ctx.userId];
      primaryUserId = ctx.userId;
    } catch (err) {
      if (err instanceof ApiAuthError) {
        return NextResponse.json(
          { error: err.code },
          { status: err.httpStatus },
        );
      }
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  } else {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveTeamUserIds(clerkId);
    if (!resolved)
      return NextResponse.json({ error: "No active team" }, { status: 404 });

    userIds = resolved.userIds;
    primaryUserId = resolved.primaryUserId;
  }

  // ── Plan gate: advanced analytics ───────────────────────────────────────────
  const hasAdvancedAnalytics = await checkFeatureAccess(
    primaryUserId,
    "advancedAnalytics",
  );

  // ── Parse query params ───────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const projectIdParam = searchParams.get("projectId");

  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultTo = now.toISOString().slice(0, 10);

  const from = fromParam ?? defaultFrom;
  const to = toParam ?? defaultTo;

  // ── Validate projectId belongs to team ───────────────────────────────────────
  if (projectIdParam) {
    const project = await prisma.project.findFirst({
      where: { id: projectIdParam, userId: { in: userIds } },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "project_not_found" }, { status: 403 });
    }
  }

  // ── Build where clauses ──────────────────────────────────────────────────────
  const whereBase = {
    userId: { in: userIds },
    ...(projectIdParam ? { projectId: projectIdParam } : {}),
    date: { gte: from, lte: to },
  };

  const usageLogWhere = {
    userId: { in: userIds },
    ...(projectIdParam ? { projectId: projectIdParam } : {}),
    createdAt: { gte: new Date(from), lte: new Date(to + "T23:59:59.999Z") },
  };

  const [totals, byModelRaw, byProviderRaw, byProjectRaw, budget] =
    await Promise.all([
      prisma.dailyUsageCache.aggregate({
        where: whereBase,
        _sum: {
          totalTokens: true,
          totalRequests: true,
          totalCostUsd: true,
          savedTokens: true,
        },
      }),
      hasAdvancedAnalytics
        ? prisma.usageLog.groupBy({
            by: ["model", "provider"],
            where: usageLogWhere,
            _sum: { totalTokens: true, costUsd: true, savedTokens: true },
            _count: { id: true },
            orderBy: { _sum: { totalTokens: "desc" } },
          })
        : Promise.resolve(null),
      hasAdvancedAnalytics
        ? prisma.usageLog.groupBy({
            by: ["provider"],
            where: usageLogWhere,
            _sum: { totalTokens: true, costUsd: true },
            _count: { id: true },
            orderBy: { _sum: { totalTokens: "desc" } },
          })
        : Promise.resolve(null),
      !projectIdParam
        ? prisma.dailyUsageCache.groupBy({
            by: ["projectId"],
            where: { userId: { in: userIds }, date: { gte: from, lte: to } },
            _sum: {
              totalTokens: true,
              totalRequests: true,
              totalCostUsd: true,
            },
            orderBy: { _sum: { totalTokens: "desc" } },
          })
        : Promise.resolve(
            [] as Array<{
              projectId: string | null;
              _sum: {
                totalTokens: number | null;
                totalRequests: number | null;
                totalCostUsd: number | null;
              };
            }>,
          ),
      // Budget reste lié au owner (primaryUserId)
      prisma.budget.findUnique({ where: { userId: primaryUserId } }),
    ]);

  // ── Budget status ────────────────────────────────────────────────────────────
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let budgetStatus: object | undefined;

  if (budget) {
    const monthAgg = await prisma.dailyUsageCache.aggregate({
      where: { userId: { in: userIds }, date: { startsWith: monthPrefix } },
      _sum: { totalTokens: true, totalCostUsd: true },
    });
    const tokensUsed = monthAgg._sum.totalTokens ?? 0;
    const costUsed = monthAgg._sum.totalCostUsd ?? 0;

    budgetStatus = {
      maxTokensPerMonth: budget.maxTokensPerMonth,
      maxCostPerMonth: budget.maxCostPerMonth,
      tokensUsed,
      costUsed,
      alertThresholdPct: budget.alertThresholdPct,
      hardStop: budget.hardStop,
      ...(budget.maxTokensPerMonth
        ? {
            tokensPct: Math.round(
              (tokensUsed / budget.maxTokensPerMonth) * 100,
            ),
          }
        : {}),
    };
  }

  // ── Build response ───────────────────────────────────────────────────────────
  const response: Record<string, unknown> = {
    totalTokens: totals._sum.totalTokens ?? 0,
    totalRequests: totals._sum.totalRequests ?? 0,
    totalCostUsd: totals._sum.totalCostUsd ?? 0,
    savedTokens: totals._sum.savedTokens ?? 0,
    from,
    to,
    byProject: byProjectRaw.map((r) => ({
      projectId: r.projectId,
      totalTokens: r._sum.totalTokens ?? 0,
      totalRequests: r._sum.totalRequests ?? 0,
      totalCostUsd: r._sum.totalCostUsd ?? 0,
    })),
    ...(budgetStatus ? { budgetStatus } : {}),
  };

  if (hasAdvancedAnalytics && byModelRaw) {
    response.byModel = byModelRaw.map((r) => ({
      model: r.model,
      provider: r.provider,
      totalTokens: r._sum.totalTokens ?? 0,
      totalRequests: r._count.id,
      totalCostUsd: r._sum.costUsd ?? 0,
      savedTokens: r._sum.savedTokens ?? 0,
    }));
  }

  if (hasAdvancedAnalytics && byProviderRaw) {
    response.byProvider = byProviderRaw.map((r) => ({
      provider: r.provider,
      totalTokens: r._sum.totalTokens ?? 0,
      totalRequests: r._count.id,
      totalCostUsd: r._sum.costUsd ?? 0,
    }));
  }

  return NextResponse.json(response);
}
