"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pricing } from "@/components/marketing/pricing";

type AddonItem = { model: string; description: string; segment: string };
type FaqItem = { q: string; a: string };

export default function PricingPage() {
  const t = useTranslations("pricing");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const addons = t.raw("addons.items") as AddonItem[];
  const philosophyPoints = t.raw("philosophy.points") as string[];
  const faqItems = t.raw("faq.items") as FaqItem[];

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-16 px-4">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[400px] w-[700px] rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="max-w-2xl mx-auto text-center">
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
          <p className="text-lg text-muted-foreground mb-4 leading-relaxed">
            {t("hero.description")}
          </p>
          <p className="text-xs text-muted-foreground/60">{t("hero.trust")}</p>
        </div>
      </section>

      {/* ── Plans — reuses the shared Pricing component (reads home.pricing) */}
      <Pricing />

      {/* ── Billing philosophy ───────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
              {t("philosophy.label")}
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              {t("philosophy.headline")}
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("philosophy.description")}
            </p>
          </div>
          <ul className="space-y-3">
            {philosophyPoints.map((point, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm text-foreground/80"
              >
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary-500/10 text-secondary-500 text-[10px] font-bold">
                  {i + 1}
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Add-ons table ────────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-muted/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
              {t("addons.label")}
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
              {t("addons.headline")}
            </h2>
            <p className="text-muted-foreground">{t("addons.description")}</p>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-3 font-semibold text-foreground">
                    {t("addons.colModel")}
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-foreground hidden sm:table-cell">
                    {t("addons.colDescription")}
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-foreground">
                    {t("addons.colSegment")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {addons.map((addon, i) => (
                  <tr
                    key={i}
                    className={cn(
                      "border-b border-border last:border-0",
                      i % 2 === 0 ? "bg-card" : "bg-muted/20",
                    )}
                  >
                    <td className="px-5 py-3.5 font-medium text-foreground">
                      {addon.model}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground hidden sm:table-cell">
                      {addon.description}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-block rounded-full bg-primary/8 text-primary text-xs font-medium px-2.5 py-0.5">
                        {addon.segment}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
              {t("faq.label")}
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              {t("faq.headline")}
            </h2>
          </div>

          <div className="space-y-2">
            {faqItems.map((item, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
                  aria-expanded={openFaq === i}
                >
                  <span>{item.q}</span>
                  <span
                    className={cn(
                      "ml-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      openFaq === i ? "rotate-45" : "",
                    )}
                    aria-hidden
                  >
                    +
                  </span>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-muted/20">
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
              <Link href="/contact">{t("cta.ctaSecondary")}</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground/60">{t("cta.trust")}</p>
        </div>
      </section>
    </main>
  );
}
