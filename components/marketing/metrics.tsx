"use client";

import { useTranslations } from "next-intl";
import { PRODUCT } from "@/config/product";
import { interpolate } from "@/lib/interpolate";

const METRIC_VARS = {
  tokenReduction: PRODUCT.metrics.tokenReduction,
  latency: PRODUCT.metrics.latency,
  setupTime: PRODUCT.metrics.setupTime,
  providers: PRODUCT.metrics.providers,
};

export function Metrics() {
  const t = useTranslations("home.metrics");
  const rawItems = t.raw("items") as Array<{
    value: string;
    label: string;
    description: string;
  }>;
  const items = rawItems.map((item) => ({
    value: interpolate(item.value, METRIC_VARS),
    label: item.label,
    description: item.description,
  }));

  return (
    <section className="py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
            {t("label")}
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            {t("headline")}
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map((item, i) => (
            <div key={i} className="text-center">
              <p className="text-4xl md:text-5xl font-extrabold text-primary font-mono mb-1">
                {item.value}
              </p>
              <p className="text-sm font-semibold text-foreground mb-0.5">
                {item.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
