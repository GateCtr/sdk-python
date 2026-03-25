import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { ArrowRight, MapPin, Clock, Briefcase } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "careers" });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    robots: { index: true, follow: true },
  };
}

export default async function CareersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "careers" });

  const perks = t.raw("why.items") as Array<{ title: string; body: string }>;
  const openings = t.raw("openings.jobs") as Array<{
    title: string;
    team: string;
    location: string;
    type: string;
  }>;

  return (
    <main className="w-full">
      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-16 px-4">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[400px] w-[700px] rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs font-mono text-muted-foreground mb-6 backdrop-blur-sm">
            <Briefcase className="size-3 text-secondary-500" aria-hidden />
            {t("hero.badge")}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-5 leading-tight">
            {t("hero.headline")}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-8">
            {t("hero.description")}
          </p>
          <a href="#openings">
            <Button variant="cta-primary" size="lg">
              {t("hero.cta")}
              <ArrowRight className="size-4" />
            </Button>
          </a>
        </div>
      </section>

      {/* Why GateCtr */}
      <section className="py-20 px-4 bg-muted/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
              {t("why.label")}
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
              {t("why.headline")}
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              {t("why.description")}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {perks.map((perk, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-5 flex gap-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                  {i + 1}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    {perk.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {perk.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open positions */}
      <section id="openings" className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
              {t("openings.label")}
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              {t("openings.headline")}
            </h2>
          </div>

          {openings.length > 0 ? (
            <div className="space-y-3">
              {openings.map((job, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {job.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Briefcase className="size-3" />
                        {job.team}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" />
                        {job.location}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {job.type}
                      </span>
                    </div>
                  </div>
                  <a
                    href={`mailto:careers@gatectr.com?subject=${encodeURIComponent(job.title)}`}
                  >
                    <Button
                      variant="cta-secondary"
                      size="sm"
                      className="shrink-0"
                    >
                      {t("openings.apply")}
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/20 px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground mb-1">
                {t("openings.empty.title")}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {t("openings.empty.body")}
              </p>
              <a href="mailto:careers@gatectr.com">
                <Button variant="cta-secondary" size="sm">
                  {t("openings.empty.cta")}
                </Button>
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Values reminder */}
      <section className="py-20 px-4 bg-muted/20">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
            {t("culture.label")}
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
            {t("culture.headline")}
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-8">
            {t("culture.body")}
          </p>
          <a href="mailto:careers@gatectr.com">
            <Button variant="cta-ghost" size="sm">
              {t("culture.cta")}
            </Button>
          </a>
        </div>
      </section>
    </main>
  );
}
