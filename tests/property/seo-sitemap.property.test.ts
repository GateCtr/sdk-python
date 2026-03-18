/**
 * SEO Sitemap Property-Based Tests
 *
 * Tasks 11.1 and 11.2 from the seo-complete spec.
 *
 * Library: fast-check (fc) + vitest
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { getSeoContextWithHost, buildAlternateUrls } from "@/lib/seo";

// ═════════════════════════════════════════════════════════════════════════════
// Task 11.2 – Property 5: Sitemap contains both locales for every marketing page
// Validates: Requirements 6.2, 6.7
// ═════════════════════════════════════════════════════════════════════════════

// Feature: seo-complete, Property 5: Sitemap contains both locales for every marketing page
describe("Property 5: Sitemap contains both locales for every marketing page", () => {
  /**
   * For each marketing page path, the alternate URLs produced by buildAlternateUrls
   * must contain non-empty strings for both 'en' and 'fr'.
   *
   * **Validates: Requirements 6.2, 6.7**
   */
  it("every sitemap entry has non-empty en and fr alternates", () => {
    fc.assert(
      fc.property(fc.constant("gatectr.com"), (host) => {
        const ctx = getSeoContextWithHost(host);
        const pages = ["/", "/waitlist"];

        return pages.every((path) => {
          const alts = buildAlternateUrls(path, ctx);
          return (
            typeof alts.en === "string" &&
            alts.en.length > 0 &&
            typeof alts.fr === "string" &&
            alts.fr.length > 0
          );
        });
      }),
      { numRuns: 100 },
    );
  });
});
