import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveTeamContext } from "@/lib/team-context";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx)
    return NextResponse.json({ error: "No active team" }, { status: 404 });

  const { id } = await params;
  const webhook = await prisma.webhook.findFirst({
    where: { id, teamId: ctx.teamId },
  });
  if (!webhook)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    name?: string;
    url?: string;
    events?: string[];
    isActive?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.url !== undefined) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(body.url);
    } catch {
      return NextResponse.json(
        { error: "url_invalid", message: "URL must be a valid HTTPS URL" },
        { status: 400 },
      );
    }
    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "url_must_be_https", message: "Webhook URL must use HTTPS" },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.webhook.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.url !== undefined && { url: body.url }),
      ...(body.events !== undefined && { events: body.events }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
    select: {
      id: true,
      name: true,
      url: true,
      events: true,
      isActive: true,
      lastFiredAt: true,
      failCount: true,
      successCount: true,
      createdAt: true,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx)
    return NextResponse.json({ error: "No active team" }, { status: 404 });

  const { id } = await params;
  const webhook = await prisma.webhook.findFirst({
    where: { id, teamId: ctx.teamId },
  });
  if (!webhook)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.webhook.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
