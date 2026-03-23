import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "auth.metadata.signIn",
  });
  return {
    title: t("title"),
    description: t("description"),
  };
}

/**
 * Sign-in page
 * Available at /sign-in (English) and /fr/sign-in (French)
 * Requirements: 1.1, 1.4, 1.8
 */
export default function SignInPage() {
  return <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/dashboard" />;
}
