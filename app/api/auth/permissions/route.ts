import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/permissions
 * Returns all permissions for the currently authenticated user.
 * Requirements: 5.5, 5.6
 */
export async function GET() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve internal user ID from Clerk ID
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getUserPermissions(user.id);

  return NextResponse.json({ permissions });
}
