import type { Metadata } from "next";
import { getSeoContext, buildCanonicalUrl } from "@/lib/seo";
import { Logo } from "@/components/shared/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/shared/footer";
import { ShieldCheck, Zap, BarChart3 } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const context = await getSeoContext();
  const canonical = buildCanonicalUrl("/sign-in", locale, context);

  return {
    robots: { index: false, follow: false },
    alternates: { canonical },
  };
}

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.layout" });

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — branding & value prop ── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col bg-primary-900 relative overflow-hidden">
        {/* Background pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }}
        />
        {/* Cyan glow */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-secondary-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-20 w-80 h-80 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between px-10 pt-8">
          <Link href="/" aria-label="GateCtr home">
            <Logo
              variant="full"
              iconClassName="w-8 h-8"
              textClassName="text-white"
            />
          </Link>
        </div>

        {/* Main content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-10 xl:px-16">
          <p className="text-secondary-400 text-sm font-mono font-medium tracking-widest uppercase mb-4">
            {t("eyebrow")}
          </p>
          <h1 className="text-white text-4xl xl:text-5xl font-bold leading-tight tracking-tight mb-4">
            {t("headline")}
          </h1>
          <p className="text-primary-200 text-lg leading-relaxed mb-12 max-w-md">
            {t("subheadline")}
          </p>

          {/* Feature pills */}
          <div className="flex flex-col gap-4">
            <FeaturePill
              icon={<Zap className="size-4 text-secondary-400" />}
              label={t("feature1")}
            />
            <FeaturePill
              icon={<BarChart3 className="size-4 text-secondary-400" />}
              label={t("feature2")}
            />
            <FeaturePill
              icon={<ShieldCheck className="size-4 text-secondary-400" />}
              label={t("feature3")}
            />
          </div>
        </div>

        {/* Bottom quote */}
        <div className="relative z-10 px-10 xl:px-16 pb-10">
          <p className="text-primary-300 text-sm italic">
            &ldquo;{t("quote")}&rdquo;
          </p>
        </div>
      </div>

      {/* ── Right panel — auth form ── */}
      <div className="flex-1 flex flex-col bg-background">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 pt-6 lg:px-10">
          {/* Logo — mobile only */}
          <Link href="/" aria-label="GateCtr home" className="lg:hidden">
            <Logo variant="full" />
          </Link>
          <div className="hidden lg:block" />

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 py-10">
          {children}
        </div>

        {/* Footer */}
        <Footer variant="auth" />
      </div>
    </div>
  );
}

function FeaturePill({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-white/5 border border-white/10 shrink-0">
        {icon}
      </div>
      <span className="text-primary-100 text-sm font-medium">{label}</span>
    </div>
  );
}
