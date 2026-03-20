"use client";

import { useState } from "react";
import { X, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "@/i18n/routing";
import type { PlanType } from "@prisma/client";

interface UpsellBannerProps {
  quotaType: string;
  percentUsed: number;
  currentLimit?: number;
  nextPlanLimit: number | null;
  nextPlan: PlanType;
}

export function UpsellBanner({
  quotaType,
  percentUsed,
  nextPlanLimit,
  nextPlan,
}: UpsellBannerProps) {
  const t = useTranslations("billing.upsell");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || percentUsed >= 100) return null;

  const label =
    quotaType === "tokens_per_month" ? t("tokensLabel") : t("requestsLabel");
  const limitStr = nextPlanLimit
    ? new Intl.NumberFormat().format(nextPlanLimit)
    : t("unlimited");

  return (
    <Alert className="border-warning-500/40 bg-warning-500/10 text-foreground">
      <TrendingUp className="size-4 text-warning-500" />
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <span>
          <span className="font-semibold">
            {percentUsed}% {t("ofLabel")} {label} {t("used")}.
          </span>{" "}
          {t("upgradeHint", { plan: nextPlan, limit: limitStr, label })}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="cta-accent"
            size="sm"
            asChild
            className="flex-1 sm:flex-none"
          >
            <Link href="/billing">{t("cta", { plan: nextPlan })}</Link>
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("dismiss")}
          >
            <X className="size-4" />
          </button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
