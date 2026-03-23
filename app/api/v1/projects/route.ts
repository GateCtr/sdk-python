import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkQuota } from "@/lib/plan-guard";
import { quotaExceededResponse } from "@/lib/quota-response";
import { dispatchWebhook } from "@/lib/webhooks";
import { logAudit } from "@/lib/audit";
import { resolveTeamContext } from "@/lib/team-context";

export async function GET(_req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx)
    return NextResponse.json({ error: "No active team" }, { status: 404 });

  const projects = await prisma.project.findMany({
    where: { teamId: ctx.teamId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      color: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx)
    return NextResponse.json({ error: "No active team" }, { status: 404 });

  const quotaResult = await checkQuota(ctx.userId, "projects");
  if (!quotaResult.allowed) return quotaExceededResponse(quotaResult);

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    slug?: string;
  };
  if (!body.name || !body.slug) {
    return NextResponse.json(
      { error: "name and slug are required" },
      { status: 400 },
    );
  }

  const project = await prisma.project.create({
    data: {
      userId: ctx.userId,
      teamId: ctx.teamId,
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
    },
  });

  logAudit({
    userId: ctx.userId,
    resource: "project",
    action: "created",
    resourceId: project.id,
    newValue: { name: project.name, slug: project.slug },
    success: true,
  }).catch(() => {});

  dispatchWebhook(ctx.userId, "project.created", {
    project_id: project.id,
    name: project.name,
    slug: project.slug,
  }).catch(() => {});

  return NextResponse.json(project, { status: 201 });
}
