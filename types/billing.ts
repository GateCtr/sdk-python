import type { PlanType } from "@prisma/client";
import type { QUOTA_KEY } from "@/constants/billing";

export type QuotaKey = (typeof QUOTA_KEY)[keyof typeof QUOTA_KEY];

export type UpsellState =
  | {
      show: true;
      quotaType: QuotaKey;
      percentUsed: number;
      currentLimit: number;
      nextPlanLimit: number | null;
      nextPlan: PlanType;
    }
  | { show: false };

export type CouponRow = {
  id: string;
  name: string | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: string;
  durationInMonths: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  redeemBy: number | null;
  valid: boolean;
  created: number;
  promoCode: string | null;
  promoCodeId: string | null;
  firstTimeOnly: boolean;
  minimumAmount: number | null;
  minimumAmountCurrency: string | null;
};

export type CreateCouponBody = {
  name?: string;
  discountType: "percent" | "fixed";
  percentOff?: number;
  amountOff?: number;
  currency?: string;
  duration: "once" | "repeating" | "forever";
  durationInMonths?: number;
  maxRedemptions?: number;
  redeemBy?: string;
  promoCode?: string;
  promoMaxRedemptions?: number;
  promoExpiresAt?: string;
  firstTimeOnly?: boolean;
  minimumAmount?: number;
  restrictToCustomer?: string;
};

export type Invoice = {
  id: string;
  number: string | null;
  created: number;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string | null;
  invoice_pdf: string | null;
  paymentIntentId: string | null;
};

export type AuditEntry = {
  id: string;
  action: string;
  actorId: string | null;
  success: boolean;
  error: string | null;
  createdAt: string;
};
