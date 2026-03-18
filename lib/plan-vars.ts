/**
 * Shared interpolation vars for plan feature lists.
 * Used by both the home Pricing component and the /pricing page.
 * Single source of truth — always reads from config/product.ts.
 */
import { PRODUCT } from "@/config/product";

export const PLAN_VARS = [
  // Free
  {
    tokenLimit: PRODUCT.plans.free.tokenLimit,
    projects: PRODUCT.plans.free.projects,
    webhooks: PRODUCT.plans.free.webhooks,
  },
  // Pro
  {
    tokenLimit: PRODUCT.plans.pro.tokenLimit,
    projects: PRODUCT.plans.pro.projects,
    tokenReduction: PRODUCT.metrics.tokenReduction,
  },
  // Team
  {
    tokenLimit: PRODUCT.plans.team.tokenLimit,
    auditDays: PRODUCT.metrics.auditRetentionDays,
  },
  // Enterprise
  {
    sla: PRODUCT.metrics.sla,
  },
] as const;

export const PLAN_PRICES: Record<string, { en: string; fr: string }> = {
  Free: PRODUCT.plans.free.price,
  Pro: PRODUCT.plans.pro.price,
  Team: PRODUCT.plans.team.price,
  Enterprise: PRODUCT.plans.enterprise.price,
};
