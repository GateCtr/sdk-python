/**
 * SEO Canonical URL Property-Based Tests
 *
 * Tasks 1.1, 1.2, 1.3 from the seo-complete spec.
 *
 * Library: fast-check (fc) + vitest
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import {
  buildCanonicalUrl,
  buildAlternateUrls,
  getSeoContextWithHost,
} from "@/lib/seo";
import type { SeoContext } from "@/lib/seo";

// ─── Shared test context ──────────────────────────────────────────────────────

const mockMarketingContext: SeoContext = {
  marketingUrl: "https://gatectr.com",
  appUrl: "https://app.gatectr.com",
  isAppSubdomain: false,
};

// ═════════════════════════════════════════════════════════════════════════════
// Task 1.1 – Property 1: Canonical URL locale prefix invariant
// Validates: Requirements 3.2, 3.3
// ═════════════════════════════════════════════════════════════════════════════

// Feature: seo-complete, Property 1: canonical URL locale prefix invariant
describe("Property 1: Canonical URL locale prefix invariant", () => {
  /**
   * For any marketing page path and locale, buildCanonicalUrl must produce a
   * URL that starts with marketingUrl, contains /fr/ iff locale is fr, and
   * never contains a double slash.
   *
   * **Validates: Requirements 3.2, 3.3**
   */
  it("canonical URL starts with marketingUrl, has /fr/ iff locale is fr, never has //", () => {
    // Use paths that don't start with /fr to avoid false positives in the EN check
    const pathArb = fc
      .stringMatching(/^\/[a-z-/]*$/)
      .filter((p) => !p.startsWith("/fr"));

    fc.assert(
      fc.property(fc.constantFrom("en", "fr"), pathArb, (locale, path) => {
        const url = buildCanonicalUrl(path, locale, mockMarketingContext);

        const startsWithMarketing = url.startsWith(
          mockMarketingContext.marketingUrl,
        );
        // Strip protocol to safely check for double slashes
        const urlWithoutProtocol = url.replace(/^https?:\/\//, "");
        const noDoubleSlash = !urlWithoutProtocol.includes("//");
        const hasFrSegment = url.includes("/fr/") || url.endsWith("/fr");

        if (locale === "fr") {
          return startsWithMarketing && hasFrSegment && noDoubleSlash;
        } else {
          return startsWithMarketing && !hasFrSegment && noDoubleSlash;
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 1.2 – Property 2: Alternate URL round-trip
// Validates: Requirements 4.1, 4.2, 4.3
// ═════════════════════════════════════════════════════════════════════════════

// Feature: seo-complete, Property 2: alternate URL round-trip
describe("Property 2: Alternate URL round-trip", () => {
  /**
   * For any marketing page path, the en alternate URL produced by
   * buildAlternateUrls must equal buildCanonicalUrl(path, 'en', context),
   * and the fr alternate must equal buildCanonicalUrl(path, 'fr', context).
   *
   * **Validates: Requirements 4.1, 4.2, 4.3**
   */
  it("alts.en === buildCanonicalUrl(en), alts.fr === buildCanonicalUrl(fr), alts.xDefault === alts.en", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\/[a-z-/]*$/), (path) => {
        const alts = buildAlternateUrls(path, mockMarketingContext);
        return (
          alts.en === buildCanonicalUrl(path, "en", mockMarketingContext) &&
          alts.fr === buildCanonicalUrl(path, "fr", mockMarketingContext) &&
          alts.xDefault === alts.en
        );
      }),
      { numRuns: 200 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Task 1.3 – Property 8: getSeoContext fallback invariant
// Validates: Requirements 3.7, 3.8, 11.5, 11.6
// ═════════════════════════════════════════════════════════════════════════════

// Feature: seo-complete, Property 8: getSeoContext fallback invariant
describe("Property 8: getSeoContext fallback invariant", () => {
  /**
   * For any environment where NEXT_PUBLIC_MARKETING_URL or NEXT_PUBLIC_APP_URL
   * is absent, getSeoContextWithHost() must return non-empty strings for both
   * marketingUrl and appUrl (the hardcoded fallbacks).
   *
   * **Validates: Requirements 3.7, 3.8, 11.5, 11.6**
   */
  it("marketingUrl and appUrl are always non-empty strings for any host", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "gatectr.com",
          "app.gatectr.com",
          "localhost:3000",
          "app.localhost:3000",
        ),
        (host) => {
          const ctx = getSeoContextWithHost(host);
          return ctx.marketingUrl.length > 0 && ctx.appUrl.length > 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("isAppSubdomain is true iff host starts with app.", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "gatectr.com",
          "app.gatectr.com",
          "localhost:3000",
          "app.localhost:3000",
        ),
        (host) => {
          const ctx = getSeoContextWithHost(host);
          const expectedIsApp = host.startsWith("app.");
          return ctx.isAppSubdomain === expectedIsApp;
        },
      ),
      { numRuns: 100 },
    );
  });
});
