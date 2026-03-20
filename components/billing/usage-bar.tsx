"use client";

import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UsageBarProps {
  label: string;
  current: number;
  limit: number | null;
  unit?: string;
}

export function UsageBar({ label, current, limit, unit }: UsageBarProps) {
  const t = useTranslations("billing.usage");
  const resolvedUnit = unit ?? t("defaultUnit");

  const pct = limit ? Math.min(Math.round((current / limit) * 100), 100) : 0;
  const isUnlimited = limit === null;
  const isWarning = pct >= 80 && pct < 100;
  const isExceeded = pct >= 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {isUnlimited ? (
            <>
              {new Intl.NumberFormat().format(current)} {resolvedUnit} ·{" "}
              {t("unlimited")}
            </>
          ) : (
            <>
              {new Intl.NumberFormat().format(current)} /{" "}
              {new Intl.NumberFormat().format(limit!)} {resolvedUnit}
              <span
                className={cn(
                  "ml-2 font-semibold",
                  isExceeded
                    ? "text-destructive"
                    : isWarning
                      ? "text-warning-500"
                      : "text-muted-foreground",
                )}
              >
                {pct}%
              </span>
            </>
          )}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={pct}
          className={cn(
            "h-2",
            isExceeded
              ? "[&>div]:bg-destructive"
              : isWarning
                ? "[&>div]:bg-warning-500"
                : "",
          )}
        />
      )}
    </div>
  );
}
