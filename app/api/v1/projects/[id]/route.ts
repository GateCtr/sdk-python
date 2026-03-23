import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchWebhook } from "@/lib/webhooks";
import { logAudit } from "@/lib/audit";
import { resolveTeamContext } from "@/lib/team-context";
import { randomBytes } from "crypto";

function requestId(): string {
  return randomBytes(8).toString("hex");
}

async function resolveAndCheck(clerkId: string, projectId: string) {
  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) return null;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;

  // Allow if project belongs to the active team OR directly to the user
  const allowed =
    project.teamId === ctx.teamId || project.userId === ctx.userId;
  if (!allowed) return null;

  return { ctx, project };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };
  const { id } = await params;

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const result = await resolveAndCheck(clerkId, id);
    if (!result)
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers },
      );

    return NextResponse.json(result.project, { headers });
  } catch (err) {
    console.error("[projects/[id] GET] error:", err);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };
  const { id } = await params;

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const result = await resolveAndCheck(clerkId, id);
    if (!result)
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers },
      );

    const { ctx, project: existing } = result;

    const body = (await req.json()) as {
      name?: string;
      description?: string;
      color?: string;
      isActive?: boolean;
    };

    const data: typeof body = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.color !== undefined) data.color = body.color;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const updated = await prisma.project.update({ where: { id }, data });

    logAudit({
      userId: ctx.userId,
      resource: "project",
      action: "updated",
      resourceId: id,
      oldValue: {
        name: existing.name,
        description: existing.description,
        color: existing.color,
        isActive: existing.isActive,
      },
      newValue: {
        name: updated.name,
        description: updated.description,
        color: updated.color,
        isActive: updated.isActive,
      },
      success: true,
    }).catch(() => {});

    dispatchWebhook(ctx.userId, "project.updated", {
      project_id: id,
      name: updated.name,
      slug: updated.slug,
    }).catch(() => {});

    return NextResponse.json(updated, { headers });
  } catch (err) {
    console.error("[projects/[id] PATCH] error:", err);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };
  const { id } = await params;

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const result = await resolveAndCheck(clerkId, id);
    if (!result)
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers },
      );

    const { ctx, project } = result;

    await prisma.project.delete({ where: { id } });

    logAudit({
      userId: ctx.userId,
      resource: "project",
      action: "deleted",
      resourceId: id,
      success: true,
    }).catch(() => {});

    dispatchWebhook(ctx.userId, "project.deleted", {
      project_id: id,
      name: project.name,
      slug: project.slug,
    }).catch(() => {});

    return NextResponse.json({ success: true }, { headers });
  } catch (err) {
    console.error("[projects/[id] DELETE] error:", err);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
