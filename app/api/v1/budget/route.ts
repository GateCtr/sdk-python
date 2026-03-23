import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveTeamContext } from "@/lib/team-context";
import { randomBytes } from "crypto";

function requestId(): string {
  return randomBytes(8).toString("hex");
}

export async function GET() {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx)
    return NextResponse.json(
      { error: "No active team" },
      { status: 404, headers },
    );

  const [userBudget, projectBudgets] = await Promise.all([
    prisma.budget.findUnique({ where: { userId: ctx.userId } }),
    prisma.budget.findMany({
      where: { project: { teamId: ctx.teamId } },
      include: { project: { select: { id: true, name: true, slug: true } } },
    }),
  ]);

  return NextResponse.json({ userBudget, projectBudgets }, { headers });
}

export async function POST(req: NextRequest) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx)
    return NextResponse.json(
      { error: "No active team" },
      { status: 404, headers },
    );

  const body = (await req.json()) as {
    projectId?: string;
    maxTokensPerDay?: number;
    maxTokensPerMonth?: number;
    maxCostPerDay?: number;
    maxCostPerMonth?: number;
    alertThresholdPct?: number;
    hardStop?: boolean;
    notifyOnThreshold?: boolean;
    notifyOnExceeded?: boolean;
  };

  // Validate alertThresholdPct
  if (
    body.alertThresholdPct !== undefined &&
    (body.alertThresholdPct < 1 || body.alertThresholdPct > 99)
  ) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: "alertThresholdPct must be between 1 and 99",
      },
      { status: 400, headers },
    );
  }

  // Validate positive numbers
  if (body.maxTokensPerDay !== undefined && body.maxTokensPerDay <= 0) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: "maxTokensPerDay must be positive",
      },
      { status: 400, headers },
    );
  }
  if (body.maxCostPerDay !== undefined && body.maxCostPerDay <= 0) {
    return NextResponse.json(
      { error: "validation_error", message: "maxCostPerDay must be positive" },
      { status: 400, headers },
    );
  }
  if (body.maxTokensPerMonth !== undefined && body.maxTokensPerMonth <= 0) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: "maxTokensPerMonth must be positive",
      },
      { status: 400, headers },
    );
  }
  if (body.maxCostPerMonth !== undefined && body.maxCostPerMonth <= 0) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: "maxCostPerMonth must be positive",
      },
      { status: 400, headers },
    );
  }

  const budgetData = {
    maxTokensPerDay: body.maxTokensPerDay ?? null,
    maxTokensPerMonth: body.maxTokensPerMonth ?? null,
    maxCostPerDay: body.maxCostPerDay ?? null,
    maxCostPerMonth: body.maxCostPerMonth ?? null,
    alertThresholdPct: body.alertThresholdPct ?? 80,
    hardStop: body.hardStop ?? false,
    notifyOnThreshold: body.notifyOnThreshold ?? true,
    notifyOnExceeded: body.notifyOnExceeded ?? true,
  };

  if (body.projectId) {
    // Verify project belongs to the active team
    const project = await prisma.project.findFirst({
      where: { id: body.projectId, teamId: ctx.teamId },
    });
    if (!project) {
      return NextResponse.json(
        { error: "forbidden", message: "Project not found in active team" },
        { status: 403, headers },
      );
    }

    const budget = await prisma.budget.upsert({
      where: { projectId: body.projectId },
      create: { projectId: body.projectId, ...budgetData },
      update: budgetData,
    });

    return NextResponse.json(budget, { headers });
  }

  // User-level budget
  const budget = await prisma.budget.upsert({
    where: { userId: ctx.userId },
    create: { userId: ctx.userId, ...budgetData },
    update: budgetData,
  });

  return NextResponse.json(budget, { headers });
}
