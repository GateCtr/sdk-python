/**
 * SEO Robots Property-Based Tests
 *
 * Task 12.1 from the seo-complete spec.
 *
 * Library: fast-check (fc) + vitest
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { getSeoContextWithHost } from "@/lib/seo";
import { generateRobots } from "@/app/robots";

// ═════════════════════════════════════════════════════════════════════════════
// Task 12.1 – Property 10: Robots subdomain dispatch
// Validates: Requirements 7.4, 7.5, 7.6, 7.7
// ═════════════════════════════════════════════════════════════════════════════

// Feature: seo-complete, Property 10: robots subdomain dispatch
describe("Property 10: Robots subdomain dispatch", () => {
  /**
   * For app hosts: rules must contain disallow: '/' and no sitemap field.
   * For marketing hosts: sitemap field must be present.
   *
   * **Validates: Requirements 7.4, 7.5, 7.6, 7.7**
   */
  it("app hosts disallow all with no sitemap; marketing hosts include sitemap", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "gatectr.com",
          "app.gatectr.com",
          "app.staging.gatectr.com",
        ),
        (host) => {
          const ctx = getSeoContextWithHost(host);
          const result = generateRobots(ctx);
          const rules = Array.isArray(result.rules)
            ? result.rules
            : [result.rules];

          if (ctx.isAppSubdomain) {
            return rules.some((r) => r.disallow === "/") && !result.sitemap;
          } else {
            return !!result.sitemap;
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
