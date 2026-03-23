import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPlanLimits, getUserPlanType } from "@/lib/plan-guard";
import { ProjectsDashboard } from "@/components/dashboard/projects/projects-dashboard";

export default async function ProjectsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, plan: true },
  });
  if (!dbUser) redirect("/sign-in");

  const planType = await getUserPlanType(dbUser.id);
  const limits = await getPlanLimits(planType);
  const maxProjects = limits?.maxProjects ?? null;
  const isTeamPlan = planType === "TEAM" || planType === "ENTERPRISE";

  return (
    <ProjectsDashboard maxProjects={maxProjects} isTeamPlan={isTeamPlan} />
  );
}
