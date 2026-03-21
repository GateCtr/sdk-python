import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, requireScope, ApiAuthError } from "@/lib/api-auth";
import { checkBudget, recordBudgetUsage } from "@/lib/firewall";
import { checkRateLimits } from "@/lib/rate-limiter";
import { optimize } from "@/lib/optimizer";
import { route } from "@/lib/router";
import { decrypt } from "@/lib/encryption";
import { dispatchWebhook } from "@/lib/webhooks";
import { ProviderError } from "@/lib/llm/types";
import type { GatewayRequest } from "@/lib/llm/types";
import * as openai from "@/lib/llm/openai";
import * as anthropic from "@/lib/llm/anthropic";
import * as mistral from "@/lib/llm/mistral";
import * as gemini from "@/lib/llm/gemini";
import { randomBytes } from "crypto";

const MAX_BODY_BYTES = 1_048_576; // 1 MB
const MODEL_INJECTION_RE = /[\n\r\0]/;

function requestId(): string {
  return randomBytes(8).toString("hex");
}

type Adapter = { complete: typeof openai.complete; chat: typeof openai.chat };

function getAdapter(provider: string): Adapter | null {
  switch (provider) {
    case "openai":
      return openai;
    case "anthropic":
      return anthropic;
    case "mistral":
      return mistral;
    case "gemini":
      return gemini;
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const rid = requestId();
  const baseHeaders: Record<string, string> = {
    "X-GateCtr-Request-Id": rid,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };

  // ── 1. Size limit ────────────────────────────────────────────────────────────
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "payload_too_large" },
      { status: 413, headers: baseHeaders },
    );
  }

  let body: {
    model?: string;
    prompt?: string;
    max_tokens?: number;
    temperature?: number;
    stream?: boolean;
    projectId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400, headers: baseHeaders },
    );
  }

  // ── 2. Auth — API key first, fall back to Clerk session ──────────────────────
  let userId: string;
  let apiKeyId: string | null = null;
  let scopes: string[] = [];
  let projectId: string | undefined = body.projectId;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer gct_")) {
    try {
      const ctx = await authenticateApiKey(req);
      userId = ctx.userId;
      apiKeyId = ctx.apiKeyId;
      scopes = ctx.scopes;
      projectId = projectId ?? ctx.projectId;
    } catch (err) {
      if (err instanceof ApiAuthError) {
        return NextResponse.json(
          { error: err.code },
          { status: err.httpStatus, headers: baseHeaders },
        );
      }
      return NextResponse.json(
        { error: "internal_error" },
        { status: 500, headers: baseHeaders },
      );
    }
  } else {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "missing_api_key" },
        { status: 401, headers: baseHeaders },
      );

    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: baseHeaders },
      );

    userId = dbUser.id;
    scopes = ["complete", "chat", "read", "admin"]; // session auth has full scopes
  }

  // ── 3. Scope check ───────────────────────────────────────────────────────────
  try {
    requireScope(scopes, "complete");
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json(
        { error: err.code, required: "complete" },
        { status: 403, headers: baseHeaders },
      );
    }
  }

  // ── 4. Validate model ────────────────────────────────────────────────────────
  if (!body.model) {
    return NextResponse.json(
      { error: "model is required" },
      { status: 400, headers: baseHeaders },
    );
  }
  if (MODEL_INJECTION_RE.test(body.model)) {
    return NextResponse.json(
      { error: "invalid_model" },
      { status: 400, headers: baseHeaders },
    );
  }

  const modelRecord = await prisma.modelCatalog.findUnique({
    where: { modelId: body.model },
    include: { provider: true },
  });
  if (!modelRecord || !modelRecord.isActive) {
    return NextResponse.json(
      { error: "unknown_model" },
      { status: 400, headers: baseHeaders },
    );
  }

  // ── 5. Provider active check ─────────────────────────────────────────────────
  if (!modelRecord.provider.isActive) {
    return NextResponse.json(
      { error: "provider_disabled" },
      { status: 503, headers: baseHeaders },
    );
  }

  // ── 6. Budget check ──────────────────────────────────────────────────────────
  const budgetResult = await checkBudget(userId, projectId);
  if (!budgetResult.allowed) {
    return NextResponse.json(
      {
        error: "budget_exceeded",
        scope: budgetResult.scope,
        limit: budgetResult.limit,
        current: budgetResult.current,
      },
      { status: 429, headers: baseHeaders },
    );
  }

  // ── 7. Rate limit ────────────────────────────────────────────────────────────
  const rlResult = await checkRateLimits(apiKeyId ?? userId, projectId, userId);
  if (!rlResult.allowed) {
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        limit: rlResult.limit,
        remaining: rlResult.remaining,
        reset_at: rlResult.resetAt,
      },
      {
        status: 429,
        headers: {
          ...baseHeaders,
          "X-RateLimit-Limit": String(rlResult.limit),
          "X-RateLimit-Remaining": String(rlResult.remaining),
          "X-RateLimit-Reset": String(rlResult.resetAt),
          "Retry-After": String(
            Math.max(0, rlResult.resetAt - Math.floor(Date.now() / 1000)),
          ),
        },
      },
    );
  }

  // ── 8–9. Optimizer + Router ──────────────────────────────────────────────────
  const dbUser2 = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  const planLimits = await prisma.planLimit.findFirst({
    where: { plan: { name: dbUser2?.plan ?? "FREE" } },
    select: { contextOptimizerEnabled: true, modelRouterEnabled: true },
  });

  let gatewayReq: GatewayRequest = {
    model: body.model,
    prompt: body.prompt,
    maxTokens: body.max_tokens,
    temperature: body.temperature,
    stream: body.stream,
    projectId,
  };

  let savedTokens = 0;
  let optimized = false;
  if (planLimits?.contextOptimizerEnabled) {
    const result = await optimize(gatewayReq);
    gatewayReq = result.request;
    savedTokens = result.savedTokens;
    optimized = savedTokens > 0;
  }

  let routed = false;
  if (planLimits?.modelRouterEnabled) {
    const result = await route(gatewayReq);
    gatewayReq = { ...gatewayReq, model: result.model };
    routed = result.routed;
  }

  // ── 10. Resolve provider key ─────────────────────────────────────────────────
  const providerName = modelRecord.provider.provider;
  const providerKey = await prisma.lLMProviderKey.findFirst({
    where: { userId, provider: providerName, isActive: true },
    orderBy: { lastUsedAt: "desc" },
  });
  if (!providerKey) {
    return NextResponse.json(
      { error: "no_provider_key", provider: providerName },
      { status: 422, headers: baseHeaders },
    );
  }

  const decryptedKey = decrypt(providerKey.encryptedApiKey);

  // ── 11. Forward with retry ───────────────────────────────────────────────────
  const adapter = getAdapter(providerName);
  if (!adapter) {
    return NextResponse.json(
      { error: "provider_disabled" },
      { status: 503, headers: baseHeaders },
    );
  }

  const { maxRetries, retryDelay } = modelRecord.provider;
  let lastError: Error | null = null;
  let llmResponse = null;
  let usedFallback = false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      llmResponse = await adapter.complete(gatewayReq, decryptedKey);
      break;
    } catch (err) {
      lastError = err as Error;
      if (err instanceof ProviderError && !err.retryable) break;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelay * attempt));
      }
    }
  }

  // ── 12. Fallback provider ────────────────────────────────────────────────────
  if (!llmResponse) {
    // Try fallback: find another active provider key for a different provider
    const fallbackKey = await prisma.lLMProviderKey.findFirst({
      where: { userId, isActive: true, provider: { not: providerName } },
    });
    if (fallbackKey) {
      const fallbackAdapter = getAdapter(fallbackKey.provider);
      if (fallbackAdapter) {
        try {
          llmResponse = await fallbackAdapter.complete(
            { ...gatewayReq, model: gatewayReq.model },
            decrypt(fallbackKey.encryptedApiKey),
          );
          usedFallback = true;
        } catch (err) {
          lastError = err as Error;
        }
      }
    }
  }

  if (!llmResponse) {
    const isProviderErr = lastError instanceof ProviderError;
    return NextResponse.json(
      {
        error: "provider_unavailable",
        provider: providerName,
        ...(isProviderErr && { status: (lastError as ProviderError).status }),
        retries_attempted: maxRetries,
      },
      { status: 502, headers: baseHeaders },
    );
  }

  // ── 13. Build response ───────────────────────────────────────────────────────
  const costUsd =
    (llmResponse.promptTokens * modelRecord.inputCostPer1kTokens +
      llmResponse.completionTokens * modelRecord.outputCostPer1kTokens) /
    1000;

  const responseHeaders: Record<string, string> = {
    ...baseHeaders,
    "X-GateCtr-Latency-Ms": String(llmResponse.latencyMs),
  };
  if (budgetResult.overage) responseHeaders["X-GateCtr-Overage"] = "true";

  // ── 14–16. Fire-and-forget side effects ──────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;

  prisma.usageLog
    .create({
      data: {
        userId,
        projectId: projectId ?? null,
        apiKeyId: apiKeyId ?? null,
        model: gatewayReq.model,
        provider: usedFallback
          ? ((
              await prisma.lLMProviderKey.findFirst({
                where: {
                  userId,
                  isActive: true,
                  provider: { not: providerName },
                },
              })
            )?.provider ?? providerName)
          : providerName,
        promptTokens: llmResponse.promptTokens,
        completionTokens: llmResponse.completionTokens,
        totalTokens: llmResponse.totalTokens,
        savedTokens,
        costUsd,
        latencyMs: llmResponse.latencyMs,
        statusCode: 200,
        optimized,
        routed,
        fallback: usedFallback,
        ipAddress: ip,
      },
    })
    .catch(() => {});

  recordBudgetUsage(userId, projectId, llmResponse.totalTokens, costUsd).catch(
    () => {},
  );

  dispatchWebhook(userId, "request.completed", {
    model: gatewayReq.model,
    provider: providerName,
    prompt_tokens: llmResponse.promptTokens,
    completion_tokens: llmResponse.completionTokens,
    total_tokens: llmResponse.totalTokens,
    cost_usd: costUsd,
    latency_ms: llmResponse.latencyMs,
    project_id: projectId,
  }).catch(() => {});

  return NextResponse.json(
    {
      id: llmResponse.id || `cmpl_${rid}`,
      object: "text_completion",
      model: gatewayReq.model,
      choices: [
        { text: llmResponse.content, finish_reason: llmResponse.finishReason },
      ],
      usage: {
        prompt_tokens: llmResponse.promptTokens,
        completion_tokens: llmResponse.completionTokens,
        total_tokens: llmResponse.totalTokens,
      },
    },
    { headers: responseHeaders },
  );
}
