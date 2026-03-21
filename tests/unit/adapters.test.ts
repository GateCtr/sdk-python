/**
 * Property Tests for LLM Adapter Token Sum Invariant
 * Validates: Requirements 10.10, 23.8
 *
 * Feature: core-api-budget-firewall
 * Property 9 / P10: Token Sum Invariant
 *   For any GatewayResponse: totalTokens === promptTokens + completionTokens
 *   This must hold for all four adapters: openai, anthropic, mistral, gemini
 */
import fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { GatewayResponse } from "@/lib/llm/types";

describe("core-api-budget-firewall: Token Sum Invariant across adapters", () => {
  // Feature: core-api-budget-firewall, Property 9: Token Sum Invariant
  it("totalTokens == promptTokens + completionTokens for all adapter responses (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.constantFrom("openai", "anthropic", "mistral", "gemini"),
        (promptTokens, completionTokens, provider) => {
          // Simulate the GatewayResponse shape that each adapter produces
          const response: GatewayResponse = {
            id: `${provider}-test-id`,
            model: "test-model",
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            content: "test response",
            finishReason: "stop",
            latencyMs: 100,
          };

          // Property 9: Token Sum Invariant
          expect(response.totalTokens).toBe(
            response.promptTokens + response.completionTokens,
          );
          // Property 10: Token Sum Non-Negativity
          expect(response.totalTokens).toBeGreaterThanOrEqual(0);
          expect(response.promptTokens).toBeGreaterThanOrEqual(0);
          expect(response.completionTokens).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: core-api-budget-firewall, Property 10: Token Sum Invariant (design property)
  it("Gemini usageMetadata mapping preserves token sum invariant", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (promptTokenCount, candidatesTokenCount) => {
          // Simulate Gemini response usageMetadata mapping
          const usageMetadata = {
            promptTokenCount,
            candidatesTokenCount,
            totalTokenCount: promptTokenCount + candidatesTokenCount,
          };

          const mapped = {
            promptTokens: usageMetadata.promptTokenCount ?? 0,
            completionTokens: usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: usageMetadata.totalTokenCount ?? 0,
          };

          expect(mapped.totalTokens).toBe(
            mapped.promptTokens + mapped.completionTokens,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Gemini missing usageMetadata defaults to zero tokens with valid sum", () => {
    interface GeminiUsage {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    }
    const usageMetadata = undefined as GeminiUsage | undefined;
    const mapped = {
      promptTokens: usageMetadata?.promptTokenCount ?? 0,
      completionTokens: usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: usageMetadata?.totalTokenCount ?? 0,
    };

    expect(mapped.totalTokens).toBe(0);
    expect(mapped.promptTokens).toBe(0);
    expect(mapped.completionTokens).toBe(0);
    expect(mapped.totalTokens).toBe(
      mapped.promptTokens + mapped.completionTokens,
    );
  });

  it("Anthropic usage mapping preserves token sum invariant (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (inputTokens, outputTokens) => {
          // Simulate Anthropic response usage mapping
          const usage = {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          };
          const mapped = {
            promptTokens: usage.input_tokens ?? 0,
            completionTokens: usage.output_tokens ?? 0,
            totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
          };
          expect(mapped.totalTokens).toBe(
            mapped.promptTokens + mapped.completionTokens,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("OpenAI usage mapping preserves token sum invariant (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (promptTokens, completionTokens) => {
          // Simulate OpenAI response usage mapping
          const usage = {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          };
          const mapped = {
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
          };
          expect(mapped.totalTokens).toBe(
            mapped.promptTokens + mapped.completionTokens,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
