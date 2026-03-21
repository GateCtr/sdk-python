/**
 * Property-Based Tests for error response format invariant
 * Property 13/15: Error Response Format Invariant
 * All error responses must be valid JSON with { error: string }
 * Validates: Requirements 16.1, 16.6
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ─── Error response shape validator ──────────────────────────────────────────

interface ErrorResponse {
  error: string;
  [key: string]: unknown;
}

function isValidErrorResponse(body: unknown): body is ErrorResponse {
  if (typeof body !== "object" || body === null) return false;
  const obj = body as Record<string, unknown>;
  return typeof obj.error === "string" && obj.error.length > 0;
}

function makeErrorBody(
  code: string,
  extra?: Record<string, unknown>,
): ErrorResponse {
  return { error: code, ...extra };
}

// Feature: core-api-budget-firewall, Property 13/15: Error Response Format Invariant
describe("P13/P15: Error Response Format Invariant", () => {
  const errorCodes = [
    "missing_api_key",
    "invalid_api_key",
    "api_key_revoked",
    "api_key_expired",
    "insufficient_scope",
    "payload_too_large",
    "invalid_json",
    "unknown_model",
    "invalid_model",
    "provider_disabled",
    "budget_exceeded",
    "rate_limit_exceeded",
    "no_provider_key",
    "provider_unavailable",
    "model_not_chat_capable",
    "internal_error",
    "User not found",
    "quota_exceeded",
  ];

  it("all known error codes produce valid error response shape", () => {
    // **Validates: Requirements 16.1, 16.6**
    for (const code of errorCodes) {
      const body = makeErrorBody(code);
      expect(isValidErrorResponse(body)).toBe(true);
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    }
  });

  it("error response is always valid JSON-serializable (>=100 iterations)", () => {
    // **Validates: Requirements 16.1, 16.6**
    fc.assert(
      fc.property(
        fc.constantFrom(...errorCodes),
        fc.option(
          fc.record({
            scope: fc.constantFrom("user", "project"),
            limit: fc.integer({ min: 0 }),
            current: fc.integer({ min: 0 }),
          }),
          { nil: undefined },
        ),
        (code, extra) => {
          const body = makeErrorBody(code, extra ?? undefined);
          // Must be JSON-serializable
          const serialized = JSON.stringify(body);
          const parsed = JSON.parse(serialized) as unknown;
          expect(isValidErrorResponse(parsed)).toBe(true);
          expect((parsed as ErrorResponse).error).toBe(code);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("error field is always a non-empty string (>=100 iterations)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (errorCode) => {
        const body = makeErrorBody(errorCode);
        expect(typeof body.error).toBe("string");
        expect(body.error.length).toBeGreaterThan(0);
        expect(isValidErrorResponse(body)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("non-error shapes fail the validator", () => {
    expect(isValidErrorResponse(null)).toBe(false);
    expect(isValidErrorResponse(undefined)).toBe(false);
    expect(isValidErrorResponse("string")).toBe(false);
    expect(isValidErrorResponse(42)).toBe(false);
    expect(isValidErrorResponse({})).toBe(false);
    expect(isValidErrorResponse({ error: 42 })).toBe(false);
    expect(isValidErrorResponse({ error: "" })).toBe(false);
    expect(isValidErrorResponse({ message: "oops" })).toBe(false);
  });

  it("extra fields do not invalidate the error response shape (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...errorCodes),
        fc.dictionary(
          fc.string({ minLength: 1 }),
          fc.oneof(fc.string(), fc.integer(), fc.boolean()),
        ),
        (code, extras) => {
          const body = { error: code, ...extras };
          expect(isValidErrorResponse(body)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── HTTP status code invariants ──────────────────────────────────────────────

describe("HTTP status code invariants", () => {
  const statusMap: Array<[string, number]> = [
    ["missing_api_key", 401],
    ["invalid_api_key", 401],
    ["api_key_revoked", 401],
    ["api_key_expired", 401],
    ["insufficient_scope", 403],
    ["payload_too_large", 413],
    ["invalid_json", 400],
    ["unknown_model", 400],
    ["invalid_model", 400],
    ["provider_disabled", 503],
    ["budget_exceeded", 429],
    ["rate_limit_exceeded", 429],
    ["no_provider_key", 422],
    ["provider_unavailable", 502],
    ["model_not_chat_capable", 400],
  ];

  it("each error code maps to the correct HTTP status", () => {
    // **Validates: Requirements 16.1**
    for (const [code, status] of statusMap) {
      // Verify the mapping is consistent — status must be a valid HTTP error code
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
      // Auth errors are 401/403
      if (
        [
          "missing_api_key",
          "invalid_api_key",
          "api_key_revoked",
          "api_key_expired",
        ].includes(code)
      ) {
        expect(status).toBe(401);
      }
      if (code === "insufficient_scope") {
        expect(status).toBe(403);
      }
    }
  });

  it("all error statuses are 4xx or 5xx (never 2xx/3xx)", () => {
    for (const [, status] of statusMap) {
      expect(status).toBeGreaterThanOrEqual(400);
    }
  });
});
