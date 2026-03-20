"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface SeatUsageProps {
  currentMembers: number;
  includedSeats: number;
  additionalSeats: number;
  additionalCostEur: number;
}

export function SeatUsage({
  currentMembers,
  includedSeats,
  additionalSeats,
  additionalCostEur,
}: SeatUsageProps) {
  const t = useTranslations("billing.seats");
  const pct = Math.min(Math.round((currentMembers / includedSeats) * 100), 100);
  const isWarning = pct >= 80;

  return (
    <Card className="gap-0 py-0">
      <CardContent className="px-6 py-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {t("title")}
            </span>
          </div>
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              isWarning ? "text-warning-500" : "text-foreground",
            )}
          >
            {currentMembers} / {includedSeats}
          </span>
        </div>

        <Progress
          value={pct}
          className={cn("h-1.5", isWarning && "[&>div]:bg-warning-500")}
        />

        {additionalSeats > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("additional", {
              count: additionalSeats,
              cost: additionalCostEur,
            })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("included")}</p>
        )}
      </CardContent>
    </Card>
  );
}
