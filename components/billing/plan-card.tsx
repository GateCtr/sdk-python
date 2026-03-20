"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PlanCardProps {
  name: string;
  price: string;
  description: string;
  features: string[];
  isCurrentPlan: boolean;
  hasSubscription?: boolean;
  onUpgrade?: () => Promise<void> | void;
  onManage?: () => void;
  highlighted?: boolean;
}

export function PlanCard({
  name,
  price,
  description,
  features,
  isCurrentPlan,
  hasSubscription = false,
  onUpgrade,
  onManage,
  highlighted = false,
}: PlanCardProps) {
  const t = useTranslations("billing.plan");
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    if (!onUpgrade || loading) return;
    setLoading(true);
    try {
      await onUpgrade();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card
      className={cn(
        "flex flex-col gap-0 py-0",
        highlighted && "border-primary shadow-md",
        isCurrentPlan && "ring-2 ring-primary ring-offset-2",
      )}
    >
      <CardHeader className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{name}</CardTitle>
          {isCurrentPlan && (
            <Badge variant="secondary" className="text-xs">
              {t("current")}
            </Badge>
          )}
          {highlighted && !isCurrentPlan && (
            <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
              Popular
            </Badge>
          )}
        </div>
        <p className="text-2xl font-bold text-foreground">{price}</p>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>

      {/* Fixed-height feature list so cards align in grid */}
      <CardContent className="flex-1 px-5 pb-4">
        <ul className="space-y-1.5">
          {features.map((f) => (
            <li
              key={f}
              className="flex items-start gap-2 text-xs text-muted-foreground"
            >
              <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="px-5 pb-5">
        {isCurrentPlan ? (
          hasSubscription ? (
            <Button
              variant="cta-secondary"
              onClick={onManage}
              className="w-full"
              size="sm"
            >
              {t("manage")}
            </Button>
          ) : (
            <Button
              variant="cta-secondary"
              disabled
              className="w-full"
              size="sm"
            >
              {t("current")}
            </Button>
          )
        ) : (
          <Button
            variant="cta-accent"
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full"
            size="sm"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              t("upgrade", { plan: name })
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
