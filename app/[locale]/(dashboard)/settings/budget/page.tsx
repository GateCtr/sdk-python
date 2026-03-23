import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { resolveTeamContext } from "@/lib/team-context";
import { BudgetForm } from "@/components/settings/budget-form";
import type { PlanType } from "@prisma/client";

export default async function BudgetSettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const t = await getTranslations("settingsBudget");

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) redirect("/sign-in");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      plan: true,
      budget: {
        select: {
          maxTokensPerDay: true,
          maxTokensPerMonth: true,
          maxCostPerDay: true,
          maxCostPerMonth: true,
          alertThresholdPct: true,
          hardStop: true,
        },
      },
    },
  });

  if (!dbUser) redirect("/sign-in");

  // Charger les projets du team avec leur budget
  const projects = await prisma.project.findMany({
    where: { teamId: ctx.teamId },
    select: {
      id: true,
      name: true,
      color: true,
      budget: {
        select: {
          maxTokensPerDay: true,
          maxTokensPerMonth: true,
          maxCostPerDay: true,
          maxCostPerMonth: true,
          alertThresholdPct: true,
          hardStop: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("page.description")}
        </p>
      </div>
      <BudgetForm
        globalBudget={dbUser.budget}
        plan={dbUser.plan as PlanType}
        projects={projects}
      />
    </div>
  );
}
