import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

function requestId(): string {
  return randomBytes(8).toString("hex");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };
  const { id } = await params;

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

  const key = await prisma.lLMProviderKey.findFirst({
    where: { id, userId: dbUser.id },
  });

  if (!key)
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });

  await prisma.lLMProviderKey.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true }, { headers });
}
