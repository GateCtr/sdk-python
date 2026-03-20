"use client";

import { AlertOctagon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Link } from "@/i18n/routing";
import type { PlanType } from "@prisma/client";

interface UpsellModalProps {
  quotaType: string;
  nextPlanLimit: number | null;
  nextPlan: PlanType;
}

export function UpsellModal({
  quotaType,
  nextPlanLimit,
  nextPlan,
}: UpsellModalProps) {
  const t = useTranslations("billing.upsell");

  const label =
    quotaType === "tokens_per_month" ? t("tokensLabel") : t("requestsLabel");
  const limitStr = nextPlanLimit
    ? new Intl.NumberFormat().format(nextPlanLimit)
    : t("unlimited");

  // Non-dismissible — user must upgrade or navigate away
  return (
    <Dialog open modal>
      <DialogContent
        className="max-w-md text-center"
        // Prevent closing via Escape or overlay click — quota is exceeded
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 mx-auto">
            <AlertOctagon className="size-6 text-destructive" />
          </div>
          <DialogTitle className="text-xl">{t("modal.title")}</DialogTitle>
          <DialogDescription>
            {t("modal.description", { label })}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/40 px-4 py-4 my-2">
          <p className="text-xs text-muted-foreground">
            {t("modal.unlocks", { plan: nextPlan })}
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">{limitStr}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>

        <Button variant="cta-accent" size="lg" className="w-full" asChild>
          <Link href="/billing">
            {t("modal.cta", { limit: limitStr, label })}
          </Link>
        </Button>

        <p className="text-xs text-muted-foreground mt-1">
          {t("modal.resetHint")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
