import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { computeOverallStatus } from "@/lib/health-utils";

const SERVICES = ["app", "database", "redis", "queue", "stripe"] as const;

function requestId() {
  return randomBytes(8).toString("hex");
}

// ─── GET /api/v1/system/health — no auth required ────────────────────────────

export async function GET() {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  try {
    const results = await Promise.all(
      SERVICES.map((service) =>
        prisma.systemHealth.findFirst({
          where: { service },
          orderBy: { checkedAt: "desc" },
        }),
      ),
    );

    const services = SERVICES.reduce(
      (acc, service, i) => {
        const record = results[i];
        acc[service] = record
          ? { status: record.status, checkedAt: record.checkedAt }
          : { status: "unknown", checkedAt: null };
        return acc;
      },
      {} as Record<string, { status: string; checkedAt: Date | null }>,
    );

    const overallStatus = computeOverallStatus(
      Object.values(services).map((s) => s.status),
    );

    return NextResponse.json({ status: overallStatus, services }, { headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
