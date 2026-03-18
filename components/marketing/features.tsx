"use client";

import { useTranslations } from "next-intl";
import {
  Shield,
  Zap,
  GitBranch,
  BarChart2,
  Webhook,
  Users,
} from "lucide-react";
import { PRODUCT } from "@/config/product";
import { interpolate } from "@/lib/interpolate";

const ICONS = [Shield, Zap, GitBranch, BarChart2, Webhook, Users];

const FEATURE_VARS = {
  tokenReduction: PRODUCT.metrics.tokenReduction,
  auditDays: PRODUCT.metrics.auditRetentionDays,
};

type RawFeature = {
  title: string;
  description: string;
  metric: string;
  detail: string;
};

export function Features() {
  const t = useTranslations("home.features");
  const rawItems = t.raw("items") as RawFeature[];
  const items = rawItems.map((item) => ({
    ...item,
    description: interpolate(item.description, FEATURE_VARS),
  }));

  return (
    <section id="features" className="py-20 px-4 bg-muted/20">
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

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item, i) => {
            const Icon = ICONS[i];
            return (
              <div
                key={i}
                className="group rounded-xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 rounded-lg bg-primary/8 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground border border-border rounded-full px-2 py-0.5">
                    {item.metric}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  {item.title}
                </h3>
                <p className="text-sm font-medium text-secondary-500 mb-2">
                  {item.description}
                </p>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
