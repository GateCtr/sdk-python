"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate } from "@/lib/interpolate";
import { PLAN_VARS, PLAN_PRICES } from "@/lib/plan-vars";

type Plan = {
  name: string;
  price: string;
  description: string;
  features: string[];
};

const CTA_KEYS = ["ctaFree", "ctaPro", "ctaTeam", "ctaEnterprise"] as const;
const POPULAR_INDEX = 1; // Pro

export function Pricing() {
  const t = useTranslations("home.pricing");
  const locale = useLocale() as "en" | "fr";
  const rawPlans = t.raw("plans") as Plan[];

  const plans = rawPlans.map((plan, i) => ({
    ...plan,
    price: PLAN_PRICES[plan.name]?.[locale] ?? plan.price,
    features: plan.features.map((f) =>
      interpolate(f, PLAN_VARS[i] as Record<string, string | number>),
    ),
  }));

  return (
    <section id="pricing" className="py-20 px-4 bg-muted/20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
            {t("label")}
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t("headline")}
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            {t("description")}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
          {plans.map((plan, i) => {
            const isPopular = i === POPULAR_INDEX;
            const isEnterprise = i === plans.length - 1;
            const ctaKey = CTA_KEYS[i];

            return (
              <div
                key={plan.name}
                className={cn(
                  "relative rounded-xl border bg-card p-6 flex flex-col gap-5",
                  isPopular
                    ? "border-primary shadow-md shadow-primary/10 ring-1 ring-primary/20"
                    : "border-border",
                )}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
                      {t("popular")}
                    </span>
                  </div>
                )}

                {/* Header */}
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-1">
                    {plan.name}
                  </p>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-extrabold text-foreground">
                      {plan.price}
                    </span>
                    {!isEnterprise && (
                      <span className="text-sm text-muted-foreground">
                        {t("perMonth")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                </div>

                {/* Features */}
                <ul className="flex flex-col gap-2.5 flex-1">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Check className="size-4 text-secondary-500 mt-0.5 shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  variant={
                    isPopular
                      ? "cta-primary"
                      : isEnterprise
                        ? "cta-secondary"
                        : "cta-secondary"
                  }
                  size="default"
                  className="w-full"
                  asChild
                >
                  <Link href={isEnterprise ? "/contact" : "/sign-up"}>
                    {t(ctaKey)}
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
