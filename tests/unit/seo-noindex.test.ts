import { describe, it, expect } from "vitest";
import { getSeoContextWithHost } from "@/lib/seo";

// Feature: seo-complete, Property 3: App subdomain forces noindex
describe("Property 3: App subdomain forces noindex", () => {
  it("isAppSubdomain is true for app.gatectr.com", () => {
    const ctx = getSeoContextWithHost("app.gatectr.com");
    expect(ctx.isAppSubdomain).toBe(true);
  });

  it("isAppSubdomain is false for gatectr.com", () => {
    const ctx = getSeoContextWithHost("gatectr.com");
    expect(ctx.isAppSubdomain).toBe(false);
  });

  it("isAppSubdomain is true for app.staging.gatectr.com", () => {
    const ctx = getSeoContextWithHost("app.staging.gatectr.com");
    expect(ctx.isAppSubdomain).toBe(true);
  });
});
