import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, requireScope, ApiAuthError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  // ── Auth: Clerk session or API key with "read" scope ─────────────────────────
  let userId: string;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer gct_")) {
    try {
      const ctx = await authenticateApiKey(req);
      requireScope(ctx.scopes, "read");
      userId = ctx.userId;
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

    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    userId = dbUser.id;
  }

  // ── Parse query params ───────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const projectIdParam = searchParams.get("projectId");

  // Default: current calendar month
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultTo = now.toISOString().slice(0, 10);

  const from = fromParam ?? defaultFrom;
  const to = toParam ?? defaultTo;

  // ── Validate projectId ownership ─────────────────────────────────────────────
  if (projectIdParam) {
    const project = await prisma.project.findFirst({
      where: { id: projectIdParam, userId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "project_not_found" }, { status: 403 });
    }
  }

  // ── Aggregate from DailyUsageCache ───────────────────────────────────────────
  const whereBase = {
    userId,
    ...(projectIdParam ? { projectId: projectIdParam } : {}),
    date: { gte: from, lte: to },
  };

  // UsageLog where clause for date range (createdAt)
  const usageLogWhere = {
    userId,
    ...(projectIdParam ? { projectId: projectIdParam } : {}),
    createdAt: { gte: new Date(from), lte: new Date(to + "T23:59:59.999Z") },
  };

  const [totals, byModelRaw, byProjectRaw, budget] = await Promise.all([
    // Totals from DailyUsageCache (fast aggregation)
    prisma.dailyUsageCache.aggregate({
      where: whereBase,
      _sum: {
        totalTokens: true,
        totalRequests: true,
        totalCostUsd: true,
        savedTokens: true,
      },
    }),
    // byModel from UsageLog (DailyUsageCache has no model field)
    prisma.usageLog.groupBy({
      by: ["model"],
      where: usageLogWhere,
      _sum: { totalTokens: true, costUsd: true },
      _count: { id: true },
      orderBy: { _sum: { totalTokens: "desc" } },
    }),
    // byProject from DailyUsageCache (only when not already filtered by project)
    !projectIdParam
      ? prisma.dailyUsageCache.groupBy({
          by: ["projectId"],
          where: { userId, date: { gte: from, lte: to } },
          _sum: { totalTokens: true, totalRequests: true, totalCostUsd: true },
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
    prisma.budget.findUnique({ where: { userId } }),
  ]);

  // ── Budget status ────────────────────────────────────────────────────────────
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let budgetStatus: object | undefined;

  if (budget) {
    const monthAgg = await prisma.dailyUsageCache.aggregate({
      where: { userId, date: { startsWith: monthPrefix } },
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

  return NextResponse.json({
    totalTokens: totals._sum.totalTokens ?? 0,
    totalRequests: totals._sum.totalRequests ?? 0,
    totalCostUsd: totals._sum.totalCostUsd ?? 0,
    savedTokens: totals._sum.savedTokens ?? 0,
    from,
    to,
    byModel: byModelRaw.map((r) => ({
      model: r.model,
      totalTokens: r._sum.totalTokens ?? 0,
      totalRequests: r._count.id,
      totalCostUsd: r._sum.costUsd ?? 0,
    })),
    byProject: byProjectRaw.map((r) => ({
      projectId: r.projectId,
      totalTokens: r._sum.totalTokens ?? 0,
      totalRequests: r._sum.totalRequests ?? 0,
      totalCostUsd: r._sum.totalCostUsd ?? 0,
    })),
    ...(budgetStatus ? { budgetStatus } : {}),
  });
}
