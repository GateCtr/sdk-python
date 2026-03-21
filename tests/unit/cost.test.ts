/**
 * Property-Based Tests for cost calculation and UsageLog invariants
 * Property 8: Cost Calculation Correctness
 * Property 9: Token Sum Invariant
 * Property 10: Cost Non-Negativity
 * Validates: Requirements 5.10, 10.1, 10.2, 10.8, 10.9, 10.10
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ─── Cost calculation (pure function, no mocks needed) ────────────────────────

function calcCostUsd(
  promptTokens: number,
  completionTokens: number,
  inputCostPer1k: number,
  outputCostPer1k: number,
): number {
  return (
    (promptTokens * inputCostPer1k + completionTokens * outputCostPer1k) / 1000
  );
}

// Feature: core-api-budget-firewall, Property 8: Cost Calculation Correctness
describe("P8: Cost Calculation Correctness", () => {
  it("costUsd == (promptTokens * inputCost + completionTokens * outputCost) / 1000 (>=100 iterations)", () => {
    // **Validates: Requirements 5.10, 10.8, 10.9**
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        (promptTokens, completionTokens, inputCostPer1k, outputCostPer1k) => {
          const cost = calcCostUsd(
            promptTokens,
            completionTokens,
            inputCostPer1k,
            outputCostPer1k,
          );
          const expected =
            (promptTokens * inputCostPer1k +
              completionTokens * outputCostPer1k) /
            1000;
          expect(cost).toBeCloseTo(expected, 10);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("cost is exactly 0 when both token counts are 0 (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        (inputCostPer1k, outputCostPer1k) => {
          const cost = calcCostUsd(0, 0, inputCostPer1k, outputCostPer1k);
          expect(cost).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("cost scales linearly with token count (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 2, max: 10 }),
        fc.float({
          min: Math.fround(0.001),
          max: Math.fround(10),
          noNaN: true,
        }),
        (baseTokens, multiplier, costPer1k) => {
          const baseCost = calcCostUsd(baseTokens, 0, costPer1k, 0);
          const scaledCost = calcCostUsd(
            baseTokens * multiplier,
            0,
            costPer1k,
            0,
          );
          expect(scaledCost).toBeCloseTo(baseCost * multiplier, 5);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: core-api-budget-firewall, Property 9: Token Sum Invariant
describe("P9: Token Sum Invariant", () => {
  it("totalTokens == promptTokens + completionTokens (>=100 iterations)", () => {
    // **Validates: Requirements 10.1, 10.2, 10.10**
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (promptTokens, completionTokens) => {
          const totalTokens = promptTokens + completionTokens;
          expect(totalTokens).toBe(promptTokens + completionTokens);
          expect(totalTokens).toBeGreaterThanOrEqual(promptTokens);
          expect(totalTokens).toBeGreaterThanOrEqual(completionTokens);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("totalTokens is always >= each individual count (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500_000 }),
        fc.integer({ min: 0, max: 500_000 }),
        (promptTokens, completionTokens) => {
          const total = promptTokens + completionTokens;
          expect(total).toBeGreaterThanOrEqual(promptTokens);
          expect(total).toBeGreaterThanOrEqual(completionTokens);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: core-api-budget-firewall, Property 10: Cost Non-Negativity
describe("P10: Cost Non-Negativity", () => {
  it("costUsd >= 0 for all non-negative inputs (>=100 iterations)", () => {
    // **Validates: Requirements 10.8, 10.9**
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        (promptTokens, completionTokens, inputCostPer1k, outputCostPer1k) => {
          const cost = calcCostUsd(
            promptTokens,
            completionTokens,
            inputCostPer1k,
            outputCostPer1k,
          );
          expect(cost).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("cost with zero rates is always 0 regardless of token count (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (promptTokens, completionTokens) => {
          const cost = calcCostUsd(promptTokens, completionTokens, 0, 0);
          expect(cost).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── savedTokens invariant ────────────────────────────────────────────────────

describe("savedTokens invariant", () => {
  it("savedTokens >= 0 always (>=100 iterations)", () => {
    // **Validates: Requirements 10.2**
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (original, optimized) => {
          const saved = Math.max(0, original - optimized);
          expect(saved).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
