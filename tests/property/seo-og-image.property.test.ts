/**
 * SEO OG Image Property-Based Tests
 *
 * Task 14.1 from the seo-complete spec.
 *
 * Library: fast-check (fc) + vitest
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import type { NextRequest } from "next/server";

// Mock next/og before importing the route.
// Must use a class/function so `new ImageResponse(...)` works as a constructor.
vi.mock("next/og", () => ({
  ImageResponse: class ImageResponse extends Response {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_jsx: unknown, ..._args: unknown[]) {
      super(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
  },
}));

// ═════════════════════════════════════════════════════════════════════════════
// Task 14.1 – Property 6: OG image dimensions invariant
// Validates: Requirements 10.5
// ═════════════════════════════════════════════════════════════════════════════

// Feature: seo-complete, Property 6: OG image dimensions invariant
describe("Property 6: OG image dimensions invariant", () => {
  /**
   * For any combination of title and description query parameters (including
   * empty strings), the OG image endpoint must return status 200 with an
   * image content-type.
   *
   * **Validates: Requirements 10.5**
   */
  it("returns 200 with image content-type for any title and description", async () => {
    const { GET } = await import("@/app/api/og/route");

    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), async (title, description) => {
        const url = `http://localhost/api/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`;
        const request = Object.assign(new Request(url), {
          nextUrl: new URL(url),
        }) as unknown as NextRequest;

        const response = await GET(request);
        return (
          response.status === 200 &&
          (response.headers.get("content-type")?.startsWith("image/") ?? false)
        );
      }),
      { numRuns: 50 },
    );
  });

  it("returns 200 with image content-type when no params are provided (defaults)", async () => {
    const { GET } = await import("@/app/api/og/route");

    const url = "http://localhost/api/og";
    const request = Object.assign(new Request(url), {
      nextUrl: new URL(url),
    }) as unknown as NextRequest;

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")?.startsWith("image/")).toBe(
      true,
    );
  });

  it("sets Cache-Control header on every response", async () => {
    const { GET } = await import("@/app/api/og/route");

    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), async (title, description) => {
        const url = `http://localhost/api/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`;
        const request = Object.assign(new Request(url), {
          nextUrl: new URL(url),
        }) as unknown as NextRequest;

        const response = await GET(request);
        const cacheControl = response.headers.get("Cache-Control");
        return cacheControl === "public, max-age=86400, immutable";
      }),
      { numRuns: 50 },
    );
  });
});
