// Feature: api-logic-completion, Property 19: System health overall status computation
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeOverallStatus } from "@/lib/health-utils";

/**
 * Validates: Requirements 9.3
 *
 * Property 19: System health overall status computation
 * - If any status is "DOWN" → result is "down"
 * - Else if any status is "DEGRADED" → result is "degraded"
 * - Else → result is "healthy"
 */
describe("P19: system health overall status computation", () => {
  it("returns the correct overall status for any combination of service statuses", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("HEALTHY", "DEGRADED", "DOWN"), {
          minLength: 1,
        }),
        (statuses) => {
          const result = computeOverallStatus(statuses);
          if (statuses.includes("DOWN")) {
            expect(result).toBe("down");
          } else if (statuses.includes("DEGRADED")) {
            expect(result).toBe("degraded");
          } else {
            expect(result).toBe("healthy");
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
