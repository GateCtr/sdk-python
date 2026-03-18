"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import {
  ArrowRight,
  Shield,
  Zap,
  GitBranch,
  BarChart3,
  Webhook,
  Users,
} from "lucide-react";
import { CodeSnippet } from "@/components/ui/code-snippet";
import { useState } from "react";

// ─── Icon map ────────────────────────────────────────────────────────────────
const ICONS = {
  budget: Shield,
  optimizer: Zap,
  router: GitBranch,
  analytics: BarChart3,
  webhooks: Webhook,
  rbac: Users,
} as const;

// ─── Plan badge colors ────────────────────────────────────────────────────────
const PLAN_COLORS: Record<string, string> = {
  Free: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Gratuit: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Pro: "bg-primary/10 text-primary",
  Team: "bg-secondary-500/10 text-secondary-500",
};

// ─── Deep-dive tab ids ────────────────────────────────────────────────────────
const DEEP_TABS = [
  "budget",
  "optimizer",
  "router",
  "analytics",
  "webhooks",
] as const;
type DeepTab = (typeof DEEP_TABS)[number];

// ─── Code language map ────────────────────────────────────────────────────────
const CODE_LANG: Record<DeepTab, "bash" | "ts"> = {
  budget: "bash",
  optimizer: "ts",
  router: "ts",
  analytics: "bash",
  webhooks: "ts",
};

export default function FeaturesPage() {
  const t = useTranslations("features");
  const [activeTab, setActiveTab] = useState<DeepTab>("budget");

  const gridItems = t.raw("grid.items") as Array<{
    id: string;
    plan: string;
    title: string;
    tagline: string;
    description: string;
    metric: string;
    metricLabel: string;
  }>;

  const deepData = t.raw(`deep.${activeTab}`) as {
    headline: string;
    description: string;
    points: string[];
    codeLabel: string;
    code: string;
  };

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-16 px-4">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[400px] w-[700px] rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs font-mono text-muted-foreground mb-6 backdrop-blur-sm">
            <Zap
              className="size-3 text-secondary-500 fill-secondary-500"
              aria-hidden
            />
            {t("hero.badge")}
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-5 leading-tight">
            {t("hero.headline")}
          </h1>

          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed">
            {t("hero.description")}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="cta-primary" size="lg" asChild>
              <Link href="/sign-up">
                {t("hero.ctaPrimary")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="cta-secondary" size="lg" asChild>
              <Link href="/docs">{t("hero.ctaSecondary")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Bento grid ───────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
              {t("grid.label")}
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              {t("grid.headline")}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gridItems.map((item, i) => {
              const Icon = ICONS[item.id as keyof typeof ICONS] ?? Shield;
              const planColor =
                PLAN_COLORS[item.plan] ?? "bg-muted text-muted-foreground";
              // First two cards span full width on md to create a featured row
              const featured = i < 2;
              return (
                <div
                  key={item.id}
                  className={`group relative rounded-xl border border-border bg-card p-6 flex flex-col gap-4 hover:border-primary/30 transition-colors ${featured ? "lg:col-span-1" : ""}`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
                        <Icon className="size-4" aria-hidden />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground text-sm">
                          {item.title}
                        </h3>
                        <span
                          className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${planColor}`}
                        >
                          {item.plan}
                        </span>
                      </div>
                    </div>
                    {/* Metric */}
                    <div className="text-right shrink-0">
                      <div className="text-xl font-bold text-foreground tabular-nums">
                        {item.metric}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {item.metricLabel}
                      </div>
                    </div>
                  </div>

                  {/* Tagline */}
                  <p className="text-sm font-medium text-foreground/80">
                    {item.tagline}
                  </p>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                    {item.description}
                  </p>

                  {/* Hover accent line */}
                  <div className="absolute bottom-0 left-6 right-6 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Deep-dive tabs ───────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-muted/20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
              {t("deep.label")}
            </p>
          </div>

          {/* Tab bar */}
          <div
            className="flex flex-wrap justify-center gap-2 mb-10"
            role="tablist"
          >
            {DEEP_TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                }`}
              >
                {t(`deep.tabs.${tab}`)}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Left — copy */}
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-3">
                {deepData.headline}
              </h3>
              <p className="text-muted-foreground leading-relaxed mb-6">
                {deepData.description}
              </p>
              <ul className="space-y-3">
                {deepData.points.map((point, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-sm text-foreground/80"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                      {i + 1}
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — code */}
            <div>
              <CodeSnippet
                tabs={[
                  {
                    label: deepData.codeLabel,
                    language: CODE_LANG[activeTab],
                    code: deepData.code,
                  },
                ]}
                showLineNumbers
                chrome
                allowWrap
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t("cta.headline")}
          </h2>
          <p className="text-muted-foreground mb-8">{t("cta.description")}</p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <Button variant="cta-primary" size="lg" asChild>
              <Link href="/sign-up">
                {t("cta.ctaPrimary")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="cta-secondary" size="lg" asChild>
              <Link href="/#pricing">{t("cta.ctaSecondary")}</Link>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground/60">{t("cta.trust")}</p>
        </div>
      </section>
    </main>
  );
}
