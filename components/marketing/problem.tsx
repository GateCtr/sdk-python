"use client";

import { useTranslations } from "next-intl";

export function Problem() {
  const t = useTranslations("home.problem");
  const items = t.raw("items") as Array<{
    stat: string;
    label: string;
    description: string;
  }>;

  return (
    <section className="py-20 px-4">
      <div className="max-w-5xl mx-auto">
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

        <div className="grid md:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-6 text-left"
            >
              <p className="text-3xl font-extrabold text-error-500 mb-2 font-mono">
                {item.stat}
              </p>
              <p className="text-sm font-semibold text-foreground mb-1">
                {item.label}
              </p>
              <p className="text-sm text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
