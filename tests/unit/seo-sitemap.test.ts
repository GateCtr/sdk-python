import { describe, it, expect, vi, beforeEach } from "vitest";

// Feature: seo-complete, Property 4: Sitemap excludes app subdomain
describe("Property 4: Sitemap excludes app subdomain", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  /**
   * **Validates: Requirements 6.8**
   */
  it("returns empty array when isAppSubdomain is true", async () => {
    vi.doMock("@/lib/seo", () => ({
      getSeoContext: vi.fn().mockResolvedValue({
        marketingUrl: "https://gatectr.com",
        appUrl: "https://app.gatectr.com",
        isAppSubdomain: true,
      }),
      buildCanonicalUrl: vi.fn(),
      buildAlternateUrls: vi.fn(),
    }));

    const { default: sitemap } = await import("@/app/sitemap");
    const result = await sitemap();
    expect(result).toEqual([]);
  });
});
