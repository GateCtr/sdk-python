import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkQuota } from "@/lib/plan-guard";
import { quotaExceededResponse } from "@/lib/quota-response";
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";
import { resolveTeamContext } from "@/lib/team-context";
import { randomBytes, createHash } from "crypto";

const ALLOWED_SCOPES = ["complete", "chat", "read", "admin"];
const REQUEST_ID_HEADER = "X-GateCtr-Request-Id";

function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `gct_${randomBytes(24).toString("hex")}`;
  const prefix = raw.slice(0, 12);
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

function requestId(): string {
  return randomBytes(8).toString("hex");
}

export async function GET() {
  const rid = requestId();
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { [REQUEST_ID_HEADER]: rid } },
    );

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx)
    return NextResponse.json(
      { error: "No active team" },
      { status: 404, headers: { [REQUEST_ID_HEADER]: rid } },
    );

  const keys = await prisma.apiKey.findMany({
    where: { teamId: ctx.teamId },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      projectId: true,
      lastUsedAt: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(keys, { headers: { [REQUEST_ID_HEADER]: rid } });
}

export async function POST(req: NextRequest) {
  const rid = requestId();
  const headers = { [REQUEST_ID_HEADER]: rid };

  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx)
    return NextResponse.json(
      { error: "No active team" },
      { status: 404, headers },
    );

  const rl = await rateLimit(ctx.userId, RATE_LIMITS.apiKeys);
  if (!rl.allowed) return rateLimitResponse(rl);

  const quotaResult = await checkQuota(ctx.userId, "api_keys");
  if (!quotaResult.allowed) return quotaExceededResponse(quotaResult);

  const body = (await req.json()) as {
    name?: string;
    projectId?: string;
    scopes?: string[];
  };

  if (!body.name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400, headers },
    );
  }

  const scopes = body.scopes ?? ["complete", "read"];
  const invalidScopes = scopes.filter((s) => !ALLOWED_SCOPES.includes(s));
  if (invalidScopes.length > 0) {
    return NextResponse.json(
      {
        error: "invalid_scopes",
        invalid: invalidScopes,
        allowed: ALLOWED_SCOPES,
      },
      { status: 400, headers },
    );
  }

  const { raw, prefix, hash } = generateApiKey();

  const apiKey = await prisma.apiKey.create({
    data: {
      userId: ctx.userId,
      teamId: ctx.teamId,
      name: body.name,
      keyHash: hash,
      prefix,
      projectId: body.projectId ?? null,
      scopes,
    },
  });

  logAudit({
    userId: ctx.userId,
    resource: "api_key",
    action: "created",
    resourceId: apiKey.id,
    success: true,
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  }).catch(() => {});

  dispatchWebhook(ctx.userId, "api_key.created", {
    api_key_id: apiKey.id,
    name: apiKey.name,
    scopes: apiKey.scopes,
    project_id: apiKey.projectId,
  }).catch(() => {});

  return NextResponse.json({ ...apiKey, key: raw }, { status: 201, headers });
}
