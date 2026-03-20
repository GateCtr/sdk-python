"use client";

/**
 * Admin Billing — tabbed client component.
 * Tabs: Overview | Subscriptions | Events | Coupons
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Lock,
  AlertTriangle,
  Plus,
  Trash2,
  ChevronRight,
  DollarSign,
  Users,
  Activity,
  ShieldAlert,
  ArrowUpRight,
  Tag,
  Copy,
  Check,
} from "lucide-react";
import { Link } from "@/i18n/routing";
import type { PlanType, SubStatus } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type SubscriptionRow = {
  id: string;
  userEmail: string;
  userName: string | null;
  plan: PlanType;
  status: SubStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

type EventRow = {
  id: string;
  action: string;
  userEmail: string | null;
  userId: string;
  createdAt: string;
};

type MrrPoint = { month: string; mrr: number };

type CouponRow = {
  id: string;
  name: string | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: string;
  durationInMonths: number | null;
  timesRedeemed: number;
  maxRedemptions: number | null;
  redeemBy: number | null;
  valid: boolean;
  created: number;
  promoCode: string | null;
  promoCodeId: string | null;
  firstTimeOnly: boolean;
  minimumAmount: number | null;
  minimumAmountCurrency: string | null;
};

type NewCouponForm = {
  name: string;
  discountType: "percent" | "fixed";
  percentOff: string;
  amountOff: string;
  currency: string;
  duration: "once" | "repeating" | "forever";
  durationInMonths: string;
  maxRedemptions: string;
  redeemBy: string;
  // promo code toggles
  hasPromoCode: boolean;
  promoCode: string;
  hasPromoMaxRedemptions: boolean;
  promoMaxRedemptions: string;
  hasPromoExpiresAt: boolean;
  promoExpiresAt: string;
  firstTimeOnly: boolean;
  hasMinimumAmount: boolean;
  minimumAmount: string;
  hasRestrictToCustomer: boolean;
  restrictToCustomer: string;
};

interface Props {
  mrr: number;
  arr: number;
  churnRate: number;
  totalActive: number;
  newThisMonth: number;
  newPrevMonth: number;
  canceledThisMonth: number;
  canceledPrevMonth: number;
  planDistribution: { plan: PlanType; count: number }[];
  mrrHistory: MrrPoint[];
  subscriptions: SubscriptionRow[];
  events: EventRow[];
  revenueAtRisk: number;
  pastDueCount: number;
  canWrite: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delta(current: number, prev: number) {
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  if (Math.abs(pct) < 0.5)
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
        <Minus className="size-3" /> —
      </span>
    );
  const up = pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? "text-secondary-600 dark:text-secondary-400" : "text-error-600 dark:text-error-400"}`}
    >
      {up ? (
        <TrendingUp className="size-3" />
      ) : (
        <TrendingDown className="size-3" />
      )}
      {up ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

const ACTION_LABELS: Record<string, string> = {
  "billing.subscription_created": "Subscription created",
  "billing.subscription_updated": "Subscription updated",
  "billing.subscription_canceled": "Subscription canceled",
  "billing.subscription_cancellation_scheduled": "Cancellation scheduled",
  "billing.subscription_reactivated": "Subscription reactivated",
  "billing.subscription_paused": "Subscription paused",
  "billing.subscription_resumed": "Subscription resumed",
  "billing.trial_started": "Trial started",
  "billing.trial_ended": "Trial ended",
  "billing.payment_succeeded": "Payment succeeded",
  "billing.payment_failed": "Payment failed",
  "billing.invoice_paid": "Invoice paid",
  "billing.invoice_voided": "Invoice voided",
  "billing.refund_issued": "Refund issued",
  "billing.plan_upgraded": "Plan upgraded",
  "billing.plan_downgraded": "Plan downgraded",
  "billing.coupon_applied": "Coupon applied",
};

function formatAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .replace(/^billing\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:
    "bg-secondary-500/10 text-secondary-700 border-secondary-500/25 dark:text-secondary-400",
  TRIALING: "bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-400",
  PAST_DUE:
    "bg-error-500/10 text-error-700 border-error-500/25 dark:text-error-400",
  CANCELED: "bg-muted text-muted-foreground border-border",
  PAUSED:
    "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-400",
  INCOMPLETE: "bg-muted text-muted-foreground border-border",
  INCOMPLETE_EXPIRED: "bg-muted text-muted-foreground border-border",
  UNPAID:
    "bg-error-500/10 text-error-700 border-error-500/25 dark:text-error-400",
};

const PLAN_STYLE: Record<string, string> = {
  FREE: "bg-muted text-muted-foreground border-border",
  PRO: "bg-primary/10 text-primary border-primary/25",
  TEAM: "bg-violet-500/10 text-violet-600 border-violet-500/25 dark:text-violet-400",
  ENTERPRISE:
    "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-400",
};

const PLAN_DOT: Record<string, string> = {
  FREE: "bg-muted-foreground/40",
  PRO: "bg-primary",
  TEAM: "bg-violet-500",
  ENTERPRISE: "bg-amber-500",
};

type StatusFilter =
  | "all"
  | "active"
  | "trialing"
  | "pastDue"
  | "canceled"
  | "paused";

const STATUS_FILTER_MAP: Record<StatusFilter, SubStatus[]> = {
  all: [],
  active: ["ACTIVE"],
  trialing: ["TRIALING"],
  pastDue: ["PAST_DUE", "UNPAID"],
  canceled: ["CANCELED"],
  paused: ["PAUSED"],
};

function eventVariant(
  action: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (action.includes("upgraded") || action.includes("activated"))
    return "default";
  if (action.includes("failed") || action.includes("canceled"))
    return "destructive";
  if (action.includes("trial")) return "secondary";
  return "outline";
}

const EMPTY_COUPON: NewCouponForm = {
  name: "",
  discountType: "percent",
  percentOff: "",
  amountOff: "",
  currency: "usd",
  duration: "once",
  durationInMonths: "",
  maxRedemptions: "",
  redeemBy: "",
  hasPromoCode: false,
  promoCode: "",
  hasPromoMaxRedemptions: false,
  promoMaxRedemptions: "",
  hasPromoExpiresAt: false,
  promoExpiresAt: "",
  firstTimeOnly: false,
  hasMinimumAmount: false,
  minimumAmount: "",
  hasRestrictToCustomer: false,
  restrictToCustomer: "",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdminBillingClient({
  mrr,
  arr,
  churnRate,
  totalActive,
  newThisMonth,
  newPrevMonth,
  canceledThisMonth,
  canceledPrevMonth,
  planDistribution,
  mrrHistory,
  subscriptions,
  events,
  revenueAtRisk,
  pastDueCount,
  canWrite,
}: Props) {
  const t = useTranslations("adminBilling");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [, startTransition] = useTransition();

  // Coupons state
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [couponsLoaded, setCouponsLoaded] = useState(false);
  const [couponForm, setCouponForm] = useState(false);
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);
  const [newCoupon, setNewCoupon] = useState<NewCouponForm>(EMPTY_COUPON);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  async function loadCoupons() {
    if (couponsLoaded) return;
    const res = await fetch("/api/admin/billing/coupons");
    const data = (await res.json()) as { coupons?: CouponRow[] };
    if (data.coupons) {
      setCoupons(data.coupons);
      setCouponsLoaded(true);
    }
  }

  function set<K extends keyof NewCouponForm>(key: K, val: NewCouponForm[K]) {
    setNewCoupon((p) => ({ ...p, [key]: val }));
  }

  function createCoupon() {
    startTransition(async () => {
      const body = {
        name: newCoupon.name || undefined,
        discountType: newCoupon.discountType,
        percentOff:
          newCoupon.discountType === "percent" && newCoupon.percentOff
            ? Number(newCoupon.percentOff)
            : undefined,
        amountOff:
          newCoupon.discountType === "fixed" && newCoupon.amountOff
            ? Number(newCoupon.amountOff)
            : undefined,
        currency: newCoupon.currency || "usd",
        duration: newCoupon.duration,
        durationInMonths:
          newCoupon.duration === "repeating" && newCoupon.durationInMonths
            ? Number(newCoupon.durationInMonths)
            : undefined,
        maxRedemptions: newCoupon.maxRedemptions
          ? Number(newCoupon.maxRedemptions)
          : undefined,
        redeemBy: newCoupon.redeemBy || undefined,
        promoCode:
          newCoupon.hasPromoCode && newCoupon.promoCode
            ? newCoupon.promoCode
            : undefined,
        firstTimeOnly: newCoupon.firstTimeOnly || undefined,
        minimumAmount:
          newCoupon.hasMinimumAmount && newCoupon.minimumAmount
            ? Number(newCoupon.minimumAmount)
            : undefined,
        promoMaxRedemptions:
          newCoupon.hasPromoMaxRedemptions && newCoupon.promoMaxRedemptions
            ? Number(newCoupon.promoMaxRedemptions)
            : undefined,
        promoExpiresAt:
          newCoupon.hasPromoExpiresAt && newCoupon.promoExpiresAt
            ? newCoupon.promoExpiresAt
            : undefined,
        restrictToCustomer:
          newCoupon.hasRestrictToCustomer && newCoupon.restrictToCustomer
            ? newCoupon.restrictToCustomer
            : undefined,
      };
      const res = await fetch("/api/admin/billing/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        coupon?: CouponRow;
        promoCode?: { code: string; id: string } | null;
        error?: string;
      };
      if (res.ok && data.coupon) {
        setCoupons((prev) => [data.coupon!, ...prev]);
        setCouponForm(false);
        setNewCoupon(EMPTY_COUPON);
        setCouponFeedback(null);
      } else {
        setCouponFeedback(data.error ?? t("coupons.createError"));
      }
    });
  }

  function deleteCoupon(id: string, promoId: string | null) {
    startTransition(async () => {
      const url = promoId
        ? `/api/admin/billing/coupons?id=${id}&promoId=${promoId}`
        : `/api/admin/billing/coupons?id=${id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) setCoupons((prev) => prev.filter((c) => c.id !== id));
    });
  }

  function copyCode(code: string) {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  }

  const mrrDelta = delta(mrr, mrrHistory[4]?.mrr ?? 0);
  const newDelta = delta(newThisMonth, newPrevMonth);
  const churnDelta = delta(canceledThisMonth, canceledPrevMonth);
  const filteredSubs =
    statusFilter === "all"
      ? subscriptions
      : subscriptions.filter((s) =>
          STATUS_FILTER_MAP[statusFilter].includes(s.status),
        );

  // ── Overview tab ────────────────────────────────────────────────────────────

  const overviewTab = (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="gap-0 py-0">
          <CardContent className="px-4 py-4 flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("stats.mrr")}
              </span>
              <span className="text-2xl font-bold tabular-nums leading-none">
                ${mrr.toLocaleString()}
              </span>
              <DeltaBadge pct={mrrDelta} />
            </div>
            <div className="shrink-0 rounded-md bg-primary/10 p-2">
              <DollarSign className="size-4 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardContent className="px-4 py-4 flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("stats.arr")}
              </span>
              <span className="text-2xl font-bold tabular-nums leading-none">
                ${arr.toLocaleString()}
              </span>
              <span className="text-[11px] text-muted-foreground">
                annualized
              </span>
            </div>
            <div className="shrink-0 rounded-md bg-violet-500/10 p-2">
              <ArrowUpRight className="size-4 text-violet-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardContent className="px-4 py-4 flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("stats.activeSubscriptions")}
              </span>
              <span className="text-2xl font-bold tabular-nums leading-none">
                {totalActive.toLocaleString()}
              </span>
              <DeltaBadge pct={newDelta} />
            </div>
            <div className="shrink-0 rounded-md bg-secondary-500/10 p-2">
              <Users className="size-4 text-secondary-600 dark:text-secondary-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardContent className="px-4 py-4 flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("stats.churnRate")}
              </span>
              <span className="text-2xl font-bold tabular-nums leading-none">
                {churnRate.toFixed(1)}%
              </span>
              <DeltaBadge pct={churnDelta} />
            </div>
            <div className="shrink-0 rounded-md bg-muted p-2">
              <Activity className="size-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0 overflow-hidden">
        <CardContent className="px-5 pt-5 pb-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("stats.mrrTrend")}
              </p>
              <p className="text-3xl font-bold tabular-nums mt-1">
                ${mrr.toLocaleString()}
              </p>
            </div>
            <DeltaBadge pct={mrrDelta} />
          </div>
        </CardContent>
        <CardContent className="px-0 pb-0">
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart
              data={mrrHistory}
              margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-primary)"
                    stopOpacity={0.2}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-primary)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                dy={-4}
                padding={{ left: 20, right: 20 }}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "6px",
                  fontSize: 12,
                }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, "MRR"]}
              />
              <Area
                type="monotoneX"
                dataKey="mrr"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#mrrGrad)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="gap-0 py-0">
          <CardHeader className="px-5 pt-4 pb-2">
            <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("stats.planDistribution")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 flex flex-col gap-2.5">
            {planDistribution.map(({ plan, count }) => {
              const pct =
                totalActive > 0 ? Math.round((count / totalActive) * 100) : 0;
              return (
                <div key={plan} className="flex items-center gap-3">
                  <span
                    className={`size-2 rounded-full shrink-0 ${PLAN_DOT[plan] ?? "bg-muted-foreground/40"}`}
                  />
                  <span className="text-sm font-medium flex-1">
                    {t(`plans.${plan}`)}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {count}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card
          className={`gap-0 py-0 ${pastDueCount > 0 ? "border-amber-500/40" : ""}`}
        >
          <CardHeader className="px-5 pt-4 pb-2">
            <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("stats.revenueAtRisk")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-3xl font-bold tabular-nums">
                ${revenueAtRisk.toLocaleString()}
              </span>
              {pastDueCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3" />
                  {pastDueCount} {t("stats.pastDue")}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  No past-due accounts
                </span>
              )}
            </div>
            <div
              className={`shrink-0 rounded-md p-3 ${pastDueCount > 0 ? "bg-amber-500/10" : "bg-muted"}`}
            >
              <ShieldAlert
                className={`size-5 ${pastDueCount > 0 ? "text-amber-500" : "text-muted-foreground"}`}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // ── Subscriptions tab ──────────────────────────────────────────────────────

  const subsTab = (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(STATUS_FILTER_MAP) as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={[
              "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
              statusFilter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-border hover:text-foreground",
            ].join(" ")}
          >
            {t(`subscriptions.filters.${f}`)}
          </button>
        ))}
      </div>

      {filteredSubs.length === 0 && (
        <div className="rounded-lg border border-border h-24 flex items-center justify-center text-sm text-muted-foreground">
          {t("subscriptions.empty")}
        </div>
      )}

      {/* Mobile: card list */}
      {filteredSubs.length > 0 && (
        <div className="flex flex-col gap-2 md:hidden">
          {filteredSubs.map((sub) => (
            <div
              key={sub.id}
              className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {sub.userName ?? "—"}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate">
                    {sub.userEmail}
                  </span>
                </div>
                <Link
                  href={`/admin/billing/${sub.id}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                >
                  <ChevronRight className="size-4" />
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant="outline"
                  className={`text-[10px] font-semibold uppercase tracking-wider h-5 px-1.5 ${PLAN_STYLE[sub.plan] ?? PLAN_STYLE.FREE}`}
                >
                  {t(`plans.${sub.plan}`)}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-semibold uppercase tracking-wider h-5 px-1.5 ${STATUS_STYLE[sub.status] ?? STATUS_STYLE.CANCELED}`}
                >
                  {sub.status}
                  {sub.cancelAtPeriodEnd && " ↓"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {sub.trialEnd
                    ? `Trial → ${new Date(sub.trialEnd).toLocaleDateString()}`
                    : sub.currentPeriodEnd
                      ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                      : "—"}
                </span>
                {canWrite && sub.stripeSubscriptionId && (
                  <a
                    href={`https://dashboard.stripe.com/subscriptions/${sub.stripeSubscriptionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono hover:text-foreground transition-colors"
                  >
                    {sub.stripeSubscriptionId.slice(0, 12)}…{" "}
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop: table */}
      {filteredSubs.length > 0 && (
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>{t("subscriptions.table.user")}</TableHead>
                <TableHead>{t("subscriptions.table.plan")}</TableHead>
                <TableHead>{t("subscriptions.table.status")}</TableHead>
                <TableHead>{t("subscriptions.table.period")}</TableHead>
                {canWrite && (
                  <TableHead>{t("subscriptions.table.stripeId")}</TableHead>
                )}
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubs.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {sub.userName ?? "—"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {sub.userEmail}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold uppercase tracking-wider h-5 px-1.5 ${PLAN_STYLE[sub.plan] ?? PLAN_STYLE.FREE}`}
                    >
                      {t(`plans.${sub.plan}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold uppercase tracking-wider h-5 px-1.5 ${STATUS_STYLE[sub.status] ?? STATUS_STYLE.CANCELED}`}
                    >
                      {sub.status}
                      {sub.cancelAtPeriodEnd && " ↓"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {sub.trialEnd
                      ? `Trial → ${new Date(sub.trialEnd).toLocaleDateString()}`
                      : sub.currentPeriodEnd
                        ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                        : "—"}
                  </TableCell>
                  {canWrite && (
                    <TableCell>
                      {sub.stripeSubscriptionId ? (
                        <a
                          href={`https://dashboard.stripe.com/subscriptions/${sub.stripeSubscriptionId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {sub.stripeSubscriptionId.slice(0, 14)}…{" "}
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50">
                          <Lock className="size-3" /> —
                        </span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <Link
                      href={`/admin/billing/${sub.id}`}
                      className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  // ── Events tab ─────────────────────────────────────────────────────────────

  const eventsTab = (
    <div className="flex flex-col gap-2">
      {events.length === 0 && (
        <div className="rounded-lg border border-border h-24 flex items-center justify-center text-sm text-muted-foreground">
          {t("events.empty")}
        </div>
      )}

      {/* Mobile: card list */}
      {events.length > 0 && (
        <div className="flex flex-col gap-2 md:hidden">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-lg border border-border bg-card px-4 py-3 flex items-start justify-between gap-3"
            >
              <div className="flex flex-col gap-1.5 min-w-0">
                <Badge
                  variant={eventVariant(event.action)}
                  className="text-xs w-fit"
                >
                  {formatAction(event.action)}
                </Badge>
                <span className="text-xs text-muted-foreground truncate">
                  {event.userEmail ?? `${event.userId.slice(0, 8)}…`}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 mt-0.5">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Desktop: table */}
      {events.length > 0 && (
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>{t("events.table.action")}</TableHead>
                <TableHead>{t("events.table.user")}</TableHead>
                <TableHead className="text-right">
                  {t("events.table.timestamp")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <Badge
                      variant={eventVariant(event.action)}
                      className="text-xs"
                    >
                      {formatAction(event.action)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {event.userEmail ?? `${event.userId.slice(0, 8)}…`}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                    {new Date(event.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  // ── Coupons tab ─────────────────────────────────────────────────────────────

  const isFormValid =
    (newCoupon.discountType === "percent" && !!newCoupon.percentOff) ||
    (newCoupon.discountType === "fixed" && !!newCoupon.amountOff);

  const couponsTab = (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            {coupons.length} coupon{coupons.length !== 1 ? "s" : ""}
          </span>
        </div>
        {canWrite && (
          <Button
            size="sm"
            onClick={() => {
              setCouponForm((v) => !v);
              setCouponFeedback(null);
            }}
          >
            <Plus className="size-3.5 mr-1.5" />
            {t("coupons.create")}
          </Button>
        )}
      </div>

      {/* Create form */}
      {couponForm && canWrite && (
        <Card className="gap-0 py-0 border-primary/20">
          <CardContent className="px-5 py-5 flex flex-col gap-5">
            {/* Section: Discount */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("coupons.form.sectionDiscount")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t("coupons.form.name")}</Label>
                  <Input
                    value={newCoupon.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder={t("coupons.form.namePlaceholder")}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">
                    {t("coupons.form.discountType")}
                  </Label>
                  <Select
                    value={newCoupon.discountType}
                    onValueChange={(v) =>
                      set("discountType", v as "percent" | "fixed")
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">
                        {t("coupons.form.discountTypePercent")}
                      </SelectItem>
                      <SelectItem value="fixed">
                        {t("coupons.form.discountTypeFixed")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newCoupon.discountType === "percent" ? (
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">
                      {t("coupons.form.percentOff")}{" "}
                      <span className="text-error-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={newCoupon.percentOff}
                        onChange={(e) => set("percentOff", e.target.value)}
                        placeholder="25"
                        className="h-8 text-sm pr-6"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">
                        {t("coupons.form.amountOff")}{" "}
                        <span className="text-error-500">*</span>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          $
                        </span>
                        <Input
                          type="number"
                          min={0.01}
                          step={0.01}
                          value={newCoupon.amountOff}
                          onChange={(e) => set("amountOff", e.target.value)}
                          placeholder="10.00"
                          className="h-8 text-sm pl-6"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">
                        {t("coupons.form.currency")}
                      </Label>
                      <Select
                        value={newCoupon.currency}
                        onValueChange={(v) => set("currency", v)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="usd">USD</SelectItem>
                          <SelectItem value="eur">EUR</SelectItem>
                          <SelectItem value="gbp">GBP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
            </div>

            <Separator />

            {/* Section: Duration */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("coupons.form.sectionDuration")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">
                    {t("coupons.form.duration")}
                  </Label>
                  <Select
                    value={newCoupon.duration}
                    onValueChange={(v) =>
                      set("duration", v as "once" | "repeating" | "forever")
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">
                        {t("coupons.duration.once")}
                      </SelectItem>
                      <SelectItem value="repeating">
                        {t("coupons.duration.repeating")}
                      </SelectItem>
                      <SelectItem value="forever">
                        {t("coupons.duration.forever")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newCoupon.duration === "repeating" && (
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">
                      {t("coupons.form.durationMonths")}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={newCoupon.durationInMonths}
                      onChange={(e) => set("durationInMonths", e.target.value)}
                      placeholder="3"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">
                    {t("coupons.form.maxRedemptions")}
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={newCoupon.maxRedemptions}
                    onChange={(e) => set("maxRedemptions", e.target.value)}
                    placeholder="∞"
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {t("coupons.form.maxRedemptionsHint")}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">
                    {t("coupons.form.redeemBy")}
                  </Label>
                  <Input
                    type="date"
                    value={newCoupon.redeemBy}
                    onChange={(e) => set("redeemBy", e.target.value)}
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {t("coupons.form.redeemByHint")}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section: Promo code + restrictions */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("coupons.form.sectionPromoCode")}
              </p>
              <div className="flex flex-col gap-0">
                {/* Custom code */}
                <div className="flex flex-col">
                  <label className="flex items-center gap-2.5 py-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newCoupon.hasPromoCode}
                      onChange={(e) => {
                        set("hasPromoCode", e.target.checked);
                        if (!e.target.checked) set("promoCode", "");
                      }}
                      className="size-3.5 rounded accent-primary"
                    />
                    <span className="text-sm">
                      {t("coupons.form.promoCode")}
                    </span>
                  </label>
                  {newCoupon.hasPromoCode && (
                    <div className="ml-6 mb-2 flex flex-col gap-1">
                      <Input
                        value={newCoupon.promoCode}
                        onChange={(e) =>
                          set("promoCode", e.target.value.toUpperCase())
                        }
                        placeholder={t("coupons.form.promoCodePlaceholder")}
                        className="h-8 text-sm font-mono max-w-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {t("coupons.form.promoCodeHint")}
                      </p>
                    </div>
                  )}
                </div>

                <Separator className="my-0.5" />

                {/* First time only */}
                <label className="flex items-center gap-2.5 py-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newCoupon.firstTimeOnly}
                    onChange={(e) => set("firstTimeOnly", e.target.checked)}
                    className="size-3.5 rounded accent-primary"
                  />
                  <span className="text-sm">
                    {t("coupons.form.firstTimeOnly")}
                  </span>
                </label>

                <Separator className="my-0.5" />

                {/* Restrict to customer */}
                <div className="flex flex-col">
                  <label className="flex items-center gap-2.5 py-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newCoupon.hasRestrictToCustomer}
                      onChange={(e) => {
                        set("hasRestrictToCustomer", e.target.checked);
                        if (!e.target.checked) set("restrictToCustomer", "");
                      }}
                      className="size-3.5 rounded accent-primary"
                    />
                    <span className="text-sm">
                      {t("coupons.form.restrictToCustomer")}
                    </span>
                  </label>
                  {newCoupon.hasRestrictToCustomer && (
                    <div className="ml-6 mb-2 flex flex-col gap-1">
                      <Input
                        value={newCoupon.restrictToCustomer}
                        onChange={(e) =>
                          set("restrictToCustomer", e.target.value)
                        }
                        placeholder={t(
                          "coupons.form.restrictToCustomerPlaceholder",
                        )}
                        className="h-8 text-sm font-mono max-w-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {t("coupons.form.restrictToCustomerHint")}
                      </p>
                    </div>
                  )}
                </div>

                <Separator className="my-0.5" />

                {/* Max redemptions (promo code level) */}
                <div className="flex flex-col">
                  <label className="flex items-center gap-2.5 py-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newCoupon.hasPromoMaxRedemptions}
                      onChange={(e) => {
                        set("hasPromoMaxRedemptions", e.target.checked);
                        if (!e.target.checked) set("promoMaxRedemptions", "");
                      }}
                      className="size-3.5 rounded accent-primary"
                    />
                    <span className="text-sm">
                      {t("coupons.form.promoMaxRedemptions")}
                    </span>
                  </label>
                  {newCoupon.hasPromoMaxRedemptions && (
                    <div className="ml-6 mb-2 flex flex-col gap-1">
                      <Input
                        type="number"
                        min={1}
                        value={newCoupon.promoMaxRedemptions}
                        onChange={(e) =>
                          set("promoMaxRedemptions", e.target.value)
                        }
                        placeholder="100"
                        className="h-8 text-sm max-w-[120px]"
                      />
                    </div>
                  )}
                </div>

                <Separator className="my-0.5" />

                {/* Expiry date (promo code level) */}
                <div className="flex flex-col">
                  <label className="flex items-center gap-2.5 py-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newCoupon.hasPromoExpiresAt}
                      onChange={(e) => {
                        set("hasPromoExpiresAt", e.target.checked);
                        if (!e.target.checked) set("promoExpiresAt", "");
                      }}
                      className="size-3.5 rounded accent-primary"
                    />
                    <span className="text-sm">
                      {t("coupons.form.promoExpiresAt")}
                    </span>
                  </label>
                  {newCoupon.hasPromoExpiresAt && (
                    <div className="ml-6 mb-2 flex flex-col gap-1">
                      <Input
                        type="date"
                        value={newCoupon.promoExpiresAt}
                        onChange={(e) => set("promoExpiresAt", e.target.value)}
                        className="h-8 text-sm max-w-[180px]"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {t("coupons.form.promoExpiresAtHint")}
                      </p>
                    </div>
                  )}
                </div>

                <Separator className="my-0.5" />

                {/* Minimum order amount */}
                <div className="flex flex-col">
                  <label className="flex items-center gap-2.5 py-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newCoupon.hasMinimumAmount}
                      onChange={(e) => {
                        set("hasMinimumAmount", e.target.checked);
                        if (!e.target.checked) set("minimumAmount", "");
                      }}
                      className="size-3.5 rounded accent-primary"
                    />
                    <span className="text-sm">
                      {t("coupons.form.minimumAmount")}
                    </span>
                  </label>
                  {newCoupon.hasMinimumAmount && (
                    <div className="ml-6 mb-2 flex flex-col gap-1">
                      <div className="relative max-w-[160px]">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          $
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={newCoupon.minimumAmount}
                          onChange={(e) => set("minimumAmount", e.target.value)}
                          placeholder="0.00"
                          className="h-8 text-sm pl-6"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {couponFeedback && (
              <p className="text-xs text-error-600 dark:text-error-400">
                {couponFeedback}
              </p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCouponForm(false);
                  setCouponFeedback(null);
                  setNewCoupon(EMPTY_COUPON);
                }}
              >
                {t("coupons.form.cancel")}
              </Button>
              <Button size="sm" onClick={createCoupon} disabled={!isFormValid}>
                {t("coupons.form.submit")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {coupons.length === 0 && (
        <div className="rounded-lg border border-border flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <Tag className="size-8 opacity-20" />
          <p className="text-sm">{t("coupons.empty")}</p>
        </div>
      )}

      {/* Mobile: card list (< md) */}
      {coupons.length > 0 && (
        <div className="flex flex-col gap-2 md:hidden">
          {coupons.map((c) => {
            const isExpired = c.redeemBy ? c.redeemBy * 1000 < now : false;
            const displayCode = c.promoCode ?? c.id;
            const discount =
              c.percentOff != null
                ? `${c.percentOff}% off`
                : c.amountOff != null
                  ? `$${(c.amountOff / 100).toFixed(2)} off`
                  : "—";
            const durationLabel =
              c.duration === "repeating" && c.durationInMonths
                ? `${c.durationInMonths} months`
                : c.duration === "once"
                  ? "First invoice"
                  : "Forever";
            return (
              <div
                key={c.id}
                className={`rounded-lg border border-border bg-card p-4 flex flex-col gap-3 ${!c.valid || isExpired ? "opacity-50" : ""}`}
              >
                {/* Top: code + status + delete */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-semibold tracking-wider truncate">
                        {displayCode}
                      </span>
                      <button
                        onClick={() => copyCode(displayCode)}
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Copy code"
                      >
                        {copiedCode === displayCode ? (
                          <Check className="size-3.5 text-secondary-500" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    </div>
                    {c.name && (
                      <span className="text-xs text-muted-foreground">
                        {c.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="outline"
                      className={
                        c.valid && !isExpired
                          ? "text-[10px] h-5 px-1.5 bg-secondary-500/10 text-secondary-700 border-secondary-500/25 dark:text-secondary-400"
                          : "text-[10px] h-5 px-1.5 text-muted-foreground"
                      }
                    >
                      {c.valid && !isExpired
                        ? t("coupons.badge.active")
                        : t("coupons.badge.expired")}
                    </Badge>
                    {canWrite && (
                      <button
                        onClick={() => deleteCoupon(c.id, c.promoCodeId)}
                        className="text-muted-foreground hover:text-error-600 transition-colors"
                        aria-label={t("coupons.delete")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {/* Detail grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <p className="text-muted-foreground mb-0.5">
                      {t("coupons.table.discount")}
                    </p>
                    <p className="font-semibold tabular-nums">{discount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-0.5">
                      {t("coupons.table.duration")}
                    </p>
                    <p>{durationLabel}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-0.5">
                      {t("coupons.table.redeemed")}
                    </p>
                    <p className="tabular-nums">
                      {c.timesRedeemed}
                      {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-0.5">
                      {t("coupons.table.expiry")}
                    </p>
                    <p className="tabular-nums">
                      {c.redeemBy
                        ? new Date(c.redeemBy * 1000).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>
                </div>
                {(c.firstTimeOnly ||
                  (c.minimumAmount != null && c.minimumAmount > 0)) && (
                  <div className="flex flex-wrap gap-1">
                    {c.firstTimeOnly && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1 bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-400"
                      >
                        {t("coupons.badge.firstTime")}
                      </Badge>
                    )}
                    {c.minimumAmount != null && c.minimumAmount > 0 && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {t("coupons.badge.minAmount")} $
                        {(c.minimumAmount / 100).toFixed(0)}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Desktop: scrollable table (>= md) */}
      {coupons.length > 0 && (
        <div className="hidden md:block rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="whitespace-nowrap">
                  {t("coupons.table.code")}
                </TableHead>
                <TableHead className="whitespace-nowrap">
                  {t("coupons.table.discount")}
                </TableHead>
                <TableHead className="whitespace-nowrap">
                  {t("coupons.table.duration")}
                </TableHead>
                <TableHead className="whitespace-nowrap">
                  {t("coupons.table.restrictions")}
                </TableHead>
                <TableHead className="whitespace-nowrap">
                  {t("coupons.table.redeemed")}
                </TableHead>
                <TableHead className="whitespace-nowrap">
                  {t("coupons.table.expiry")}
                </TableHead>
                <TableHead className="whitespace-nowrap">
                  {t("coupons.table.valid")}
                </TableHead>
                {canWrite && <TableHead className="w-8" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((c) => {
                const isExpired = c.redeemBy ? c.redeemBy * 1000 < now : false;
                const displayCode = c.promoCode ?? c.id;
                return (
                  <TableRow
                    key={c.id}
                    className={!c.valid || isExpired ? "opacity-50" : ""}
                  >
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold tracking-wider whitespace-nowrap">
                            {displayCode}
                          </span>
                          <button
                            onClick={() => copyCode(displayCode)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Copy code"
                          >
                            {copiedCode === displayCode ? (
                              <Check className="size-3 text-secondary-500" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                        {c.name && (
                          <span className="text-[11px] text-muted-foreground">
                            {c.name}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                        {c.percentOff != null
                          ? `${c.percentOff}% off`
                          : c.amountOff != null
                            ? `$${(c.amountOff / 100).toFixed(2)} off`
                            : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {c.duration === "repeating" && c.durationInMonths
                        ? `${c.durationInMonths} months`
                        : c.duration === "once"
                          ? "First invoice"
                          : "Forever"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.firstTimeOnly && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1 bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-400 whitespace-nowrap"
                          >
                            {t("coupons.badge.firstTime")}
                          </Badge>
                        )}
                        {c.minimumAmount != null && c.minimumAmount > 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1 whitespace-nowrap"
                          >
                            {t("coupons.badge.minAmount")} $
                            {(c.minimumAmount / 100).toFixed(0)}
                          </Badge>
                        )}
                        {!c.firstTimeOnly &&
                          (c.minimumAmount == null ||
                            c.minimumAmount === 0) && (
                            <span className="text-[11px] text-muted-foreground">
                              —
                            </span>
                          )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                      {c.timesRedeemed}
                      {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                      {c.redeemBy
                        ? new Date(c.redeemBy * 1000).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          c.valid && !isExpired
                            ? "text-[10px] h-5 px-1.5 bg-secondary-500/10 text-secondary-700 border-secondary-500/25 dark:text-secondary-400"
                            : "text-[10px] h-5 px-1.5 text-muted-foreground"
                        }
                      >
                        {c.valid && !isExpired
                          ? t("coupons.badge.active")
                          : t("coupons.badge.expired")}
                      </Badge>
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <button
                          onClick={() => deleteCoupon(c.id, c.promoCodeId)}
                          className="text-muted-foreground hover:text-error-600 transition-colors"
                          aria-label={t("coupons.delete")}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>
      <Tabs
        defaultValue="overview"
        onValueChange={(v) => {
          if (v === "coupons") void loadCoupons();
        }}
      >
        <TabsList className="mb-2">
          <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
          <TabsTrigger value="subscriptions">
            {t("tabs.subscriptions")}
          </TabsTrigger>
          <TabsTrigger value="events">{t("tabs.events")}</TabsTrigger>
          <TabsTrigger value="coupons">{t("tabs.coupons")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">{overviewTab}</TabsContent>
        <TabsContent value="subscriptions">{subsTab}</TabsContent>
        <TabsContent value="events">{eventsTab}</TabsContent>
        <TabsContent value="coupons">{couponsTab}</TabsContent>
      </Tabs>
    </div>
  );
}
