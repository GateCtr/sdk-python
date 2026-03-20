"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type BillingInterval = "monthly" | "annual";

interface BillingIntervalToggleProps {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
}

export function BillingIntervalToggle({
  value,
  onChange,
}: BillingIntervalToggleProps) {
  const t = useTranslations("billing.plan.interval");

  return (
    <div className="inline-flex w-full items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:w-auto">
      <button
        onClick={() => onChange("monthly")}
        className={cn(
          "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:px-4",
          value === "monthly"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t("monthly")}
      </button>
      <button
        onClick={() => onChange("annual")}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:px-4",
          value === "annual"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t("annual")}
        <Badge variant="secondary" className="hidden text-xs sm:inline-flex">
          {t("saveBadge")}
        </Badge>
      </button>
    </div>
  );
}
