import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { sendInviteEmail } from "@/lib/resend";
import { isAdmin } from "@/lib/auth";

const inviteSchema = z.object({
  entryIds: z.array(z.string()).min(1, "At least one entry must be selected"),
  expiryDays: z.number().min(1).max(30).default(7),
});

export async function POST(request: NextRequest) {
  try {
    // Check admin authentication
    const admin = await isAdmin();

    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { entryIds, expiryDays } = inviteSchema.parse(body);

    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    // Process each entry
    for (const entryId of entryIds) {
      try {
        const entry = await prisma.waitlistEntry.findUnique({
          where: { id: entryId },
        });

        if (!entry) {
          results.failed.push({ id: entryId, error: "Entry not found" });
          continue;
        }

        if (entry.status !== "WAITING") {
          results.failed.push({
            id: entryId,
            error: `Already ${entry.status.toLowerCase()}`,
          });
          continue;
        }

        // Generate unique invite code
        const inviteCode = nanoid(16);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiryDays);

        // Update entry
        await prisma.waitlistEntry.update({
          where: { id: entryId },
          data: {
            status: "INVITED",
            inviteCode,
            invitedAt: new Date(),
            inviteExpiresAt: expiresAt,
          },
        });

        // Send invite email (async, don't wait)
        sendInviteEmail(entry.email, entry.name, inviteCode, expiresAt).catch(
          (err) =>
            console.error(`Failed to send invite to ${entry.email}:`, err),
        );

        results.success.push(entryId);
      } catch (error) {
        console.error(`Failed to invite entry ${entryId}:`, error);
        results.failed.push({
          id: entryId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      invited: results.success.length,
      failed: results.failed.length,
      details: results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.issues },
        { status: 400 },
      );
    }

    console.error("Invite error:", error);
    return NextResponse.json(
      { error: "Failed to send invites" },
      { status: 500 },
    );
  }
}
