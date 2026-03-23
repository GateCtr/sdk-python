import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

const VALID_TYPES = ["slack", "teams", "discord", "zapier", "custom"] as const;

function requestId() {
  return randomBytes(8).toString("hex");
}

// ─── GET /api/v1/integrations ─────────────────────────────────────────────────

export async function GET() {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers },
      );

    const integrations = await prisma.integrationConnector.findMany({
      where: { userId: dbUser.id },
      select: {
        id: true,
        userId: true,
        type: true,
        name: true,
        eventMapping: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
        // encryptedConfig intentionally omitted
      },
    });

    return NextResponse.json(integrations, { headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}

// ─── POST /api/v1/integrations ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers },
      );

    const body = (await req.json()) as {
      name?: string;
      type?: string;
      config?: Record<string, unknown>;
      eventMapping?: Record<string, unknown>;
    };

    if (!body.name || !body.type || !body.config)
      return NextResponse.json(
        { error: "validation_error" },
        { status: 400, headers },
      );

    if (!(VALID_TYPES as readonly string[]).includes(body.type))
      return NextResponse.json(
        { error: "invalid_integration_type" },
        { status: 400, headers },
      );

    const encryptedConfig = encrypt(JSON.stringify(body.config));

    try {
      const integration = await prisma.integrationConnector.create({
        data: {
          userId: dbUser.id,
          type: body.type,
          name: body.name,
          encryptedConfig,
          eventMapping: (body.eventMapping ?? {}) as Prisma.InputJsonValue,
        },
        select: {
          id: true,
          userId: true,
          type: true,
          name: true,
          eventMapping: true,
          isActive: true,
          lastSyncAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      logAudit({
        userId: dbUser.id,
        resource: "integration",
        action: "created",
        resourceId: integration.id,
        success: true,
      }).catch(() => {});

      return NextResponse.json(integration, { status: 201, headers });
    } catch (err: unknown) {
      // Unique constraint: [userId, type, name]
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return NextResponse.json(
          { error: "integration_already_exists" },
          { status: 409, headers },
        );
      }
      throw err;
    }
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}

// ─── DELETE /api/v1/integrations ─────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers },
      );

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id)
      return NextResponse.json(
        { error: "validation_error" },
        { status: 400, headers },
      );

    const integration = await prisma.integrationConnector.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!integration || integration.userId !== dbUser.id)
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers },
      );

    await prisma.integrationConnector.delete({ where: { id } });

    logAudit({
      userId: dbUser.id,
      resource: "integration",
      action: "deleted",
      resourceId: id,
      success: true,
    }).catch(() => {});

    return NextResponse.json({ success: true }, { headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
