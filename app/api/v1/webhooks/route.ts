import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkQuota } from "@/lib/plan-guard";
import { quotaExceededResponse } from "@/lib/quota-response";
import { resolveTeamContext } from "@/lib/team-context";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx)
    return NextResponse.json({ error: "No active team" }, { status: 404 });

  const quotaResult = await checkQuota(ctx.userId, "webhooks");
  if (!quotaResult.allowed) return quotaExceededResponse(quotaResult);

  let body: { name?: string; url?: string; events?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

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

  const secret = `whsec_${randomBytes(24).toString("hex")}`;

  const webhook = await prisma.webhook.create({
    data: {
      userId: ctx.userId,
      teamId: ctx.teamId,
      name: body.name,
      url: body.url,
      secret,
      events: body.events ?? ["budget.alert", "request.completed"],
    },
  });

  return NextResponse.json(webhook, { status: 201 });
}

export async function GET(_req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx)
    return NextResponse.json({ error: "No active team" }, { status: 404 });

  const webhooks = await prisma.webhook.findMany({
    where: { teamId: ctx.teamId },
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
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ webhooks });
}
