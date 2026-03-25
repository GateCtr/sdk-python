"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Loader2,
  AlertCircle,
  ShieldCheck,
  Bell,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { setupBudget } from "../_actions";
import { PLAN_TOKEN_LIMIT } from "@/constants/billing";

interface BudgetStepProps {
  onComplete: () => void;
  onBack: () => void;
  plan?: string;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function getThresholdColor(pct: number): string {
  if (pct >= 90) return "text-destructive";
  if (pct >= 75) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function getThresholdBg(pct: number): string {
  if (pct >= 90) return "bg-destructive/10 border-destructive/30";
  if (pct >= 75)
    return "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800";
  return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800";
}

export function BudgetStep({
  onComplete,
  onBack,
  plan = "Free",
}: BudgetStepProps) {
  const t = useTranslations("onboarding.budget");
  const tNav = useTranslations("onboarding.nav");

  const planLimit = PLAN_TOKEN_LIMIT.FREE ?? 50_000;

  const [monthlyLimit, setMonthlyLimit] = useState(planLimit);
  const [alertThreshold, setAlertThreshold] = useState(80);
  const [hardStop, setHardStop] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);
    const fd = new FormData();
    fd.set("monthlyTokenLimit", String(monthlyLimit));
    fd.set("alertThreshold", String(alertThreshold));
    fd.set("hardStop", String(hardStop));
    const res = await setupBudget(fd);
    setIsSubmitting(false);
    if (res?.error) {
      setError(t("errors.failed"));
      return;
    }
    onComplete();
  }

  const alertAt = Math.round((monthlyLimit * alertThreshold) / 100);

  return (
    <div className="space-y-5">
      {/* Monthly token limit */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">
            {t("monthlyLimit.label")}
          </Label>
          <Badge variant="outline" className="font-mono text-xs">
            {formatTokens(monthlyLimit)} / mo
          </Badge>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
          {/* Big number display */}
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
              {monthlyLimit.toLocaleString()}
            </span>
            <span className="text-sm text-muted-foreground mb-1">
              {t("monthlyLimit.unit")}
            </span>
          </div>

          {/* Visual bar */}
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${(monthlyLimit / planLimit) * 100}%` }}
              />
            </div>
          </div>

          <Slider
            min={1000}
            max={planLimit}
            step={1000}
            value={[monthlyLimit]}
            onValueChange={([v]) => setMonthlyLimit(v)}
            className="mt-1"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1K</span>
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {formatTokens(planLimit)} max
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("monthlyLimit.hint", { plan, limit: planLimit.toLocaleString() })}
        </p>
      </div>

      {/* Alert threshold */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">
            {t("alertThreshold.label", { pct: alertThreshold })}
          </Label>
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              getThresholdColor(alertThreshold),
            )}
          >
            {alertAt.toLocaleString()} tokens
          </span>
        </div>
        <div
          className={cn(
            "rounded-lg border p-4 space-y-3 transition-colors",
            getThresholdBg(alertThreshold),
          )}
        >
          <Slider
            min={50}
            max={95}
            step={5}
            value={[alertThreshold]}
            onValueChange={([v]) => setAlertThreshold(v)}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>50%</span>
            <span
              className={cn(
                "font-bold text-sm",
                getThresholdColor(alertThreshold),
              )}
            >
              {alertThreshold}%
            </span>
            <span>95%</span>
          </div>
        </div>
      </div>

      {/* Hard stop toggle */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setHardStop((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setHardStop((v) => !v)}
        className={cn(
          "w-full flex items-start justify-between gap-4 rounded-lg border p-4 transition-all duration-200 text-left cursor-pointer",
          hardStop
            ? "border-primary/30 bg-primary/5 shadow-sm"
            : "border-border hover:border-primary/20 hover:bg-accent/20",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg shrink-0 transition-colors",
              hardStop ? "bg-primary/10" : "bg-muted",
            )}
          >
            {hardStop ? (
              <ShieldCheck className="h-4.5 w-4.5 text-primary" />
            ) : (
              <Bell className="h-4.5 w-4.5 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              {t("hardStop.label")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("hardStop.hint")}
            </p>
          </div>
        </div>
        <Switch
          checked={hardStop}
          onCheckedChange={setHardStop}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Summary card */}
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
            {t("summary.label")}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-sm font-bold text-foreground">
              {formatTokens(monthlyLimit)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {t("summary.limit")}
            </p>
          </div>
          <div>
            <p
              className={cn(
                "text-sm font-bold",
                getThresholdColor(alertThreshold),
              )}
            >
              {alertThreshold}%
            </p>
            <p className="text-[10px] text-muted-foreground">
              {t("summary.alert")}
            </p>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              {hardStop ? t("summary.block") : t("summary.notify")}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {t("summary.onLimit")}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        variant="cta-primary"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
        onClick={handleSubmit}
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isSubmitting ? t("submitting") : t("submit")}
      </Button>

      <Button
        type="button"
        variant="cta-ghost"
        size="sm"
        className="w-full"
        onClick={onBack}
      >
        {tNav("back")}
      </Button>
    </div>
  );
}
