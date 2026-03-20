"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getPlanLimits } from "@/lib/plan-guard";
import { NEXT_PLAN, QUOTA_KEY } from "@/constants/billing";
import type { UpsellState } from "@/types/billing";
export type { UpsellState } from "@/types/billing";

// ─── Action ───────────────────────────────────────────────────────────────────

export async function getUpsellState(): Promise<UpsellState> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { show: false };

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, plan: true },
  });
  if (!user) return { show: false };

  const nextPlan = NEXT_PLAN[user.plan];
  if (!nextPlan) return { show: false }; // Enterprise — no upsell

  const limits = await getPlanLimits(user.plan);
  if (!limits) return { show: false };

  const nextLimits = await getPlanLimits(nextPlan);

  // ── Check tokens_per_month ──────────────────────────────────────────────────
  if (limits.maxTokensPerMonth !== null) {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const agg = await prisma.dailyUsageCache.aggregate({
      where: { userId: user.id, date: { startsWith: monthStart } },
      _sum: { totalTokens: true },
    });
    const used = agg._sum.totalTokens ?? 0;
    const pct = Math.round((used / limits.maxTokensPerMonth) * 100);

    if (pct >= 80) {
      const dedupeKey = `upsell:${user.id}:${QUOTA_KEY.TOKENS_PER_MONTH}:${now.toISOString().slice(0, 10)}`;
      const isFirst = await redis.set(dedupeKey, "1", { nx: true, ex: 86400 });
      if (isFirst) {
        return {
          show: true,
          quotaType: QUOTA_KEY.TOKENS_PER_MONTH,
          percentUsed: pct,
          currentLimit: limits.maxTokensPerMonth,
          nextPlanLimit: nextLimits?.maxTokensPerMonth ?? null,
          nextPlan,
        };
      }
    }
  }

  // ── Check requests_per_day ──────────────────────────────────────────────────
  if (limits.maxRequestsPerDay !== null) {
    const today = new Date().toISOString().slice(0, 10);
    const agg = await prisma.dailyUsageCache.aggregate({
      where: { userId: user.id, date: today },
      _sum: { totalRequests: true },
    });
    const used = agg._sum.totalRequests ?? 0;
    const pct = Math.round((used / limits.maxRequestsPerDay) * 100);

    if (pct >= 80) {
      const now = new Date();
      const dedupeKey = `upsell:${user.id}:${QUOTA_KEY.REQUESTS_PER_DAY}:${now.toISOString().slice(0, 10)}`;
      const isFirst = await redis.set(dedupeKey, "1", { nx: true, ex: 86400 });
      if (isFirst) {
        return {
          show: true,
          quotaType: QUOTA_KEY.REQUESTS_PER_DAY,
          percentUsed: pct,
          currentLimit: limits.maxRequestsPerDay,
          nextPlanLimit: nextLimits?.maxRequestsPerDay ?? null,
          nextPlan,
        };
      }
    }
  }

  return { show: false };
}
