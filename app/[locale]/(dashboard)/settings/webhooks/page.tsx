import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { resolveTeamContext } from "@/lib/team-context";
import { getPlanLimits, getUserPlanType } from "@/lib/plan-guard";
import { WebhooksDashboard } from "@/components/dashboard/webhooks/webhooks-dashboard";

export default async function WebhooksSettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) redirect("/sign-in");

  const planType = await getUserPlanType(ctx.userId);
  const limits = await getPlanLimits(planType);
  const maxWebhooks = limits?.maxWebhooks ?? null;

  return <WebhooksDashboard maxWebhooks={maxWebhooks} />;
}
