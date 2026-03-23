import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveTeamContext } from "@/lib/team-context";
import { getUserPlanType } from "@/lib/plan-guard";
import { DashboardHome } from "@/components/dashboard/home/dashboard-home";

export default async function DashboardPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) redirect("/onboarding");

  const { userId, teamId } = ctx;

  // ── Parallel data fetching ────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7); // "YYYY-MM"

  const [
    planType,
    team,
    todayUsage,
    monthUsage,
    budget,
    topProjects,
    recentLogs,
    providerCount,
    projectCount,
  ] = await Promise.all([
    getUserPlanType(userId),

    prisma.team.findUnique({
      where: { id: teamId },
      select: { name: true },
    }),

    // Today's aggregated usage (all members of the team)
    prisma.usageLog.aggregate({
      where: {
        user: { teamMemberships: { some: { teamId } } },
        createdAt: {
          gte: new Date(`${today}T00:00:00.000Z`),
          lt: new Date(`${today}T23:59:59.999Z`),
        },
      },
      _sum: { totalTokens: true, savedTokens: true, costUsd: true },
      _count: { id: true },
    }),

    // Month usage for budget progress
    prisma.dailyUsageCache.aggregate({
      where: {
        userId,
        date: { startsWith: monthStart },
      },
      _sum: { totalTokens: true, totalCostUsd: true },
    }),

    // Budget (user-level)
    prisma.budget.findUnique({
      where: { userId },
      select: {
        maxTokensPerMonth: true,
        maxCostPerMonth: true,
        alertThresholdPct: true,
        hardStop: true,
      },
    }),

    // Top 3 projects by recent activity
    prisma.project.findMany({
      where: { teamId, isActive: true },
      select: {
        id: true,
        name: true,
        color: true,
        _count: { select: { usageLogs: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 3,
    }),

    // 5 most recent usage logs
    prisma.usageLog.findMany({
      where: { user: { teamMemberships: { some: { teamId } } } },
      select: {
        id: true,
        model: true,
        provider: true,
        totalTokens: true,
        savedTokens: true,
        costUsd: true,
        latencyMs: true,
        optimized: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),

    // Provider count to detect empty workspace
    prisma.lLMProviderKey.count({
      where: {
        isActive: true,
        OR: [{ teamId }, { userId, teamId: null }],
      },
    }),

    // Project count for setup checklist
    prisma.project.count({
      where: { teamId, isActive: true },
    }),
  ]);

  const stats = {
    tokensToday: todayUsage._sum.totalTokens ?? 0,
    savedToday: todayUsage._sum.savedTokens ?? 0,
    requestsToday: todayUsage._count.id ?? 0,
    costToday: todayUsage._sum.costUsd ?? 0,
    tokensMonth: monthUsage._sum.totalTokens ?? 0,
    costMonth: monthUsage._sum.totalCostUsd ?? 0,
  };

  const setupSteps = {
    hasProvider: providerCount > 0,
    hasProject: projectCount > 0,
    hasBudget: budget !== null,
  };

  return (
    <DashboardHome
      workspaceName={team?.name ?? "Workspace"}
      planType={planType}
      stats={stats}
      budget={budget}
      topProjects={topProjects}
      recentLogs={recentLogs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      }))}
      setupSteps={setupSteps}
    />
  );
}
