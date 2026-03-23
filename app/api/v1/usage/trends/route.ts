import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, requireScope, ApiAuthError } from "@/lib/api-auth";
import { checkFeatureAccess } from "@/lib/plan-guard";
import { resolveTeamContext } from "@/lib/team-context";

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  let userIds: string[];
  let primaryUserId: string;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer gct_")) {
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

    const teamCtx = await resolveTeamContext(clerkId);
    if (!teamCtx)
      return NextResponse.json({ error: "No active team" }, { status: 404 });

    const members = await prisma.teamMember.findMany({
      where: { teamId: teamCtx.teamId },
      select: { userId: true },
    });
    userIds = members.map((m) => m.userId);
    primaryUserId = teamCtx.userId;
  }

  // ── Plan gate ────────────────────────────────────────────────────────────────
  const hasAdvancedAnalytics = await checkFeatureAccess(
    primaryUserId,
    "advancedAnalytics",
  );
  if (!hasAdvancedAnalytics) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 });
  }

  // ── Parse query params ───────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultTo = now.toISOString().slice(0, 10);

  const from = searchParams.get("from") ?? defaultFrom;
  const to = searchParams.get("to") ?? defaultTo;
  const projectIdParam = searchParams.get("projectId");

  // ── Query DailyUsageCache grouped by date ────────────────────────────────────
  const rows = await prisma.dailyUsageCache.groupBy({
    by: ["date"],
    where: {
      userId: { in: userIds },
      ...(projectIdParam ? { projectId: projectIdParam } : {}),
      date: { gte: from, lte: to },
    },
    _sum: {
      totalTokens: true,
      totalRequests: true,
      totalCostUsd: true,
      savedTokens: true,
    },
    orderBy: { date: "asc" },
  });

  const trends = rows.map((r) => ({
    date: r.date,
    totalTokens: r._sum.totalTokens ?? 0,
    totalRequests: r._sum.totalRequests ?? 0,
    totalCostUsd: r._sum.totalCostUsd ?? 0,
    savedTokens: r._sum.savedTokens ?? 0,
  }));

  return NextResponse.json({ trends, from, to });
}
