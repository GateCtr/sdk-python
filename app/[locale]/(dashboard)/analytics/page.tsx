import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/plan-guard";
import { AnalyticsDashboard } from "@/components/dashboard/analytics/analytics-dashboard";

export default async function AnalyticsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!dbUser) redirect("/sign-in");

  const hasAdvancedAnalytics = await checkFeatureAccess(
    dbUser.id,
    "advancedAnalytics",
  );

  return <AnalyticsDashboard hasAdvancedAnalytics={hasAdvancedAnalytics} />;
}
