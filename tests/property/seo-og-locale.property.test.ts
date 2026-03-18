/**
 * SEO og:locale Complement Invariant Property-Based Test
 *
 * Task 3.1 from the seo-complete spec.
 *
 * Library: fast-check (fc) + vitest
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { buildOgLocale } from "@/lib/seo";

// ═════════════════════════════════════════════════════════════════════════════
// Task 3.1 – Property 9: og:locale complement invariant
// Validates: Requirements 2.7, 2.8
// ═════════════════════════════════════════════════════════════════════════════

// Feature: seo-complete, Property 9: og:locale complement invariant
describe("Property 9: og:locale complement invariant", () => {
  /**
   * For any marketing page and locale in {en, fr}, the og:locale value must be
   * the BCP47 tag for that locale (en_US or fr_FR), and og:locale:alternate
   * must be the tag for the other locale — they must never be equal.
   *
   * **Validates: Requirements 2.7, 2.8**
   */
  it("og.locale and og.alternateLocale are correct BCP47 tags and never equal", () => {
    fc.assert(
      fc.property(fc.constantFrom("en", "fr"), (locale) => {
        const og = buildOgLocale(locale);
        const expectedLocale = locale === "fr" ? "fr_FR" : "en_US";
        const expectedAlternate = locale === "fr" ? "en_US" : "fr_FR";
        return (
          og.locale === expectedLocale &&
          og.alternateLocale === expectedAlternate &&
          og.locale !== og.alternateLocale
        );
      }),
      { numRuns: 100 },
    );
  });
});
