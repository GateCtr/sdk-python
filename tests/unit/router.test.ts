/**
 * Unit Tests — Model Router
 * Task 15.2 from business-modules-core spec
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyComplexity, route } from "@/lib/router";
import type { GatewayRequest } from "@/lib/llm/types";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lLMProviderKey: { findMany: vi.fn() },
    modelCatalog: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
  },
}));

beforeEach(() => vi.clearAllMocks());

// ── Complexity classification boundaries ──────────────────────────────────────
// classifyComplexity takes a GatewayRequest — char count is derived from prompt/messages content.
// We build requests with prompts of exact length to test boundaries.

function makeReqWithChars(n: number): GatewayRequest {
  return { model: "gpt-4", prompt: "a".repeat(n) };
}

describe("classifyComplexity — boundary values", () => {
  it("199 chars → 'low'", () => {
    expect(classifyComplexity(makeReqWithChars(199))).toBe("low");
  });

  it("200 chars → 'medium'", () => {
    expect(classifyComplexity(makeReqWithChars(200))).toBe("medium");
  });

  it("2000 chars → 'medium'", () => {
    expect(classifyComplexity(makeReqWithChars(2000))).toBe("medium");
  });

  it("2001 chars → 'high'", () => {
    expect(classifyComplexity(makeReqWithChars(2001))).toBe("high");
  });

  it("0 chars → 'low'", () => {
    expect(classifyComplexity(makeReqWithChars(0))).toBe("low");
  });

  it("very large count → 'high'", () => {
    expect(classifyComplexity(makeReqWithChars(100000))).toBe("high");
  });
});

// ── Scoring formula ───────────────────────────────────────────────────────────

describe("Routing score formula", () => {
  /**
   * score = (0.6 * normCost) + (0.4 * normLatency) - (complexityMatch * 0.3)
   * With a single candidate, min=max so normCost=normLatency=0 → score = -match*0.3
   */
  it("selects the cheapest model when costs differ", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.lLMProviderKey.findMany).mockResolvedValue([
      { provider: "openai" } as never,
      { provider: "anthropic" } as never,
    ]);
    vi.mocked(prisma.modelCatalog.findMany).mockResolvedValue([
      {
        modelId: "gpt-3.5-turbo",
        inputCostPer1kTokens: 0.001,
        avgLatencyMs: 500,
        contextWindow: 16000,
      },
      {
        modelId: "gpt-4",
        inputCostPer1kTokens: 0.03,
        avgLatencyMs: 1000,
        contextWindow: 128000,
      },
    ] as never);

    const req: GatewayRequest = { model: "gpt-4", prompt: "Hi" };
    const result = await route(req, "user-1");

    // gpt-3.5-turbo has lower cost and latency → lower score → selected
    expect(result.model).toBe("gpt-3.5-turbo");
    expect(result.routed).toBe(true);
  });

  it("returns original model with routed=false when no active provider keys", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.lLMProviderKey.findMany).mockResolvedValue([] as never);

    const req: GatewayRequest = { model: "gpt-4", prompt: "Hi" };
    const result = await route(req, "user-1");

    expect(result.model).toBe("gpt-4");
    expect(result.routed).toBe(false);
  });

  it("returns original model with routed=false when no catalog entries", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.lLMProviderKey.findMany).mockResolvedValue([
      { provider: "openai" } as never,
    ]);
    vi.mocked(prisma.modelCatalog.findMany).mockResolvedValue([] as never);

    const req: GatewayRequest = { model: "gpt-4", prompt: "Hi" };
    const result = await route(req, "user-1");

    expect(result.model).toBe("gpt-4");
    expect(result.routed).toBe(false);
  });

  it("routed=false when selected model equals requested model", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.lLMProviderKey.findMany).mockResolvedValue([
      { provider: "openai" } as never,
    ]);
    // Only one candidate — same as requested model
    vi.mocked(prisma.modelCatalog.findMany).mockResolvedValue([
      {
        modelId: "gpt-4",
        inputCostPer1kTokens: 0.03,
        avgLatencyMs: 1000,
        contextWindow: 128000,
      },
    ] as never);

    const req: GatewayRequest = { model: "gpt-4", prompt: "Hi" };
    const result = await route(req, "user-1");

    expect(result.model).toBe("gpt-4");
    expect(result.routed).toBe(false);
  });

  it("scoringDurationMs is a non-negative number", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.lLMProviderKey.findMany).mockResolvedValue([] as never);

    const req: GatewayRequest = { model: "gpt-4", prompt: "Hi" };
    const result = await route(req, "user-1");

    expect(result.scoringDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns original model on unhandled error (never throws)", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.lLMProviderKey.findMany).mockRejectedValueOnce(
      new Error("DB down"),
    );

    const req: GatewayRequest = { model: "gpt-4", prompt: "Hi" };
    const result = await route(req, "user-1");

    expect(result.model).toBe("gpt-4");
    expect(result.routed).toBe(false);
  });
});

// ── Redis cache ───────────────────────────────────────────────────────────────

describe("Router Redis cache", () => {
  it("uses cached catalog when available (skips DB)", async () => {
    const { redis } = await import("@/lib/redis");
    const { prisma } = await import("@/lib/prisma");

    const cachedCandidates = [
      {
        modelId: "gpt-3.5-turbo",
        inputCostPer1kTokens: 0.001,
        avgLatencyMs: 500,
        contextWindow: 16000,
      },
    ];
    vi.mocked(redis.get).mockResolvedValueOnce(cachedCandidates as never);

    const req: GatewayRequest = { model: "gpt-4", prompt: "Hi" };
    await route(req, "user-1");

    // DB should NOT be called when cache hits
    expect(prisma.lLMProviderKey.findMany).not.toHaveBeenCalled();
  });
});
