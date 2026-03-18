import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendWelcomeWaitlistEmail } from "@/lib/resend";
import { isAdmin } from "@/lib/auth";

const waitlistSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().optional(),
  company: z.string().optional(),
  useCase: z.enum(["saas", "agent", "enterprise", "dev"]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Check if waitlist is enabled
    if (process.env.ENABLE_WAITLIST !== "true") {
      return NextResponse.json(
        { error: "Waitlist is not currently active" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const validatedData = waitlistSchema.parse(body);

    // Get IP and User Agent for tracking
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Check if email already exists
    const existing = await prisma.waitlistEntry.findUnique({
      where: { email: validatedData.email },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Email already registered", position: existing.position },
        { status: 409 },
      );
    }

    // Create waitlist entry
    const entry = await prisma.waitlistEntry.create({
      data: {
        email: validatedData.email,
        name: validatedData.name,
        company: validatedData.company,
        useCase: validatedData.useCase,
        ipAddress,
        userAgent,
      },
    });

    // Send welcome email (async, don't wait)
    sendWelcomeWaitlistEmail(entry.email, entry.name, entry.position).catch(
      (err) => console.error("Failed to send welcome email:", err),
    );

    return NextResponse.json({
      success: true,
      position: entry.position,
      message: "Successfully joined the waitlist",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.issues },
        { status: 400 },
      );
    }

    console.error("Waitlist error:", error);
    return NextResponse.json(
      { error: "Failed to join waitlist" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check admin authentication
    const admin = await isAdmin();

    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const status = searchParams.get("status") as
      | "WAITING"
      | "INVITED"
      | "JOINED"
      | null;

    const where = status ? { status } : {};

    const [entries, total] = await Promise.all([
      prisma.waitlistEntry.findMany({
        where,
        orderBy: { position: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.waitlistEntry.count({ where }),
    ]);

    return NextResponse.json({
      entries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Waitlist fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch waitlist" },
      { status: 500 },
    );
  }
}
