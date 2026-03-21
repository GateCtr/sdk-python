import { test, expect } from "@playwright/test";

/**
 * E2E tests for streaming behavior
 * Requirements: 5.8, 6.7
 *
 * Note: Real Clerk authentication is not available in E2E tests (no test credentials).
 * These tests verify:
 * - Auth is checked before streaming is initiated (Req 5.8)
 * - stream: true requests without auth return 401, not a streaming error (Req 5.8)
 * - /api/v1/chat auth enforcement and error shape (Req 6.7)
 * - Error responses for streaming endpoints use application/json, not text/event-stream (Req 5.8)
 * - Security headers and request ID headers are present on all responses (Req 10.1, 15.4–15.6)
 */

// ── Requirement 5.8: Auth checked before streaming ───────────────────────────

test.describe("POST /api/v1/complete — auth before streaming (Requirement 5.8)", () => {
  test("returns 401 with stream: true and no auth (auth checked before streaming)", async ({
    page,
  }) => {
    const response = await page.request.post("/api/v1/complete", {
      data: { model: "gpt-4o", prompt: "Hello", stream: true },
    });

    // Auth failure must take precedence — no streaming should begin
    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
  });

  test("returns 401 with stream: true and invalid token (not a streaming error)", async ({
    page,
  }) => {
    const response = await page.request.post("/api/v1/complete", {
      headers: {
        Authorization:
          "Bearer gct_invalidtoken000000000000000000000000000000000000000000",
      },
      data: { model: "gpt-4o", prompt: "Hello", stream: true },
    });

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
  });

  test("error response Content-Type is application/json (not text/event-stream)", async ({
    page,
  }) => {
    const response = await page.request.post("/api/v1/complete", {
      data: { model: "gpt-4o", prompt: "Hello", stream: true },
    });

    expect(response.status()).toBe(401);

    const contentType = response.headers()["content-type"] ?? "";
    // Error responses must never be streamed — must be JSON
    expect(contentType).toContain("application/json");
    expect(contentType).not.toContain("text/event-stream");
  });
});

// ── Requirement 6.7: /api/v1/chat auth enforcement ───────────────────────────

test.describe("POST /api/v1/chat — authentication (Requirement 6.7)", () => {
  test("returns 401 with stream: true and no auth", async ({ page }) => {
    const response = await page.request.post("/api/v1/chat", {
      data: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      },
    });

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
  });

  test("returns 401 with { error: 'missing_api_key' } when no Authorization header", async ({
    page,
  }) => {
    const response = await page.request.post("/api/v1/chat", {
      data: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("missing_api_key");
  });

  test("returns 401 with auth error JSON when Bearer token is invalid", async ({
    page,
  }) => {
    const response = await page.request.post("/api/v1/chat", {
      headers: {
        Authorization:
          "Bearer gct_invalidtoken000000000000000000000000000000000000000000",
      },
      data: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
    // Must be an auth-related error, not a model or body error
    expect(["invalid_api_key", "api_key_revoked", "api_key_expired"]).toContain(
      body.error,
    );
  });

  test("error response Content-Type is application/json (not text/event-stream)", async ({
    page,
  }) => {
    const response = await page.request.post("/api/v1/chat", {
      data: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      },
    });

    expect(response.status()).toBe(401);

    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toContain("application/json");
    expect(contentType).not.toContain("text/event-stream");
  });
});

// ── Requirement 10.1: X-GateCtr-Request-Id header on streaming endpoints ─────

test.describe("X-GateCtr-Request-Id header on streaming endpoints (Requirement 10.1)", () => {
  test("POST /api/v1/chat without auth includes X-GateCtr-Request-Id header", async ({
    page,
  }) => {
    const response = await page.request.post("/api/v1/chat", {
      data: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    const headers = response.headers();
    expect(headers["x-gatectr-request-id"]).toBeDefined();
    expect(headers["x-gatectr-request-id"].length).toBeGreaterThan(0);
  });

  test("POST /api/v1/complete with stream: true includes X-GateCtr-Request-Id header", async ({
    page,
  }) => {
    const response = await page.request.post("/api/v1/complete", {
      data: { model: "gpt-4o", prompt: "Hello", stream: true },
    });

    const headers = response.headers();
    expect(headers["x-gatectr-request-id"]).toBeDefined();
    expect(headers["x-gatectr-request-id"].length).toBeGreaterThan(0);
  });
});

// ── Requirements 15.4–15.6: Security headers on streaming endpoints ───────────

test.describe("Security headers on streaming endpoints (Requirements 15.4–15.6)", () => {
  test("POST /api/v1/chat without auth includes X-Content-Type-Options: nosniff", async ({
    page,
  }) => {
    const response = await page.request.post("/api/v1/chat", {
      data: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("POST /api/v1/chat without auth includes X-Frame-Options: DENY", async ({
    page,
  }) => {
    const response = await page.request.post("/api/v1/chat", {
      data: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(response.headers()["x-frame-options"]).toBe("DENY");
  });

  test("POST /api/v1/chat security headers are present even on error responses", async ({
    page,
  }) => {
    // Security headers must be set on ALL responses, including 401 errors
    const response = await page.request.post("/api/v1/chat", {
      data: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(response.status()).toBe(401);

    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-gatectr-request-id"]).toBeDefined();
  });
});
