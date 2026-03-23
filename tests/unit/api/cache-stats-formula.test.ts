// Feature: api-logic-completion, Property 18: estimatedTokensSaved formula correctness
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeEstimatedTokensSaved } from "@/lib/cache-utils";

/**
 * Validates: Requirements 8.4
 *
 * Property 18: estimatedTokensSaved formula correctness
 * For any set of cache entries, estimatedTokensSaved equals
 * the sum of (promptTokens × hitCount) across all entries.
 */
describe("P18: estimatedTokensSaved formula correctness", () => {
  it("equals the manually computed sum of promptTokens * hitCount for each entry", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ promptTokens: fc.nat(), hitCount: fc.nat() })),
        (entries) => {
          const expected = entries.reduce(
            (sum, entry) => sum + entry.promptTokens * entry.hitCount,
            0,
          );
          expect(computeEstimatedTokensSaved(entries)).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});
