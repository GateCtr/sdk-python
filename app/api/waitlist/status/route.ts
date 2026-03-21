import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");

  // Validate email with a linear-time check to avoid ReDoS (CodeQL: polynomial regex)
  const atIndex = email ? email.indexOf("@") : -1;
  const isValidEmail =
    atIndex > 0 &&
    atIndex === email.lastIndexOf("@") &&
    email.indexOf(".", atIndex) > atIndex + 1 &&
    !email.includes(" ");

  if (!email || !isValidEmail) {
    return NextResponse.json(
      { error: "Valid email required" },
      { status: 400 },
    );
  }

  const entry = await prisma.waitlistEntry.findUnique({
    where: { email },
    select: {
      position: true,
      status: true,
      referralCode: true,
      inviteExpiresAt: true,
      createdAt: true,
    },
  });

  if (!entry) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // Count how many people this user referred
  const referralCount = await prisma.waitlistEntry.count({
    where: { referredBy: entry.referralCode ?? undefined },
  });

  return NextResponse.json({
    position: entry.position,
    status: entry.status,
    referralCode: entry.referralCode,
    referralCount,
    inviteExpiresAt: entry.inviteExpiresAt,
    joinedAt: entry.createdAt,
  });
}
