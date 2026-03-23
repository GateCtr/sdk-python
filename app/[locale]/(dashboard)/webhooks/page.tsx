import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPlanLimits, getUserPlanType } from "@/lib/plan-guard";
import { WebhooksDashboard } from "@/components/dashboard/webhooks/webhooks-dashboard";

export default async function WebhooksPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!dbUser) redirect("/sign-in");

  const planType = await getUserPlanType(dbUser.id);
  const limits = await getPlanLimits(planType);
  const maxWebhooks = limits?.maxWebhooks ?? null;

  return <WebhooksDashboard maxWebhooks={maxWebhooks} />;
}
