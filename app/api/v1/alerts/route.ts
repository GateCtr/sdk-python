import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

const VALID_ALERT_TYPES = [
  "budget_threshold",
  "token_limit",
  "error_rate",
  "latency",
] as const;

function requestId() {
  return randomBytes(8).toString("hex");
}

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "X-GateCtr-Request-Id": requestId() } },
      );

    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: { "X-GateCtr-Request-Id": requestId() } },
      );

    const alertRules = await prisma.alertRule.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      { alertRules },
      { headers: { "X-GateCtr-Request-Id": requestId() } },
    );
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: { "X-GateCtr-Request-Id": requestId() } },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "X-GateCtr-Request-Id": requestId() } },
      );

    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: { "X-GateCtr-Request-Id": requestId() } },
      );

    const body = (await req.json()) as {
      name?: string;
      alertType?: string;
      condition?: Record<string, unknown>;
      channels?: string[];
      projectId?: string;
    };

    if (!body.name || !body.alertType || !body.condition) {
      return NextResponse.json(
        { error: "validation_error" },
        { status: 400, headers: { "X-GateCtr-Request-Id": requestId() } },
      );
    }

    if (
      !VALID_ALERT_TYPES.includes(
        body.alertType as (typeof VALID_ALERT_TYPES)[number],
      )
    ) {
      return NextResponse.json(
        { error: "invalid_alert_type" },
        { status: 400, headers: { "X-GateCtr-Request-Id": requestId() } },
      );
    }

    const rule = await prisma.alertRule.create({
      data: {
        userId: dbUser.id,
        name: body.name,
        alertType: body.alertType,
        condition: body.condition as Prisma.InputJsonValue,
        channels: body.channels,
        projectId: body.projectId ?? null,
      },
    });

    logAudit({
      userId: dbUser.id,
      resource: "alert_rule",
      action: "created",
      resourceId: rule.id,
      success: true,
    }).catch(() => {});

    return NextResponse.json(rule, {
      status: 201,
      headers: { "X-GateCtr-Request-Id": requestId() },
    });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: { "X-GateCtr-Request-Id": requestId() } },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "X-GateCtr-Request-Id": requestId() } },
      );

    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: { "X-GateCtr-Request-Id": requestId() } },
      );

    const body = (await req.json()) as { id?: string };

    const rule = await prisma.alertRule.findUnique({
      where: { id: body.id },
    });

    if (!rule || rule.userId !== dbUser.id) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: { "X-GateCtr-Request-Id": requestId() } },
      );
    }

    await prisma.alertRule.delete({ where: { id: body.id } });

    logAudit({
      userId: dbUser.id,
      resource: "alert_rule",
      action: "deleted",
      resourceId: body.id,
      success: true,
    }).catch(() => {});

    return NextResponse.json(
      { success: true },
      { headers: { "X-GateCtr-Request-Id": requestId() } },
    );
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: { "X-GateCtr-Request-Id": requestId() } },
    );
  }
}
