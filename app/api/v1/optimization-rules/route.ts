import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const VALID_RULE_TYPES = ["compression", "rewrite", "pruning"] as const;

function requestId() {
  return randomBytes(8).toString("hex");
}

// ─── GET /api/v1/optimization-rules ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(__req: NextRequest) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const rules = await prisma.optimizationRule.findMany({
      where: { isActive: true },
      orderBy: { priority: "desc" },
    });

    return NextResponse.json(rules, { headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
// ─── POST /api/v1/optimization-rules ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const body = (await req.json()) as {
      name?: string;
      ruleType?: string;
      description?: string;
      pattern?: string;
      replacement?: string;
      priority?: number;
    };

    if (!body.name || !body.ruleType)
      return NextResponse.json(
        { error: "validation_error" },
        { status: 400, headers },
      );

    if (!(VALID_RULE_TYPES as readonly string[]).includes(body.ruleType))
      return NextResponse.json(
        { error: "invalid_rule_type" },
        { status: 400, headers },
      );

    const rule = await prisma.optimizationRule.create({
      data: {
        name: body.name,
        ruleType: body.ruleType,
        description: body.description,
        pattern: body.pattern,
        replacement: body.replacement,
        priority: body.priority ?? 0,
      },
    });

    return NextResponse.json(rule, { status: 201, headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
