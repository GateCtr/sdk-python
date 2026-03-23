import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

function requestId() {
  return randomBytes(8).toString("hex");
}

// ─── PATCH /api/v1/optimization-rules/[id] ───────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const { id } = await params;

    const existing = await prisma.optimizationRule.findUnique({
      where: { id },
    });
    if (!existing)
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers },
      );

    const body = (await req.json()) as {
      name?: string;
      description?: string;
      pattern?: string;
      replacement?: string;
      priority?: number;
      isActive?: boolean;
    };

    const updated = await prisma.optimizationRule.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && {
          description: body.description,
        }),
        ...(body.pattern !== undefined && { pattern: body.pattern }),
        ...(body.replacement !== undefined && {
          replacement: body.replacement,
        }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return NextResponse.json(updated, { headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}

// ─── DELETE /api/v1/optimization-rules/[id] ──────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const { id } = await params;

    const existing = await prisma.optimizationRule.findUnique({
      where: { id },
    });
    if (!existing)
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers },
      );

    await prisma.optimizationRule.delete({ where: { id } });

    return NextResponse.json({ success: true }, { headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
