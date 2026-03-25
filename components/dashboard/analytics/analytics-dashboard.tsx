"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { useTranslations } from "next-intl";
import {
  TrendingUp,
  TrendingDown,
  Zap,
  DollarSign,
  Activity,
  Lock,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BudgetProgressBar } from "./budget-progress-bar";
import {
  DateRangePicker,
  presetToRange,
  type DateRangePreset,
} from "./date-range-picker";
import { MultiTrendChart } from "./multi-trend-chart";
import { ModelBreakdownTable } from "./model-breakdown-table";
import { ProviderBreakdownChart } from "./provider-breakdown-chart";
import { ProjectFilter } from "./project-filter";
import { UpsellPrompt } from "./upsell-prompt";
import { downloadCsv } from "@/lib/export-csv";

// ── Zustand store ─────────────────────────────────────────────────────────────
interface DateRangeState {
  preset: DateRangePreset;
  from: string;
  to: string;
  setRange: (preset: DateRangePreset, from: string, to: string) => void;
}

const useDateRangeStore = create<DateRangeState>((set) => {
  const initial = presetToRange("this_month");
  return {
    preset: "this_month",
    from: initial.from,
    to: initial.to,
    setRange: (preset, from, to) => set({ preset, from, to }),
  };
});

// ── Types ─────────────────────────────────────────────────────────────────────
interface UsageResponse {
  totalTokens: number;
  totalRequests: number;
  totalCostUsd: number;
  savedTokens: number;
  byModel?: Array<{
    model: string;
    provider: string;
    totalTokens: number;
    totalRequests: number;
    totalCostUsd: number;
    savedTokens: number;
  }>;
  byProvider?: Array<{
    provider: string;
    totalTokens: number;
    totalRequests: number;
    totalCostUsd: number;
  }>;
  budgetStatus?: {
    maxTokensPerMonth: number | null;
    tokensPct: number;
    alertThresholdPct: number;
  };
}

interface TrendsResponse {
  trends: Array<{
    date: string;
    totalTokens: number;
    totalRequests: number;
    totalCostUsd: number;
    savedTokens: number;
  }>;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  delta?: number;
  accent?: boolean;
  loading?: boolean;
}

function KpiCard({ label, value, icon, delta, accent, loading }: KpiCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-lg border bg-card px-4 py-3 flex flex-col gap-1.5 overflow-hidden transition-shadow hover:shadow-sm",
        accent && "border-primary/30 bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <span
          className={cn(
            "p-1 rounded-md",
            accent
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </span>
      </div>
      {loading ? (
        <div className="h-5 w-20 rounded bg-muted animate-pulse" />
      ) : (
        <span className="text-2xl font-bold tabular-nums tracking-tight leading-none">
          {value}
        </span>
      )}
      {delta !== undefined && !loading && (
        <div
          className={cn(
            "flex items-center gap-1 text-[11px] font-medium",
            delta >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-500",
          )}
        >
          {delta >= 0 ? (
            <TrendingUp className="size-3" />
          ) : (
            <TrendingDown className="size-3" />
          )}
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(1)}% vs last period
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
        <span className="text-sm font-semibold">{title}</span>
        {badge}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ProBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
      <Lock className="size-2.5" />
      {label}
    </span>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
interface AnalyticsDashboardProps {
  hasAdvancedAnalytics: boolean;
}

export function AnalyticsDashboard({
  hasAdvancedAnalytics,
}: AnalyticsDashboardProps) {
  const t = useTranslations("analytics");
  const { preset, from, to, setRange } = useDateRangeStore();
  const [projectId, setProjectId] = useState<string>("all");

  const projectParam = projectId !== "all" ? `&projectId=${projectId}` : "";

  const { data: usage, isLoading } = useQuery<UsageResponse>({
    queryKey: ["usage", from, to, projectId],
    queryFn: async () => {
      if (process.env.NODE_ENV === "development") {
        const { MOCK_USAGE } = await import("@/lib/analytics-mock");
        return MOCK_USAGE as UsageResponse;
      }
      return fetch(`/api/v1/usage?from=${from}&to=${to}${projectParam}`).then(
        (r) => r.json(),
      );
    },
  });

  const { data: trends } = useQuery<TrendsResponse>({
    queryKey: ["usage-trends", from, to, projectId],
    queryFn: async () => {
      if (process.env.NODE_ENV === "development") {
        const { MOCK_TRENDS } = await import("@/lib/analytics-mock");
        return MOCK_TRENDS as TrendsResponse;
      }
      return fetch(
        `/api/v1/usage/trends?from=${from}&to=${to}${projectParam}`,
      ).then((r) => r.json());
    },
    enabled: hasAdvancedAnalytics,
  });

  function handleExport() {
    const prefix = `gatectr-analytics-${from}-${to}`;
    if (trends?.trends?.length) {
      downloadCsv(
        trends.trends.map((r) => ({
          date: r.date,
          tokens: r.totalTokens,
          requests: r.totalRequests,
          cost_usd: r.totalCostUsd,
          saved_tokens: r.savedTokens,
        })),
        `${prefix}-trends.csv`,
      );
    }
    if (usage?.byModel?.length) {
      downloadCsv(
        usage.byModel.map((r) => ({
          model: r.model,
          provider: r.provider,
          tokens: r.totalTokens,
          requests: r.totalRequests,
          cost_usd: r.totalCostUsd,
          saved_tokens: r.savedTokens,
        })),
        `${prefix}-by-model.csv`,
      );
    }
    if (usage?.byProvider?.length) {
      downloadCsv(
        usage.byProvider.map((r) => ({
          provider: r.provider,
          tokens: r.totalTokens,
          requests: r.totalRequests,
          cost_usd: r.totalCostUsd,
        })),
        `${prefix}-by-provider.csv`,
      );
    }
    if (!trends?.trends?.length && !usage?.byModel?.length) {
      downloadCsv(
        [
          {
            from,
            to,
            tokens: usage?.totalTokens ?? 0,
            requests: usage?.totalRequests ?? 0,
            cost_usd: usage?.totalCostUsd ?? 0,
            saved_tokens: usage?.savedTokens ?? 0,
          },
        ],
        `${prefix}-summary.csv`,
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("page.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("page.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ProjectFilter
            value={projectId}
            onChange={setProjectId}
            allLabel={t("filter.allProjects")}
          />
          <DateRangePicker
            value={preset}
            onChange={(p, range) => setRange(p, range.from, range.to)}
            labels={{
              last7: t("dateRange.last7"),
              last30: t("dateRange.last30"),
              thisMonth: t("dateRange.thisMonth"),
              lastMonth: t("dateRange.lastMonth"),
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="h-8 gap-1.5 text-xs"
          >
            <Download className="size-3.5" />
            {t("export.csv")}
          </Button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={t("stats.totalTokens")}
          value={(usage?.totalTokens ?? 0).toLocaleString()}
          icon={<Zap className="size-3.5" />}
          loading={isLoading}
          accent
        />
        <KpiCard
          label={t("stats.totalRequests")}
          value={(usage?.totalRequests ?? 0).toLocaleString()}
          icon={<Activity className="size-3.5" />}
          loading={isLoading}
        />
        <KpiCard
          label={t("stats.totalCost")}
          value={`$${(usage?.totalCostUsd ?? 0).toFixed(4)}`}
          icon={<DollarSign className="size-3.5" />}
          loading={isLoading}
        />
        <KpiCard
          label={t("stats.savedTokens")}
          value={(usage?.savedTokens ?? 0).toLocaleString()}
          icon={<Zap className="size-3.5" />}
          loading={isLoading}
        />
      </div>

      {/* ── Budget ── */}
      {usage?.budgetStatus?.maxTokensPerMonth && (
        <Section title={t("budget.title")}>
          <BudgetProgressBar
            tokensPct={usage.budgetStatus.tokensPct}
            alertThresholdPct={usage.budgetStatus.alertThresholdPct}
            limitReachedLabel={t("budget.limitReached")}
            label={t("budget.label")}
            tokensUsed={Math.round(
              (usage.budgetStatus.tokensPct / 100) *
                (usage.budgetStatus.maxTokensPerMonth ?? 0),
            )}
            tokensLimit={usage.budgetStatus.maxTokensPerMonth ?? undefined}
          />
        </Section>
      )}

      {/* ── Trend chart (full width) ── */}
      <Section
        title={t("trend.title")}
        badge={!hasAdvancedAnalytics ? <ProBadge label="Pro" /> : undefined}
      >
        {hasAdvancedAnalytics ? (
          trends?.trends && trends.trends.length > 0 ? (
            <MultiTrendChart
              data={trends.trends}
              labels={{
                tokens: t("trend.tokens"),
                cost: t("trend.cost"),
                saved: t("trend.saved"),
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground py-10 text-center">
              {t("empty")}
            </p>
          )
        ) : (
          <UpsellPrompt
            title={t("upsell.title")}
            description={t("upsell.description")}
            ctaLabel={t("upsell.cta")}
          />
        )}
      </Section>

      {/* ── Provider + Model side by side on large screens ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title={t("provider.title")}
          badge={!hasAdvancedAnalytics ? <ProBadge label="Pro" /> : undefined}
        >
          {hasAdvancedAnalytics ? (
            usage?.byProvider && usage.byProvider.length > 0 ? (
              <ProviderBreakdownChart
                data={usage.byProvider}
                tokensLabel={t("stats.totalTokens")}
                costLabel={t("stats.totalCost")}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-10 text-center">
                {t("empty")}
              </p>
            )
          ) : (
            <UpsellPrompt
              title={t("upsell.title")}
              description={t("upsell.description")}
              ctaLabel={t("upsell.cta")}
            />
          )}
        </Section>

        <Section
          title={t("breakdown.title")}
          badge={!hasAdvancedAnalytics ? <ProBadge label="Pro" /> : undefined}
        >
          {hasAdvancedAnalytics ? (
            usage?.byModel && usage.byModel.length > 0 ? (
              <ModelBreakdownTable
                data={usage.byModel}
                labels={{
                  model: t("breakdown.model"),
                  provider: t("breakdown.provider"),
                  tokens: t("stats.totalTokens"),
                  requests: t("stats.totalRequests"),
                  cost: t("stats.totalCost"),
                  saved: t("stats.savedTokens"),
                }}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-10 text-center">
                {t("empty")}
              </p>
            )
          ) : (
            <UpsellPrompt
              title={t("upsell.title")}
              description={t("upsell.description")}
              ctaLabel={t("upsell.cta")}
            />
          )}
        </Section>
      </div>
    </div>
  );
}
