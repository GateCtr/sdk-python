"use client";

import { useTranslations } from "next-intl";
import { PRODUCT } from "@/config/product";
import { interpolate } from "@/lib/interpolate";

const STEP_VARS = { tokenReduction: PRODUCT.metrics.tokenReduction };

export function HowItWorks() {
  const t = useTranslations("home.howItWorks");
  const rawSteps = t.raw("steps") as Array<{
    step: string;
    title: string;
    description: string;
  }>;
  const steps = rawSteps.map((s) => ({
    ...s,
    description: interpolate(s.description, STEP_VARS),
  }));

  return (
    <section id="how-it-works" className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
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

        <div className="relative">
          {/* Connector line */}
          <div
            aria-hidden
            className="absolute left-8 top-10 bottom-10 w-px bg-border hidden md:block"
          />

          <div className="flex flex-col gap-8">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className="relative z-10 shrink-0 w-16 h-16 rounded-full border-2 border-primary/30 bg-background flex items-center justify-center">
                  <span className="text-sm font-mono font-bold text-primary">
                    {step.step}
                  </span>
                </div>
                <div className="pt-3">
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
