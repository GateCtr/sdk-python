import type { PlanType } from "@prisma/client";

export const QUOTA_KEY = {
  TOKENS_PER_MONTH: "tokens_per_month",
  REQUESTS_PER_DAY: "requests_per_day",
} as const;

export const NEXT_PLAN: Record<PlanType, PlanType | null> = {
  FREE: "PRO",
  PRO: "TEAM",
  TEAM: "ENTERPRISE",
  ENTERPRISE: null,
};

export const PLAN_MRR: Record<PlanType, number> = {
  FREE: 0,
  PRO: 29,
  TEAM: 99,
  ENTERPRISE: 0,
};

export const PLAN_ORDER: PlanType[] = ["FREE", "PRO", "TEAM", "ENTERPRISE"];

// Token limits per plan (numeric, source of truth for runtime checks)
export const PLAN_TOKEN_LIMIT: Record<PlanType, number | null> = {
  FREE: 50_000,
  PRO: 2_000_000,
  TEAM: 10_000_000,
  ENTERPRISE: null, // unlimited
};
