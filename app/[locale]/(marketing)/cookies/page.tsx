import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Cookie } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.cookies" });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
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
    <main className="w-full">
      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-12 px-4">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[300px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs font-mono text-muted-foreground mb-6 backdrop-blur-sm">
            <Cookie className="size-3 text-secondary-500" aria-hidden />
            {t("eyebrow")}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-4">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("lastUpdated")}</p>
        </div>
      </section>

      {/* Content */}
      <section className="px-4 pb-24">
        <div className="max-w-3xl mx-auto space-y-12">
          {/* Intro */}
          <div className="rounded-xl border border-border bg-muted/20 px-6 py-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("intro")}
            </p>
          </div>

          <LegalSection title={t("s1.title")}>
            <p>{t("s1.body")}</p>
          </LegalSection>

          {/* Cookie table */}
          <LegalSection title={t("s2.title")}>
            <p>{t("s2.body")}</p>
            <div className="rounded-lg border border-border bg-card overflow-hidden mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground">
                      {t("s2.col1")}
                    </th>
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground hidden sm:table-cell">
                      {t("s2.col2")}
                    </th>
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground">
                      {t("s2.col3")}
                    </th>
                    <th className="text-left px-4 py-2.5 font-semibold text-foreground hidden md:table-cell">
                      {t("s2.col4")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(["row1", "row2", "row3", "row4", "row5"] as const).map(
                    (row, i) => (
                      <tr
                        key={row}
                        className={i % 2 === 0 ? "bg-card" : "bg-muted/20"}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                          {t(`s2.${row}.name`)}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">
                          {t(`s2.${row}.purpose`)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-block rounded-full bg-primary/8 text-primary text-xs font-medium px-2.5 py-0.5">
                            {t(`s2.${row}.type`)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                          {t(`s2.${row}.duration`)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </LegalSection>

          <LegalSection title={t("s3.title")}>
            <p>{t("s3.body")}</p>
          </LegalSection>

          <LegalSection title={t("s4.title")}>
            <p>{t("s4.body")}</p>
            <ul>
              <li>
                <strong className="text-foreground">
                  {t("s4.chrome.label")}
                </strong>{" "}
                — {t("s4.chrome.desc")}
              </li>
              <li>
                <strong className="text-foreground">
                  {t("s4.firefox.label")}
                </strong>{" "}
                — {t("s4.firefox.desc")}
              </li>
              <li>
                <strong className="text-foreground">
                  {t("s4.safari.label")}
                </strong>{" "}
                — {t("s4.safari.desc")}
              </li>
              <li>
                <strong className="text-foreground">
                  {t("s4.edge.label")}
                </strong>{" "}
                — {t("s4.edge.desc")}
              </li>
            </ul>
            <p className="mt-3">{t("s4.warning")}</p>
          </LegalSection>

          <LegalSection title={t("s5.title")}>
            <p>{t("s5.body")}</p>
          </LegalSection>

          {/* Contact */}
          <div className="rounded-xl border border-border bg-muted/20 px-6 py-5">
            <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-2">
              {t("contact.eyebrow")}
            </p>
            <p className="text-sm font-semibold text-foreground mb-1">
              {t("contact.title")}
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              {t("contact.body")}
            </p>
            <a
              href="mailto:privacy@gatectr.com"
              className="text-sm text-primary hover:underline font-medium"
            >
              privacy@gatectr.com
            </a>
          </div>

          {/* Related */}
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/privacy"
              className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            >
              {t("related.privacy")}
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <Link
              href="/terms"
              className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            >
              {t("related.terms")}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-bold text-foreground mb-4 pb-2 border-b border-border">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_p]:leading-relaxed">
        {children}
      </div>
    </div>
  );
}
