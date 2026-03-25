import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import {
  ArrowRight,
  Shield,
  Zap,
  GitBranch,
  BarChart3,
  Globe,
} from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    robots: { index: true, follow: true },
  };
}

const VALUES_ICONS = [Shield, Zap, GitBranch, BarChart3, Globe] as const;

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });

  const values = t.raw("values.items") as Array<{
    title: string;
    body: string;
  }>;
  const team = t.raw("team.members") as Array<{
    name: string;
    role: string;
    bio: string;
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
            <Globe className="size-3 text-secondary-500" aria-hidden />
            {t("hero.badge")}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-5 leading-tight">
            {t("hero.headline")}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            {t("hero.description")}
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 px-4 bg-muted/20">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
              {t("mission.label")}
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              {t("mission.headline")}
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("mission.body1")}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t("mission.body2")}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            {(["stat1", "stat2", "stat3"] as const).map((key) => (
              <div key={key} className="flex items-start gap-4">
                <div className="text-3xl font-extrabold text-primary tabular-nums">
                  {t(`mission.${key}.value`)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t(`mission.${key}.label`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`mission.${key}.desc`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3 text-center">
            {t("story.label")}
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8 text-center">
            {t("story.headline")}
          </h2>
          <div className="space-y-5 text-muted-foreground leading-relaxed">
            <p>{t("story.p1")}</p>
            <p>{t("story.p2")}</p>
            <p>{t("story.p3")}</p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 px-4 bg-muted/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
              {t("values.label")}
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              {t("values.headline")}
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {values.map((v, i) => {
              const Icon = VALUES_ICONS[i % VALUES_ICONS.length];
              return (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card p-5"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 mb-3">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1.5">
                    {v.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {v.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
              {t("team.label")}
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
              {t("team.headline")}
            </h2>
            <p className="text-muted-foreground">{t("team.description")}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {team.map((member, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg mb-3">
                  {member.name.charAt(0)}
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {member.name}
                </p>
                <p className="text-xs text-secondary-500 font-mono mb-2">
                  {member.role}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {member.bio}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 bg-muted/20">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t("cta.headline")}
          </h2>
          <p className="text-muted-foreground mb-8">{t("cta.description")}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="cta-primary" size="lg" asChild>
              <Link href="/sign-up">
                {t("cta.primary")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="cta-secondary" size="lg" asChild>
              <a href="mailto:hello@gatectr.com">{t("cta.secondary")}</a>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
