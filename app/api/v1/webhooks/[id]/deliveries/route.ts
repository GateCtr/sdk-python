import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!dbUser)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { id } = await params;

  // Enforce ownership
  const webhook = await prisma.webhook.findFirst({
    where: { id, userId: dbUser.id },
    select: { id: true },
  });
  if (!webhook)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { webhookId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      deliveryId: true,
      event: true,
      status: true,
      success: true,
      responseMs: true,
      retryCount: true,
      error: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ deliveries });
}
