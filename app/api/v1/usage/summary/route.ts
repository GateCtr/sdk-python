import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlanLimits } from "@/lib/plan-guard";
import { resolveTeamContext } from "@/lib/team-context";

export async function GET(): Promise<NextResponse> {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx)
    return NextResponse.json({ error: "No active team" }, { status: 404 });

  const members = await prisma.teamMember.findMany({
    where: { teamId: ctx.teamId },
    select: { userId: true },
  });
  const userIds = members.map((m) => m.userId);

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { plan: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [agg, limits, budget] = await Promise.all([
    prisma.dailyUsageCache.aggregate({
      where: { userId: { in: userIds }, date: { startsWith: monthStart } },
      _sum: { totalTokens: true, totalCostUsd: true },
    }),
    getPlanLimits(user.plan),
    prisma.budget.findUnique({ where: { userId: ctx.userId } }),
  ]);

  const tokensUsed = agg._sum.totalTokens ?? 0;
  const costUsed = agg._sum.totalCostUsd ?? 0;

  let budgetStatus: object | undefined;
  if (budget) {
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
    plan: user.plan,
    tokensUsed,
    tokensLimit: limits?.maxTokensPerMonth ?? null,
    costUsed,
    ...(budgetStatus ? { budgetStatus } : {}),
  });
}
