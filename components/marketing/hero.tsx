"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { ArrowRight, Zap } from "lucide-react";
import { PRODUCT } from "@/config/product";
import { CodeSnippet } from "@/components/ui/code-snippet";

export function Hero() {
  const t = useTranslations("home.hero");

  const tabs = [
    {
      label: t("codeTabBefore"),
      language: "ts" as const,
      code: `const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // baseURL: "https://api.openai.com/v1"
});`,
    },
    {
      label: t("codeTabAfter"),
      language: "ts" as const,
      highlightLines: [2, 3],
      code: `const openai = new OpenAI({
  apiKey: process.env.GATECTR_API_KEY,  // ← your providers stay in the dashboard
  baseURL: "${PRODUCT.api.baseUrl}",    // ← only endpoint change
});`,
      callout: t("codeCallout", {
        tokenReduction: PRODUCT.metrics.tokenReduction,
      }),
      calloutVariant: "success" as const,
    },
  ];

  return (
    <section className="relative overflow-hidden pt-16 pb-20 px-4">
      {/* Background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute left-1/2 top-24 -translate-x-1/2 h-[250px] w-[400px] rounded-full bg-secondary/4 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs font-mono text-muted-foreground mb-6 backdrop-blur-sm">
          <Zap
            className="size-3 text-secondary-500 fill-secondary-500"
            aria-hidden
          />
          {t("badge")}
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground mb-5 leading-[1.08] max-w-3xl">
          {t("headline")}{" "}
          <span className="bg-linear-to-r from-primary to-secondary-500 bg-clip-text text-transparent">
            {t("headlineSub")}
          </span>
        </h1>

        <p className="text-lg text-muted-foreground mb-8 max-w-xl leading-relaxed">
          {t("description")}
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
          <Button variant="cta-primary" size="lg" asChild>
            <Link href="/sign-up">
              {t("ctaPrimary")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button variant="cta-secondary" size="lg" asChild>
            <Link href="/#how-it-works">{t("ctaSecondary")}</Link>
          </Button>
        </div>

        {/* Trust line */}
        <p className="text-xs text-muted-foreground/60 mb-8">{t("trust")}</p>

        {/* Stats */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-12">
          {[
            t("statsTokens", {
              tokenReduction: PRODUCT.metrics.tokenReduction,
            }),
            t("statsSetup", { setupTime: PRODUCT.metrics.setupTime }),
            t("statsLatency", { latency: PRODUCT.metrics.latency }),
          ].map((stat, i) => (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && (
                <span
                  aria-hidden
                  className="hidden sm:block w-px h-3 bg-border"
                />
              )}
              <span className="text-sm font-semibold text-foreground">
                {stat}
              </span>
            </div>
          ))}
        </div>

        {/* Code snippet — full width below copy */}
        <div className="w-full max-w-2xl">
          <CodeSnippet
            tabs={tabs}
            filename="openai.ts"
            defaultTab={1}
            showLineNumbers
            chrome
          />
        </div>
      </div>
    </section>
  );
}
