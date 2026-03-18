import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "auth.metadata.signUp",
  });
  return {
    title: t("title"),
    description: t("description"),
  };
}

/**
 * Sign-up page
 * Available at /sign-up (English) and /fr/sign-up (French)
 * Requirements: 1.2, 1.4, 1.8
 */
export default function SignUpPage() {
  return <SignUp fallbackRedirectUrl="/dashboard" signInUrl="/sign-in" />;
}
