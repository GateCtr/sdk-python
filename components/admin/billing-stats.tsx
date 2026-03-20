import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { PlanType } from "@prisma/client";

interface PlanCount {
  plan: PlanType;
  count: number;
}

interface BillingStatsProps {
  planDistribution: PlanCount[];
  mrr: number;
  churnRate: number;
  activeSubscriptions: number;
}

export function BillingStats({
  planDistribution,
  mrr,
  churnRate,
  activeSubscriptions,
}: BillingStatsProps) {
  const t = useTranslations("adminBilling");

  const statCards = [
    {
      label: t("stats.mrr"),
      value: `€${mrr.toLocaleString("en-US", { minimumFractionDigits: 0 })}`,
    },
    {
      label: t("stats.activeSubscriptions"),
      value: activeSubscriptions.toLocaleString(),
    },
    {
      label: t("stats.churnRate"),
      value: `${churnRate.toFixed(1)}%`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {statCards.map((card) => (
          <Card key={card.label} className="gap-0 py-0">
            <CardHeader className="px-5 pt-5 pb-1">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan distribution */}
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("stats.planDistribution")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-3">
          {planDistribution.map(({ plan, count }) => {
            const pct =
              activeSubscriptions > 0
                ? Math.round((count / activeSubscriptions) * 100)
                : 0;
            return (
              <div key={plan} className="flex items-center gap-4">
                <span className="w-24 shrink-0 text-sm font-medium text-foreground">
                  {t(`plans.${plan}`)}
                </span>
                <Progress value={pct} className="h-2 flex-1" />
                <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {count}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
