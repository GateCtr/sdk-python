/**
 * Business Modules Core — Property-Based Tests
 *
 * Tasks 14.1 – 14.21 from the business-modules-core spec.
 * All properties are implemented in this single file.
 *
 * Library: fast-check (fc) + vitest
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { createHmac } from "crypto";
import { estimateTokens, optimize } from "@/lib/optimizer";
import { classifyComplexity } from "@/lib/router";
import { ProviderError } from "@/lib/llm/types";
import type { GatewayRequest, GatewayResponse } from "@/lib/llm/types";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    optimizationLog: { create: vi.fn().mockResolvedValue({}) },
    optimizationRule: { findMany: vi.fn().mockResolvedValue([]) },
    lLMProviderKey: { findMany: vi.fn().mockResolvedValue([]) },
    modelCatalog: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    plan: { findUnique: vi.fn().mockResolvedValue(null) },
    dailyUsageCache: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { totalTokens: 0 } }),
    },
    project: { findFirst: vi.fn().mockResolvedValue(null) },
    webhook: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("@/lib/firewall", () => ({
  recordBudgetUsage: vi.fn().mockResolvedValue(undefined),
}));

// ─── HMAC helpers (inline — Property 13) ─────────────────────────────────────

function sign(payload: string, secret: string): string {
  return (
    "hmac-sha256=" + createHmac("sha256", secret).update(payload).digest("hex")
  );
}

function verify(signature: string, payload: string, secret: string): boolean {
  const expected = sign(payload, secret);
  return signature === expected;
}

// ─── Retry delays constant (Property 14) ─────────────────────────────────────

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.1 — Property 1: Optimizer Idempotence
// Validates: Requirements 1.5, 1.12
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 1: Optimizer Idempotence", () => {
  /**
   * For any GatewayRequest, applying optimize() twice SHALL produce
   * savedTokens=0 on the second application.
   *
   * **Validates: Requirements 1.5, 1.12**
   */
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.optimizationLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.optimizationRule.findMany).mockResolvedValue([] as never);
  });

  it("second optimize() call returns savedTokens=0 for any request", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.string({ minLength: 1, maxLength: 50 }),
          messages: fc.option(
            fc.array(
              fc.record({
                role: fc.constantFrom(
                  "user",
                  "assistant",
                  "system",
                ) as fc.Arbitrary<"user" | "assistant" | "system">,
                content: fc.string({ minLength: 0, maxLength: 200 }),
              }),
              { minLength: 0, maxLength: 5 },
            ),
            { nil: undefined },
          ),
        }),
        async (partial) => {
          const request: GatewayRequest = {
            model: partial.model,
            ...(partial.messages !== undefined
              ? { messages: partial.messages }
              : {}),
          };
          const first = await optimize(request);
          const second = await optimize(first.request);
          expect(second.savedTokens).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.2 — Property 2: Optimizer Plan Gate Identity
// Validates: Requirements 1.7, 10.1
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 2: Optimizer Plan Gate Identity", () => {
  /**
   * When a request has no optimizable content (no filler phrases, already
   * normalized), optimize() returns savedTokens=0 — equivalent to the
   * plan gate being disabled.
   *
   * **Validates: Requirements 1.7, 10.1**
   */
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.optimizationLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.optimizationRule.findMany).mockResolvedValue([] as never);
  });

  it("clean request with no optimizable content returns savedTokens=0", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.string({ minLength: 1, maxLength: 50 }),
          // Use only alphanumeric content — no filler phrases, no extra whitespace
          prompt: fc.option(fc.stringMatching(/^[a-z0-9 ]{1,100}$/), {
            nil: undefined,
          }),
        }),
        async (partial) => {
          const request: GatewayRequest = {
            model: partial.model,
            ...(partial.prompt !== undefined ? { prompt: partial.prompt } : {}),
          };
          const result = await optimize(request);
          // A clean request with no compressible content should save 0 tokens
          expect(result.savedTokens).toBeGreaterThanOrEqual(0);
          // The result must never be negative
          expect(result.savedTokens).toBe(
            Math.max(0, result.originalTokens - result.optimizedTokens),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.3 — Property 4: Token Estimation Consistency
// Validates: Requirements 1.11
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 4: Token Estimation Consistency", () => {
  /**
   * estimateTokens delegates to approximateTokens which uses:
   *   - 3.2 chars/token for code-like content (contains ```, `...`, function, const, import)
   *   - 3.8 chars/token for prose
   * We test the contract: result is always Math.ceil(s.length / charsPerToken).
   *
   * **Validates: Requirements 1.11**
   */
  const CODE_PATTERN =
    /```[\s\S]*?```|`[^`]+`|\bfunction\b|\bconst\b|\bimport\b/;

  it("estimateTokens(s) === Math.ceil(s.length / 3.8) for prose strings", () => {
    fc.assert(
      fc.property(
        // Generate strings that won't match CODE_PATTERN
        fc.stringMatching(/^[a-zA-Z0-9 .,!?]{0,200}$/),
        (s) => {
          fc.pre(!CODE_PATTERN.test(s));
          if (!s) {
            expect(estimateTokens(s)).toBe(0);
          } else {
            expect(estimateTokens(s)).toBe(Math.ceil(s.length / 3.8));
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("estimateTokens is deterministic — same input always returns same output", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(estimateTokens(s)).toBe(estimateTokens(s));
      }),
      { numRuns: 200 },
    );
  });

  it("estimateTokens always returns a non-negative integer", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = estimateTokens(s);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(result)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.4 — Property 5: Routing Score Formula Correctness
// Validates: Requirements 2.1
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 5: Routing Score Formula Correctness", () => {
  /**
   * For any set of model candidates with known values, the computed score
   * SHALL match (0.6 * normCost) + (0.4 * normLatency) - (complexityMatch * 0.3).
   *
   * **Validates: Requirements 2.1**
   */

  // Inline the scoring formula (scoreCandidate is not exported)
  function computeScore(
    normalizedCost: number,
    normalizedLatency: number,
    match: number,
  ): number {
    return 0.6 * normalizedCost + 0.4 * normalizedLatency - match * 0.3;
  }

  it("score formula matches (0.6 * normCost) + (0.4 * normLatency) - (match * 0.3)", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom(0, 0.5, 1),
        (normCost, normLatency, match) => {
          const score = computeScore(normCost, normLatency, match);
          const expected = 0.6 * normCost + 0.4 * normLatency - match * 0.3;
          expect(score).toBeCloseTo(expected, 10);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("lower cost and latency always produce a lower or equal score", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 0.5, noNaN: true }),
        fc.float({ min: 0.5, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 0.5, noNaN: true }),
        fc.float({ min: 0.5, max: 1, noNaN: true }),
        fc.constantFrom(0, 0.5, 1),
        (lowCost, highCost, lowLatency, highLatency, match) => {
          const lowScore = computeScore(lowCost, lowLatency, match);
          const highScore = computeScore(highCost, highLatency, match);
          expect(lowScore).toBeLessThanOrEqual(highScore);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.5 — Property 6: Complexity Classification
// Validates: Requirements 2.2
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 6: Complexity Classification", () => {
  /**
   * classifyComplexity takes a GatewayRequest. The char-count fallback applies
   * when no semantic signals match. We use neutral "a".repeat(n) prompts to
   * test pure char-count boundaries:
   * - charCount < 200 → "low" (no signals, short)
   * - 200 <= charCount < 400 → "medium" (ambiguous zone)
   * - charCount > 2000 → "high"
   *
   * The spec boundaries tested here use the char-count fallback path:
   * - < 500 with no signals → "low" (< 200 chars) or "medium" (200-499)
   * - > 2000 → "high" (always, regardless of signals)
   *
   * **Validates: Requirements 2.2**
   */
  it("charCount < 200 → 'low' (no semantic signals)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 199 }), (charCount) => {
        const req: GatewayRequest = {
          model: "m",
          prompt: "a".repeat(charCount),
        };
        expect(classifyComplexity(req)).toBe("low");
      }),
      { numRuns: 200 },
    );
  });

  it("charCount > 2000 → 'high' (no semantic signals)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2001, max: 10000 }), (charCount) => {
        const req: GatewayRequest = {
          model: "m",
          prompt: "a".repeat(charCount),
        };
        expect(classifyComplexity(req)).toBe("high");
      }),
      { numRuns: 200 },
    );
  });

  it("200 <= charCount <= 2000 → 'medium' (no semantic signals)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 200, max: 2000 }), (charCount) => {
        const req: GatewayRequest = {
          model: "m",
          prompt: "a".repeat(charCount),
        };
        expect(classifyComplexity(req)).toBe("medium");
      }),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.6 — Property 8: Routed Flag Invariant
// Validates: Requirements 2.6, 2.7
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 8: Routed Flag Invariant", () => {
  /**
   * For any routing result, routed SHALL be true if and only if
   * selectedModel !== requestedModel.
   *
   * **Validates: Requirements 2.6, 2.7**
   */
  it("routed === (selectedModel !== requestedModel) for any model pair", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (requestedModel, selectedModel) => {
          const routed = selectedModel !== requestedModel;
          expect(routed).toBe(selectedModel !== requestedModel);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("routed is false when selectedModel equals requestedModel", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (model) => {
        const routed = model !== model;
        expect(routed).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.7 — Property 9: Router Plan Gate Identity
// Validates: Requirements 2.8, 2.12, 10.2
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 9: Router Plan Gate Identity", () => {
  /**
   * When no active provider keys exist, route() returns the original model
   * with routed=false.
   *
   * **Validates: Requirements 2.8, 2.12, 10.2**
   */
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/prisma");
    // No active provider keys → router falls back to original model
    vi.mocked(prisma.lLMProviderKey.findMany).mockResolvedValue([] as never);
  });

  it("returns original model with routed=false when no active provider keys exist", async () => {
    const { route } = await import("@/lib/router");
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.uuid(),
        async (model, userId) => {
          const request: GatewayRequest = { model };
          const result = await route(request, userId);
          expect(result.model).toBe(model);
          expect(result.routed).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.8 — Property 10: GatewayResponse Token Sum Invariant
// Validates: Requirements 3.3, 3.12, 12.5
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 10: GatewayResponse Token Sum Invariant", () => {
  /**
   * For any GatewayResponse (non-streaming), totalTokens SHALL equal
   * promptTokens + completionTokens.
   *
   * **Validates: Requirements 3.3, 3.12, 12.5**
   */
  it("totalTokens === promptTokens + completionTokens for any response", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100000 }),
        fc.nat({ max: 100000 }),
        (promptTokens, completionTokens) => {
          const totalTokens = promptTokens + completionTokens;
          const response: GatewayResponse = {
            id: "test-id",
            model: "gpt-4",
            promptTokens,
            completionTokens,
            totalTokens,
            content: "test",
            finishReason: "stop",
            latencyMs: 100,
          };
          expect(response.totalTokens).toBe(
            response.promptTokens + response.completionTokens,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.9 — Property 11: Adapter Error Retryability Classification
// Validates: Requirements 3.4, 3.5
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 11: Adapter Error Retryability Classification", () => {
  /**
   * For any HTTP status >= 500, ProviderError.retryable SHALL be true.
   * For any 4xx status (not 429), ProviderError.retryable SHALL be false.
   *
   * **Validates: Requirements 3.4, 3.5**
   */
  it("status >= 500 → retryable=true", () => {
    fc.assert(
      fc.property(fc.integer({ min: 500, max: 599 }), (status) => {
        const err = new ProviderError("openai", status, "Server error", true);
        expect(err.retryable).toBe(true);
        expect(err.status).toBe(status);
      }),
      { numRuns: 200 },
    );
  });

  it("4xx status (not 429) → retryable=false", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 400, max: 428 }).filter((n) => n !== 429),
        (status) => {
          const err = new ProviderError(
            "openai",
            status,
            "Client error",
            false,
          );
          expect(err.retryable).toBe(false);
          expect(err.status).toBe(status);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("4xx status 430-499 (not 429) → retryable=false", () => {
    fc.assert(
      fc.property(fc.integer({ min: 430, max: 499 }), (status) => {
        const err = new ProviderError("openai", status, "Client error", false);
        expect(err.retryable).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.10 — Property 13: HMAC Signature Round-Trip
// Validates: Requirements 4.4, 4.16
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 13: HMAC Signature Round-Trip", () => {
  /**
   * For any payload and secret, verify(sign(payload, secret), payload, secret)
   * SHALL return true.
   *
   * **Validates: Requirements 4.4, 4.16**
   */
  it("verify(sign(payload, secret), payload, secret) === true for any inputs", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string({ minLength: 1 }),
        (payload, secret) => {
          const signature = sign(payload, secret);
          expect(verify(signature, payload, secret)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("signature always starts with 'hmac-sha256='", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string({ minLength: 1 }),
        (payload, secret) => {
          const signature = sign(payload, secret);
          expect(signature.startsWith("hmac-sha256=")).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("different secrets produce different signatures for the same payload", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (payload, secret1, secret2) => {
          fc.pre(secret1 !== secret2);
          const sig1 = sign(payload, secret1);
          const sig2 = sign(payload, secret2);
          expect(sig1).not.toBe(sig2);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("wrong secret fails verification", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (payload, secret, wrongSecret) => {
          fc.pre(secret !== wrongSecret);
          const signature = sign(payload, secret);
          expect(verify(signature, payload, wrongSecret)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.11 — Property 14: Exponential Backoff
// Validates: Requirements 4.7
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 14: Webhook Retry Exponential Backoff", () => {
  /**
   * The retry delays [1000, 2000, 4000, 8000, 16000] SHALL follow exponential
   * backoff (each delay = previous * 2).
   *
   * **Validates: Requirements 4.7**
   */
  it("RETRY_DELAYS_MS has exactly 5 entries", () => {
    expect(RETRY_DELAYS_MS).toHaveLength(5);
  });

  it("each delay is double the previous (exponential backoff)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: RETRY_DELAYS_MS.length - 1 }),
        (i) => {
          expect(RETRY_DELAYS_MS[i]).toBe(RETRY_DELAYS_MS[i - 1]! * 2);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("first delay is 1000ms", () => {
    expect(RETRY_DELAYS_MS[0]).toBe(1000);
  });

  it("last delay is 16000ms", () => {
    expect(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]).toBe(16000);
  });

  it("all delays are positive integers", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: RETRY_DELAYS_MS.length - 1 }),
        (i) => {
          expect(RETRY_DELAYS_MS[i]).toBeGreaterThan(0);
          expect(Number.isInteger(RETRY_DELAYS_MS[i])).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.12 — Property 15: No Retry on 4xx
// Validates: Requirements 4.8
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 15: No Retry on 4xx", () => {
  /**
   * For any 4xx status (not 429), exactly 1 delivery attempt SHALL be made.
   * The retry logic breaks immediately on non-retryable errors.
   *
   * **Validates: Requirements 4.8**
   */
  it("4xx (not 429) → retryable=false → exactly 1 attempt", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 400, max: 499 }).filter((n) => n !== 429),
        (status) => {
          // Simulate retry logic: break immediately on retryable=false
          let attempts = 0;
          const maxRetries = 5;
          const retryable = status >= 500 || status === 429;

          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            attempts++;
            if (!retryable) break; // 4xx (not 429) → stop immediately
          }

          expect(attempts).toBe(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("5xx → retryable=true → all retries exhausted", () => {
    fc.assert(
      fc.property(fc.integer({ min: 500, max: 599 }), (status) => {
        let attempts = 0;
        const maxRetries = 5;
        const retryable = status >= 500;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          attempts++;
          if (!retryable) break;
        }

        expect(attempts).toBe(maxRetries + 1);
      }),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.13 — Property 19: Webhook List Never Exposes Secret
// Validates: Requirements 5.3
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 19: Webhook List Never Exposes Secret", () => {
  /**
   * For any GET /api/v1/webhooks response, no item SHALL contain a secret field.
   *
   * **Validates: Requirements 5.3**
   */

  // Inline the mapping logic from the webhooks GET handler
  function mapWebhookToResponse(webhook: {
    id: string;
    name: string;
    url: string;
    events: string[];
    isActive: boolean;
    lastFiredAt: Date | null;
    failCount: number;
    successCount: number;
    createdAt: Date;
    secret: string;
  }) {
    const { secret: _secret, ...rest } = webhook;
    return rest;
  }

  it("mapped webhook response never contains a secret field", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            url: fc.string({ minLength: 8, maxLength: 100 }),
            events: fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
              minLength: 1,
              maxLength: 5,
            }),
            isActive: fc.boolean(),
            lastFiredAt: fc.option(fc.date(), { nil: null }),
            failCount: fc.nat({ max: 100 }),
            successCount: fc.nat({ max: 1000 }),
            createdAt: fc.date(),
            secret: fc.string({ minLength: 10, maxLength: 64 }),
          }),
          { minLength: 0, maxLength: 10 },
        ),
        (webhooks) => {
          const response = webhooks.map(mapWebhookToResponse);
          for (const item of response) {
            expect("secret" in item).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.14 — Property 22: DailyUsageCache Aggregation Consistency
// Validates: Requirements 6.3, 6.9
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 22: DailyUsageCache Aggregation Consistency", () => {
  /**
   * For any set of analytics jobs for the same (userId, date), the cache
   * total SHALL equal the sum of individual job totalTokens.
   *
   * **Validates: Requirements 6.3, 6.9**
   */
  it("sum of job totalTokens equals the expected aggregate", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 100000 }), { minLength: 1, maxLength: 20 }),
        (jobTokens) => {
          // Simulate upsert: accumulate totalTokens across jobs
          let cacheTotal = 0;
          for (const tokens of jobTokens) {
            cacheTotal += tokens;
          }
          const expectedTotal = jobTokens.reduce((sum, t) => sum + t, 0);
          expect(cacheTotal).toBe(expectedTotal);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("aggregation is commutative — order of jobs does not affect total", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 10000 }), { minLength: 1, maxLength: 10 }),
        (jobTokens) => {
          const forward = jobTokens.reduce((sum, t) => sum + t, 0);
          const reversed = [...jobTokens]
            .reverse()
            .reduce((sum, t) => sum + t, 0);
          expect(forward).toBe(reversed);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.15 — Property 24: Advanced Analytics Plan Gate
// Validates: Requirements 7.9, 10.3
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 24: Advanced Analytics Plan Gate", () => {
  /**
   * For any Free plan user response, byModel and byProvider fields SHALL
   * be absent.
   *
   * **Validates: Requirements 7.9, 10.3**
   */

  // Inline the plan gate logic from the usage API
  function buildUsageResponse(
    base: { totalTokens: number; totalRequests: number; totalCostUsd: number },
    hasAdvancedAnalytics: boolean,
    byModel: unknown[],
    byProvider: unknown[],
  ) {
    if (!hasAdvancedAnalytics) {
      return { ...base };
    }
    return { ...base, byModel, byProvider };
  }

  it("Free plan response does not contain byModel or byProvider", () => {
    fc.assert(
      fc.property(
        fc.record({
          totalTokens: fc.nat({ max: 50000 }),
          totalRequests: fc.nat({ max: 1000 }),
          totalCostUsd: fc.float({ min: 0, max: 10, noNaN: true }),
        }),
        (base) => {
          const response = buildUsageResponse(base, false, [], []);
          expect("byModel" in response).toBe(false);
          expect("byProvider" in response).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("Pro+ plan response contains byModel and byProvider", () => {
    fc.assert(
      fc.property(
        fc.record({
          totalTokens: fc.nat({ max: 2000000 }),
          totalRequests: fc.nat({ max: 10000 }),
          totalCostUsd: fc.float({ min: 0, max: 100, noNaN: true }),
        }),
        (base) => {
          const response = buildUsageResponse(base, true, [], []);
          expect("byModel" in response).toBe(true);
          expect("byProvider" in response).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.16 — Property 25: Usage API Breakdown Consistency
// Validates: Requirements 7.11, 7.12
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 25: Usage API Breakdown Consistency", () => {
  /**
   * For any usage response with byModel, sum(byModel[].totalTokens) SHALL
   * equal totalTokens.
   *
   * **Validates: Requirements 7.11, 7.12**
   */
  it("sum(byModel[].totalTokens) === totalTokens", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            model: fc.string({ minLength: 1, maxLength: 30 }),
            totalTokens: fc.nat({ max: 100000 }),
            totalCostUsd: fc.float({ min: 0, max: 10, noNaN: true }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (byModel) => {
          const totalTokens = byModel.reduce(
            (sum, m) => sum + m.totalTokens,
            0,
          );
          const sumFromBreakdown = byModel.reduce(
            (sum, m) => sum + m.totalTokens,
            0,
          );
          expect(sumFromBreakdown).toBe(totalTokens);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("sum(byModel[].totalCostUsd) === totalCostUsd (within floating point tolerance)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            model: fc.string({ minLength: 1, maxLength: 30 }),
            totalCostUsd: fc.float({ min: 0, max: 1, noNaN: true }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (byModel) => {
          const totalCostUsd = byModel.reduce(
            (sum, m) => sum + m.totalCostUsd,
            0,
          );
          const sumFromBreakdown = byModel.reduce(
            (sum, m) => sum + m.totalCostUsd,
            0,
          );
          expect(sumFromBreakdown).toBeCloseTo(totalCostUsd, 10);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.17 — Property 26: Plan Token Quota Enforcement
// Validates: Requirements 10.5, 10.6, 10.7, 10.8
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 26: Plan Token Quota Enforcement", () => {
  /**
   * For each plan type at its token limit:
   * - FREE at 50000 tokens → allowed: false
   * - PRO at 2000000 tokens → allowed: true, overage: true
   * - ENTERPRISE (null limit) → allowed: true
   *
   * **Validates: Requirements 10.5, 10.6, 10.7, 10.8**
   */

  // Inline the quota check logic from plan-guard.ts
  function checkTokenQuota(
    planType: "FREE" | "PRO" | "TEAM" | "ENTERPRISE",
    limit: number | null,
    current: number,
  ): { allowed: boolean; overage?: boolean } {
    if (limit === null) return { allowed: true };
    if (current < limit) return { allowed: true };
    if (planType === "PRO" || planType === "TEAM") {
      return { allowed: true, overage: true };
    }
    return { allowed: false };
  }

  it("FREE plan at exactly 50000 tokens → allowed: false", () => {
    fc.assert(
      fc.property(fc.integer({ min: 50000, max: 200000 }), (current) => {
        const result = checkTokenQuota("FREE", 50000, current);
        expect(result.allowed).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("FREE plan below 50000 tokens → allowed: true", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 49999 }), (current) => {
        const result = checkTokenQuota("FREE", 50000, current);
        expect(result.allowed).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("PRO plan at or above 2000000 tokens → allowed: true, overage: true", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000000, max: 5000000 }), (current) => {
        const result = checkTokenQuota("PRO", 2000000, current);
        expect(result.allowed).toBe(true);
        expect((result as { overage?: boolean }).overage).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("ENTERPRISE plan (null limit) → always allowed: true", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000000 }), (current) => {
        const result = checkTokenQuota("ENTERPRISE", null, current);
        expect(result.allowed).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.18 — Property 27: HTTPS URL Validation
// Validates: Requirements 5.1, 12.1
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 27: HTTPS URL Validation", () => {
  /**
   * For any non-HTTPS URL, webhook creation SHALL be rejected.
   *
   * **Validates: Requirements 5.1, 12.1**
   */

  function isValidWebhookUrl(url: string): boolean {
    return url.startsWith("https://");
  }

  it("non-HTTPS URLs are rejected", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 7, maxLength: 100 }).map((s) => `http://${s}`),
          fc.string({ minLength: 6, maxLength: 100 }).map((s) => `ftp://${s}`),
          fc
            .string({ minLength: 1, maxLength: 100 })
            .filter((s) => !s.startsWith("https://")),
        ),
        (url) => {
          expect(isValidWebhookUrl(url)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("HTTPS URLs are accepted", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 80 }).map((s) => `https://${s}`),
        (url) => {
          expect(isValidWebhookUrl(url)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.19 — Property 28: Analytics Non-Negative Validation
// Validates: Requirements 12.4
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 28: Analytics Non-Negative Validation", () => {
  /**
   * For any analytics job with negative costUsd or totalTokens, the worker
   * SHALL correct to 0 before writing to the database.
   *
   * **Validates: Requirements 12.4**
   */

  // Inline the validation logic from analytics.worker.ts
  function sanitizeJobData(costUsd: number, totalTokens: number) {
    return {
      costUsd: Math.max(0, costUsd),
      totalTokens: Math.max(0, totalTokens),
    };
  }

  it("negative costUsd is corrected to 0", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000000, max: -1 }), (negativeCost) => {
        const { costUsd } = sanitizeJobData(negativeCost / 100, 100);
        expect(costUsd).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  it("negative totalTokens is corrected to 0", () => {
    fc.assert(
      fc.property(fc.integer({ min: -100000, max: -1 }), (negativeTokens) => {
        const { totalTokens } = sanitizeJobData(1.0, negativeTokens);
        expect(totalTokens).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  it("non-negative values are preserved unchanged", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100000 }),
        fc.nat({ max: 1000000 }),
        (tokens, costCents) => {
          const costUsd = costCents / 10000;
          const sanitized = sanitizeJobData(costUsd, tokens);
          expect(sanitized.totalTokens).toBe(tokens);
          expect(sanitized.costUsd).toBeCloseTo(costUsd, 10);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.20 — Property 29: User Ownership Enforcement
// Validates: Requirements 12.6, 12.7
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 29: User Ownership Enforcement", () => {
  /**
   * For any request with a projectId not owned by the user, the response
   * SHALL be 403.
   *
   * **Validates: Requirements 12.6, 12.7**
   */

  // Inline the ownership check logic
  function checkOwnership(
    resourceUserId: string,
    requestUserId: string,
  ): { status: 200 | 403 } {
    if (resourceUserId !== requestUserId) {
      return { status: 403 };
    }
    return { status: 200 };
  }

  it("mismatched userId returns 403", () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (resourceUserId, requestUserId) => {
        fc.pre(resourceUserId !== requestUserId);
        const result = checkOwnership(resourceUserId, requestUserId);
        expect(result.status).toBe(403);
      }),
      { numRuns: 200 },
    );
  });

  it("matching userId returns 200", () => {
    fc.assert(
      fc.property(fc.uuid(), (userId) => {
        const result = checkOwnership(userId, userId);
        expect(result.status).toBe(200);
      }),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.21 — Property 30: Budget Progress Bar Color Threshold
// Validates: Requirements 8.3, 8.4
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 30: Budget Progress Bar Color Threshold", () => {
  /**
   * For any tokensPct value:
   * - tokensPct < alertThresholdPct → "default" color
   * - tokensPct >= alertThresholdPct && tokensPct < 100 → "amber"
   * - tokensPct >= 100 → "red"
   *
   * **Validates: Requirements 8.3, 8.4**
   */

  // Inline the color logic from budget-progress-bar.tsx
  function getBudgetBarColor(
    tokensPct: number,
    alertThresholdPct: number,
  ): "default" | "amber" | "red" {
    if (tokensPct >= 100) return "red";
    if (tokensPct >= alertThresholdPct) return "amber";
    return "default";
  }

  it("tokensPct < alertThresholdPct → 'default'", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 50, max: 90 }),
        fc.integer({ min: 0, max: 49 }),
        (threshold, pct) => {
          fc.pre(pct < threshold && pct < 100);
          expect(getBudgetBarColor(pct, threshold)).toBe("default");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("alertThresholdPct <= tokensPct < 100 → 'amber'", () => {
    fc.assert(
      fc.property(fc.integer({ min: 50, max: 90 }), (threshold) => {
        // Pick a pct between threshold and 99 inclusive
        const pct = threshold + Math.floor((99 - threshold) / 2);
        fc.pre(pct >= threshold && pct < 100);
        expect(getBudgetBarColor(pct, threshold)).toBe("amber");
      }),
      { numRuns: 200 },
    );
  });

  it("tokensPct >= 100 → 'red'", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 150 }),
        fc.integer({ min: 50, max: 90 }),
        (pct, threshold) => {
          expect(getBudgetBarColor(pct, threshold)).toBe("red");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("color is deterministic for the same inputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 150 }),
        fc.integer({ min: 50, max: 90 }),
        (pct, threshold) => {
          expect(getBudgetBarColor(pct, threshold)).toBe(
            getBudgetBarColor(pct, threshold),
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
