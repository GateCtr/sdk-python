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
    title: t("cookies.title"),
    description: t("cookies.description"),
    robots: { index: true, follow: true },
  };
}

export default async function CookiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.cookies" });

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
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <strong className="text-foreground">
                {t("s2.essential.label")}
              </strong>{" "}
              — {t("s2.essential.desc")}
            </li>
            <li>
              <strong className="text-foreground">
                {t("s2.functional.label")}
              </strong>{" "}
              — {t("s2.functional.desc")}
            </li>
            <li>
              <strong className="text-foreground">
                {t("s2.analytics.label")}
              </strong>{" "}
              — {t("s2.analytics.desc")}
            </li>
          </ul>
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
          <p className="mt-2">
            <a
              href="mailto:privacy@gatectr.com"
              className="text-primary hover:underline"
            >
              privacy@gatectr.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
