/**
 * SEO JSON-LD Property-Based Tests
 *
 * Task 9.1 from the seo-complete spec.
 *
 * Library: fast-check (fc) + vitest
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { render } from "@testing-library/react";
import React from "react";
import { JsonLd } from "@/components/seo/json-ld";

// ═════════════════════════════════════════════════════════════════════════════
// Task 9.1 – Property 7: JSON-LD serialization round-trip
// Validates: Requirements 5.5
// ═════════════════════════════════════════════════════════════════════════════

// Feature: seo-complete, Property 7: JSON-LD serialization round-trip
describe("Property 7: JSON-LD serialization round-trip", () => {
  /**
   * For any valid schema object passed to JsonLd, parsing the innerHTML of the
   * rendered <script> tag must produce an object deeply equal to the input schema.
   *
   * **Validates: Requirements 5.5**
   */
  it("parsed script innerHTML deeply equals the input schema", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (schema) => {
        const { container } = render(React.createElement(JsonLd, { schema }));
        const script = container.querySelector(
          'script[type="application/ld+json"]',
        );
        if (!script) return false;
        const parsed = JSON.parse(script.innerHTML);
        return JSON.stringify(parsed) === JSON.stringify(schema);
      }),
      { numRuns: 200 },
    );
  });
});
