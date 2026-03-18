import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Header } from "@/components/shared/header";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding.metadata" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sessionClaims } = await auth();

  // Already onboarded — send to dashboard
  if (
    (
      sessionClaims?.publicMetadata as
        | { onboardingComplete?: boolean }
        | undefined
    )?.onboardingComplete === true
  ) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header variant="minimal" />
      <div className="flex-1 flex items-center justify-center px-4 pt-12 pb-12">
        {children}
      </div>
    </div>
  );
}
