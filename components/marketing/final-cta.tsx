"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { ArrowRight } from "lucide-react";
import { PRODUCT } from "@/config/product";

export function FinalCta() {
  const t = useTranslations("home.finalCta");

  return (
    <section className="py-24 px-4 bg-primary/5 border-t border-border">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
          {t("headline")}
        </h2>
        <p className="text-muted-foreground mb-10">
          {t("description", { setupTime: PRODUCT.metrics.setupTime })}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          <Button variant="cta-primary" size="lg" asChild>
            <Link href="/sign-up">
              {t("ctaPrimary")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button variant="cta-secondary" size="lg" asChild>
            <Link href="/contact">{t("ctaSecondary")}</Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{t("trust")}</p>
      </div>
    </section>
  );
}
