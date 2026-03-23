import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

function requestId() {
  return randomBytes(8).toString("hex");
}

export async function GET(
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

    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers },
      );

    const { id } = await params;

    const rule = await prisma.alertRule.findUnique({ where: { id } });

    if (!rule || rule.userId !== dbUser.id)
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers },
      );

    const alerts = await prisma.alert.findMany({
      where: { ruleId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ alerts }, { headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
