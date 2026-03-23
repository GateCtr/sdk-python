"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { resolveTeamContext } from "@/lib/team-context";

function parseOptionalPositive(val: string | null): number | null | undefined {
  if (!val || val.trim() === "") return null;
  const n = Number(val);
  if (isNaN(n) || n <= 0) return undefined; // undefined signals invalid
  return n;
}

export async function saveBudget(formData: FormData) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "internal_error" as const };

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) return { error: "internal_error" as const };

  const projectId = (formData.get("projectId") as string | null) || null;

  // Si projectId fourni, vérifier ownership via teamId
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, teamId: ctx.teamId },
      select: { id: true },
    });
    if (!project) return { error: "internal_error" as const };
  }

  const rawTokensDay = formData.get("maxTokensPerDay") as string | null;
  const rawTokensMonth = formData.get("maxTokensPerMonth") as string | null;
  const rawCostDay = formData.get("maxCostPerDay") as string | null;
  const rawCostMonth = formData.get("maxCostPerMonth") as string | null;
  const alertThresholdPct = parseInt(
    (formData.get("alertThresholdPct") as string) ?? "80",
    10,
  );
  const hardStop = formData.get("hardStop") === "true";

  const maxTokensPerDay = parseOptionalPositive(rawTokensDay);
  const maxTokensPerMonth = parseOptionalPositive(rawTokensMonth);
  const maxCostPerDay = parseOptionalPositive(rawCostDay);
  const maxCostPerMonth = parseOptionalPositive(rawCostMonth);

  if (
    maxTokensPerDay === undefined ||
    maxTokensPerMonth === undefined ||
    maxCostPerDay === undefined ||
    maxCostPerMonth === undefined
  ) {
    return { error: "invalid_value" as const };
  }

  const data = {
    maxTokensPerDay,
    maxTokensPerMonth,
    maxCostPerDay,
    maxCostPerMonth,
    alertThresholdPct: isNaN(alertThresholdPct)
      ? 80
      : Math.min(99, Math.max(1, alertThresholdPct)),
    hardStop,
  };

  if (projectId) {
    // Vérifier que le budget projet ne dépasse pas le budget global
    const globalBudget = await prisma.budget.findUnique({
      where: { userId: ctx.userId },
    });
    if (globalBudget) {
      if (
        maxTokensPerMonth !== null &&
        globalBudget.maxTokensPerMonth !== null &&
        maxTokensPerMonth > globalBudget.maxTokensPerMonth
      ) {
        return { error: "project_exceeds_global" as const };
      }
      if (
        maxTokensPerDay !== null &&
        globalBudget.maxTokensPerDay !== null &&
        maxTokensPerDay > globalBudget.maxTokensPerDay
      ) {
        return { error: "project_exceeds_global" as const };
      }
      if (
        maxCostPerMonth !== null &&
        globalBudget.maxCostPerMonth !== null &&
        maxCostPerMonth > globalBudget.maxCostPerMonth
      ) {
        return { error: "project_exceeds_global" as const };
      }
      if (
        maxCostPerDay !== null &&
        globalBudget.maxCostPerDay !== null &&
        maxCostPerDay > globalBudget.maxCostPerDay
      ) {
        return { error: "project_exceeds_global" as const };
      }
    }

    // Budget par projet
    const budget = await prisma.budget.upsert({
      where: { projectId },
      create: { projectId, ...data },
      update: data,
      select: {
        id: true,
        maxTokensPerDay: true,
        maxTokensPerMonth: true,
        maxCostPerDay: true,
        maxCostPerMonth: true,
        alertThresholdPct: true,
        hardStop: true,
      },
    });
    return { data: budget };
  } else {
    // Budget global lié au userId (owner du plan)
    const budget = await prisma.budget.upsert({
      where: { userId: ctx.userId },
      create: { userId: ctx.userId, ...data },
      update: data,
      select: {
        id: true,
        maxTokensPerDay: true,
        maxTokensPerMonth: true,
        maxCostPerDay: true,
        maxCostPerMonth: true,
        alertThresholdPct: true,
        hardStop: true,
      },
    });
    return { data: budget };
  }
}
