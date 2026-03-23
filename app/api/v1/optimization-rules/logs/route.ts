import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

function requestId(): string {
  return randomBytes(8).toString("hex");
}

// ── GET /api/v1/optimization-rules/logs ──────────────────────────────────────
// Returns optimization logs for the authenticated user, optionally filtered
// by projectId or ruleId. Gated on advancedAnalytics plan feature.

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get("ruleId") ?? undefined;
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "50", 10),
      200,
    );
    const cursor = searchParams.get("cursor") ?? undefined;

    // Collect this user's usageLog IDs, then filter optimizationLogs by them
    const usageLogRows = await prisma.usageLog.findMany({
      where: { userId: dbUser.id },
      select: { id: true },
    });
    const userUsageLogIds = usageLogRows.map((r) => r.id);

    const logs = await prisma.optimizationLog.findMany({
      where: {
        ...(ruleId ? { ruleId } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
        usageLogId: { in: userUsageLogIds },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        usageLogId: true,
        ruleId: true,
        originalTokens: true,
        optimizedTokens: true,
        savedTokens: true,
        technique: true,
        createdAt: true,
      },
    });

    const hasMore = logs.length > limit;
    const items = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({ logs: items, nextCursor, hasMore }, { headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
