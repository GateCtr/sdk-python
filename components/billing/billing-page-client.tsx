"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Clock,
  Info,
  ArrowUpCircle,
  CreditCard,
  Calendar,
} from "lucide-react";
import { PlanCard } from "@/components/billing/plan-card";
import { UsageBar } from "@/components/billing/usage-bar";
import { InvoiceList } from "@/components/billing/invoice-list";
import { SeatUsage } from "@/components/billing/seat-usage";
import {
  BillingIntervalToggle,
  type BillingInterval,
} from "@/components/billing/billing-interval-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { PlanType } from "@prisma/client";

interface Invoice {
  id: string;
  created: number;
  amount_due: number;
  currency: string;
  status: string | null;
  invoice_pdf: string | null;
}

interface BillingPageClientProps {
  currentPlan: PlanType;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  trialDaysLeft: number | null;
  currentPeriodEndStr: string | null;
  stripePriceId: string | null;
  stripeCustomerId: string | null;
  yearlyPriceIds: string[];
  tokensThisMonth: number;
  requestsToday: number;
  overageTokens: number;
  maxTokensPerMonth: number | null;
  maxRequestsPerDay: number | null;
  teamMemberCount: number | null;
  invoices: Invoice[];
}

const OVERAGE_COST_PER_1K = 0.002;

const PLAN_ORDER: Record<PlanType, number> = {
  FREE: 0,
  PRO: 1,
  TEAM: 2,
  ENTERPRISE: 3,
};

interface PlanDef {
  name: PlanType;
  displayName: string;
  priceMonthly: string;
  priceYearly: string;
  description: string;
  features: string[];
}

function navigateTo(url: string) {
  window.location.assign(url);
}

// ─── Current plan summary card ────────────────────────────────────────────────

function CurrentPlanCard({
  currentPlan,
  allPlans,
  subscriptionStatus,
  cancelAtPeriodEnd,
  trialDaysLeft,
  currentPeriodEndStr,
  stripeCustomerId,
  onManage,
  onUpgrade,
  interval,
}: {
  currentPlan: PlanType;
  allPlans: PlanDef[];
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  trialDaysLeft: number | null;
  currentPeriodEndStr: string | null;
  stripeCustomerId: string | null;
  onManage: () => void;
  onUpgrade: (plan: PlanType) => void;
  interval: BillingInterval;
}) {
  const t = useTranslations("billing");
  const planDef = allPlans.find((p) => p.name === currentPlan);
  const nextPlanDef = allPlans.find(
    (p) => PLAN_ORDER[p.name] === PLAN_ORDER[currentPlan] + 1,
  );

  const isTrialing = subscriptionStatus === "TRIALING";
  const isFree = currentPlan === "FREE";
  const isEnterprise = currentPlan === "ENTERPRISE";

  const periodEndDisplay = currentPeriodEndStr
    ? new Date(currentPeriodEndStr).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const price =
    isFree || isEnterprise
      ? planDef?.priceMonthly
      : interval === "annual"
        ? planDef?.priceYearly
        : planDef?.priceMonthly;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              {t("page.currentPlanTitle")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl">
                {planDef?.displayName ?? currentPlan}
              </CardTitle>
              {isTrialing && trialDaysLeft !== null && (
                <Badge variant="secondary" className="text-xs">
                  <Clock className="size-3 mr-1" />
                  {t("plan.trial.active", { days: trialDaysLeft })}
                </Badge>
              )}
              {cancelAtPeriodEnd && (
                <Badge
                  variant="outline"
                  className="text-xs border-warning-500/50 text-warning-500"
                >
                  {t("plan.cancelNotice", { date: periodEndDisplay ?? "" })}
                </Badge>
              )}
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{price}</p>
          </div>

          {/* Actions */}
          <div className="flex flex-row flex-wrap gap-2 sm:flex-col sm:shrink-0">
            {!isFree && stripeCustomerId && (
              <Button
                variant="cta-secondary"
                size="sm"
                onClick={onManage}
                className="gap-1.5"
              >
                <CreditCard className="size-3.5" />
                {t("plan.manage")}
              </Button>
            )}
            {nextPlanDef && !isEnterprise && (
              <Button
                variant="cta-accent"
                size="sm"
                onClick={() => onUpgrade(nextPlanDef.name)}
                className="gap-1.5"
              >
                <ArrowUpCircle className="size-3.5" />
                {t("page.upgradeNext", { plan: nextPlanDef.displayName })}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {periodEndDisplay && !isFree && (
        <>
          <Separator />
          <CardContent className="px-4 py-3 sm:px-6">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="size-3.5 shrink-0" />
              {cancelAtPeriodEnd
                ? t("page.expiresOn", { date: periodEndDisplay })
                : t("page.renewsOn", { date: periodEndDisplay })}
            </div>
          </CardContent>
        </>
      )}

      {isFree && (
        <>
          <Separator />
          <CardContent className="px-4 py-3 sm:px-6">
            <p className="text-xs text-muted-foreground">
              {t("page.freePlanNote")}
            </p>
          </CardContent>
        </>
      )}
    </Card>
  );
}

// ─── Usage card ───────────────────────────────────────────────────────────────

function UsageCard({
  tokensThisMonth,
  requestsToday,
  overageTokens,
  maxTokensPerMonth,
  maxRequestsPerDay,
}: {
  tokensThisMonth: number;
  requestsToday: number;
  overageTokens: number;
  maxTokensPerMonth: number | null;
  maxRequestsPerDay: number | null;
}) {
  const t = useTranslations("billing");
  const tokenPct = maxTokensPerMonth
    ? Math.min(Math.round((tokensThisMonth / maxTokensPerMonth) * 100), 100)
    : 0;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("usage.title")}
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="px-4 py-4 space-y-4 sm:px-6">
        <UsageBar
          label={t("usage.tokensMonth")}
          current={tokensThisMonth}
          limit={maxTokensPerMonth}
          unit={t("usage.unitTokens")}
        />
        <UsageBar
          label={t("usage.requestsDay")}
          current={requestsToday}
          limit={maxRequestsPerDay}
          unit={t("usage.unitRequests")}
        />
        {overageTokens > 0 && (
          <p
            className={cn(
              "text-xs",
              tokenPct >= 100 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {t("usage.overage", {
              tokens: new Intl.NumberFormat().format(overageTokens),
              cost: ((overageTokens / 1000) * OVERAGE_COST_PER_1K).toFixed(2),
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────────

export function BillingPageClient({
  currentPlan,
  subscriptionStatus,
  cancelAtPeriodEnd,
  trialDaysLeft,
  currentPeriodEndStr,
  stripePriceId,
  stripeCustomerId,
  yearlyPriceIds,
  tokensThisMonth,
  requestsToday,
  overageTokens,
  maxTokensPerMonth,
  maxRequestsPerDay,
  teamMemberCount,
  invoices,
}: BillingPageClientProps) {
  const t = useTranslations("billing");

  const isAnnual = stripePriceId
    ? yearlyPriceIds.includes(stripePriceId)
    : false;
  const [interval, setInterval] = useState<BillingInterval>(
    isAnnual ? "annual" : "monthly",
  );

  const isPastDue = subscriptionStatus === "PAST_DUE";
  const isTrialing = subscriptionStatus === "TRIALING";
  const periodEndDisplay = currentPeriodEndStr
    ? new Date(currentPeriodEndStr).toLocaleDateString()
    : null;

  const handleUpgrade = useCallback(
    async (planName: PlanType) => {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: planName, interval }),
      });
      const data = (await res.json()) as { url?: string };
      if (data.url) navigateTo(data.url);
    },
    [interval],
  );

  const handleManage = useCallback(async () => {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = (await res.json()) as { url?: string };
    if (data.url) navigateTo(data.url);
  }, []);

  // Build plans from translations — single source of truth
  const plans: PlanDef[] = [
    {
      name: "FREE",
      displayName: t("plans.free.name"),
      priceMonthly: t("plans.free.price"),
      priceYearly: t("plans.free.price"),
      description: t("plans.free.description"),
      features: t.raw("plans.free.features") as string[],
    },
    {
      name: "PRO",
      displayName: t("plans.pro.name"),
      priceMonthly: t("plans.pro.priceMonthly"),
      priceYearly: t("plans.pro.priceYearly"),
      description: t("plans.pro.description"),
      features: t.raw("plans.pro.features") as string[],
    },
    {
      name: "TEAM",
      displayName: t("plans.team.name"),
      priceMonthly: t("plans.team.priceMonthly"),
      priceYearly: t("plans.team.priceYearly"),
      description: t("plans.team.description"),
      features: t.raw("plans.team.features") as string[],
    },
    {
      name: "ENTERPRISE",
      displayName: t("plans.enterprise.name"),
      priceMonthly: t("plans.enterprise.price"),
      priceYearly: t("plans.enterprise.price"),
      description: t("plans.enterprise.description"),
      features: t.raw("plans.enterprise.features") as string[],
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Status alerts ─────────────────────────────────────────────────── */}
      {isPastDue && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span>{t("plan.pastDue")}</span>
            <Button
              variant="cta-danger"
              size="sm"
              onClick={handleManage}
              className="shrink-0 self-start sm:self-auto"
            >
              {t("plan.updatePayment")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isTrialing && trialDaysLeft !== null && !isPastDue && (
        <Alert>
          <Clock className="size-4" />
          <AlertDescription>
            <span className="font-semibold">
              {t("plan.trial.active", { days: trialDaysLeft })}
            </span>
            {periodEndDisplay && (
              <> · {t("plan.trial.ends", { date: periodEndDisplay })}</>
            )}
          </AlertDescription>
        </Alert>
      )}

      {cancelAtPeriodEnd && periodEndDisplay && !isPastDue && (
        <Alert className="border-warning-500/40 bg-warning-500/10">
          <Info className="size-4 text-warning-500" />
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span>{t("plan.cancelNotice", { date: periodEndDisplay })}</span>
            <Button
              variant="cta-secondary"
              size="sm"
              onClick={handleManage}
              className="shrink-0 self-start sm:self-auto"
            >
              {t("plan.resumeSubscription")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Top row: current plan + usage ─────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CurrentPlanCard
          currentPlan={currentPlan}
          allPlans={plans}
          subscriptionStatus={subscriptionStatus}
          cancelAtPeriodEnd={cancelAtPeriodEnd}
          trialDaysLeft={trialDaysLeft}
          currentPeriodEndStr={currentPeriodEndStr}
          stripeCustomerId={stripeCustomerId}
          onManage={handleManage}
          onUpgrade={handleUpgrade}
          interval={interval}
        />
        <UsageCard
          tokensThisMonth={tokensThisMonth}
          requestsToday={requestsToday}
          overageTokens={overageTokens}
          maxTokensPerMonth={maxTokensPerMonth}
          maxRequestsPerDay={maxRequestsPerDay}
        />
      </div>

      {/* ── Seats (TEAM only) ──────────────────────────────────────────────── */}
      {teamMemberCount !== null && (
        <SeatUsage
          currentMembers={teamMemberCount}
          includedSeats={3}
          additionalSeats={Math.max(0, teamMemberCount - 3)}
          additionalCostEur={Math.max(0, teamMemberCount - 3) * 15}
        />
      )}

      {/* ── Plans comparison ──────────────────────────────────────────────── */}
      {currentPlan !== "ENTERPRISE" && (
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {t("page.plansTitle")}
            </h2>
            <BillingIntervalToggle value={interval} onChange={setInterval} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {plans
              .filter((plan) => PLAN_ORDER[plan.name] > PLAN_ORDER[currentPlan])
              .map((plan) => {
                const price =
                  plan.name === "ENTERPRISE"
                    ? plan.priceMonthly
                    : interval === "annual"
                      ? plan.priceYearly
                      : plan.priceMonthly;

                return (
                  <PlanCard
                    key={plan.name}
                    name={plan.displayName}
                    price={price}
                    description={plan.description}
                    features={plan.features}
                    isCurrentPlan={false}
                    hasSubscription={!!stripeCustomerId}
                    highlighted={
                      plan.name === "PRO" ||
                      (currentPlan === "PRO" && plan.name === "TEAM")
                    }
                    onUpgrade={() => handleUpgrade(plan.name)}
                    onManage={handleManage}
                  />
                );
              })}
          </div>
        </section>
      )}

      {/* ── Invoices ──────────────────────────────────────────────────────── */}
      {stripeCustomerId && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            {t("invoices.title")}
          </h2>
          <InvoiceList invoices={invoices} />
        </section>
      )}
    </div>
  );
}
