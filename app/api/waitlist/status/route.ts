import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");

  // Linear-time email validation — avoids ReDoS (CodeQL: polynomial regex on uncontrolled data)
  // Uses indexOf/lastIndexOf which are O(n) with no backtracking
  const isValidEmail = (value: string): boolean => {
    const at = value.indexOf("@");
    return (
      at > 0 &&
      at === value.lastIndexOf("@") &&
      value.indexOf(".", at) > at + 1 &&
      !/\s/.test(value)
    );
  };

  if (!email || !isValidEmail(email)) {
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
