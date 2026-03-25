import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return {
    title: t("terms.title"),
    description: t("terms.description"),
    robots: { index: true, follow: true },
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });

  return (
    <div className="max-w-3xl mx-auto px-4 py-16 w-full">
      <div className="mb-10">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
          {t("eyebrow")}
        </p>
        <h1 className="text-3xl font-bold tracking-tight mb-3">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("lastUpdated")}</p>
      </div>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">
            {t("s1.title")}
          </h2>
          <p>{t("s1.body")}</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">
            {t("s2.title")}
          </h2>
          <p>{t("s2.body")}</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">
            {t("s3.title")}
          </h2>
          <p>{t("s3.body")}</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">
            {t("s4.title")}
          </h2>
          <p>{t("s4.body")}</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">
            {t("s5.title")}
          </h2>
          <p>{t("s5.body")}</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">
            {t("s6.title")}
          </h2>
          <p>{t("s6.body")}</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">
            {t("s7.title")}
          </h2>
          <p>{t("s7.body")}</p>
          <p className="mt-2">
            <a
              href="mailto:legal@gatectr.com"
              className="text-primary hover:underline"
            >
              legal@gatectr.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
