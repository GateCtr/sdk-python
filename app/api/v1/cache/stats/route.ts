import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { computeEstimatedTokensSaved } from "@/lib/cache-utils";

function requestId() {
  return randomBytes(8).toString("hex");
}

// ─── GET /api/v1/cache/stats ──────────────────────────────────────────────────

export async function GET() {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const now = new Date();
    const where = { expiresAt: { gt: now } };

    const [totalEntries, hitsAgg, topModels] = await Promise.all([
      prisma.cacheEntry.count({ where }),
      prisma.cacheEntry.aggregate({
        where,
        _sum: { hitCount: true },
      }),
      prisma.cacheEntry.groupBy({
        by: ["model", "provider"],
        where,
        _sum: { hitCount: true, promptTokens: true },
        _count: { id: true },
        orderBy: { _sum: { hitCount: "desc" } },
        take: 10,
      }),
    ]);

    const estimatedTokensSaved = computeEstimatedTokensSaved(
      topModels.map((m) => ({
        promptTokens: m._sum.promptTokens ?? 0,
        hitCount: m._sum.hitCount ?? 0,
      })),
    );

    return NextResponse.json(
      {
        totalEntries,
        totalHits: hitsAgg._sum.hitCount ?? 0,
        topModels: topModels.map((m) => ({
          model: m.model,
          provider: m.provider,
          hitCount: m._sum.hitCount ?? 0,
          entryCount: m._count.id,
        })),
        estimatedTokensSaved,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
