import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/plan-guard";

function requestId() {
  return randomBytes(8).toString("hex");
}

// ─── GET /api/v1/projects/[id]/usage ─────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers },
      );

    const { id: projectId } = await params;

    // Ownership check
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: dbUser.id },
      select: { id: true },
    });
    if (!project)
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers },
      );

    // Parse date range — default: current calendar month
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const defaultTo = now.toISOString().slice(0, 10);
    const from = searchParams.get("from") ?? defaultFrom;
    const to = searchParams.get("to") ?? defaultTo;

    const whereCache = { projectId, date: { gte: from, lte: to } };
    const whereLog = {
      projectId,
      createdAt: { gte: new Date(from), lte: new Date(to + "T23:59:59.999Z") },
    };

    const hasAdvancedAnalytics = await checkFeatureAccess(
      dbUser.id,
      "advancedAnalytics",
    );

    const [totals, byDate, budget, byModelRaw] = await Promise.all([
      prisma.dailyUsageCache.aggregate({
        where: whereCache,
        _sum: {
          totalTokens: true,
          totalRequests: true,
          totalCostUsd: true,
          savedTokens: true,
        },
      }),
      prisma.dailyUsageCache.findMany({
        where: whereCache,
        orderBy: { date: "asc" },
        select: {
          date: true,
          totalTokens: true,
          totalRequests: true,
          totalCostUsd: true,
          savedTokens: true,
        },
      }),
      prisma.budget.findUnique({ where: { projectId } }),
      hasAdvancedAnalytics
        ? prisma.usageLog.groupBy({
            by: ["model", "provider"],
            where: whereLog,
            _sum: { totalTokens: true, costUsd: true, savedTokens: true },
            _count: { id: true },
            orderBy: { _sum: { totalTokens: "desc" } },
          })
        : Promise.resolve(null),
    ]);

    const response: Record<string, unknown> = {
      projectId,
      from,
      to,
      totalTokens: totals._sum.totalTokens ?? 0,
      totalRequests: totals._sum.totalRequests ?? 0,
      totalCostUsd: totals._sum.totalCostUsd ?? 0,
      savedTokens: totals._sum.savedTokens ?? 0,
      byDate,
    };

    if (budget) {
      const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthAgg = await prisma.dailyUsageCache.aggregate({
        where: { projectId, date: { startsWith: monthPrefix } },
        _sum: { totalTokens: true, totalCostUsd: true },
      });
      const tokensUsed = monthAgg._sum.totalTokens ?? 0;
      const costUsed = monthAgg._sum.totalCostUsd ?? 0;

      response.budgetStatus = {
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

    return NextResponse.json(response, { headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
