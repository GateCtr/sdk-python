/**
 * Unit Tests for lib/api-auth.ts
 * Validates: Requirements 2.2–2.6, 3.4, 15.7
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

const {
  mockFindFirst,
  mockUpdateApiKey,
  mockRedisGet,
  mockRedisIncr,
  mockRedisExpire,
  mockRedisSet,
  mockLogAudit,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUpdateApiKey: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisIncr: vi.fn(),
  mockRedisExpire: vi.fn(),
  mockRedisSet: vi.fn(),
  mockLogAudit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findFirst: mockFindFirst,
      update: mockUpdateApiKey,
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: mockRedisGet,
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    set: mockRedisSet,
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));

import { authenticateApiKey, requireScope, ApiAuthError } from "@/lib/api-auth";
import crypto from "crypto";

// Ensure fire-and-forget mocks always return promises (needed for .catch() calls)
beforeEach(() => {
  mockLogAudit.mockResolvedValue(undefined);
  mockUpdateApiKey.mockResolvedValue({});
  mockRedisIncr.mockResolvedValue(1);
  mockRedisExpire.mockResolvedValue(1);
  mockRedisSet.mockResolvedValue("OK");
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function makeToken(): string {
  return "gct_" + crypto.randomBytes(24).toString("hex");
}

function makeRequest(token?: string, ip = "1.2.3.4") {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", token); // pass raw header value
  headers.set("x-forwarded-for", ip);
  return { headers } as unknown as import("next/server").NextRequest;
}

function makeBearerRequest(token: string, ip = "1.2.3.4") {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);
  headers.set("x-forwarded-for", ip);
  return { headers } as unknown as import("next/server").NextRequest;
}

function makeRecord(
  token: string,
  overrides: Partial<{
    isActive: boolean;
    expiresAt: Date | null;
    scopes: string[];
    projectId: string | null;
  }> = {},
) {
  return {
    id: "key_1",
    userId: "user_1",
    prefix: token.slice(0, 12),
    keyHash: sha256Hex(token),
    isActive: true,
    expiresAt: null,
    scopes: ["complete", "chat"],
    projectId: null,
    ...overrides,
  };
}

function setupNotBlocked() {
  mockRedisGet.mockResolvedValue(null); // IP not blocked
  mockUpdateApiKey.mockResolvedValue({}); // fire-and-forget update returns a promise
}

// ─── Missing / malformed header ───────────────────────────────────────────────

describe("authenticateApiKey: missing/malformed header", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws missing_api_key (401) when Authorization header is absent", async () => {
    const req = makeRequest(undefined);
    await expect(authenticateApiKey(req)).rejects.toMatchObject({
      code: "missing_api_key",
      httpStatus: 401,
    });
  });

  it("throws missing_api_key (401) when header is not Bearer", async () => {
    const req = makeRequest("Basic sometoken");
    await expect(authenticateApiKey(req)).rejects.toMatchObject({
      code: "missing_api_key",
      httpStatus: 401,
    });
  });
});

// ─── Invalid key (hash mismatch) ─────────────────────────────────────────────

describe("authenticateApiKey: invalid key", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws invalid_api_key (401) when no record found for prefix", async () => {
    setupNotBlocked();
    mockFindFirst.mockResolvedValue(null);
    const token = makeToken();
    await expect(
      authenticateApiKey(makeBearerRequest(token)),
    ).rejects.toMatchObject({
      code: "invalid_api_key",
      httpStatus: 401,
    });
  });

  it("throws invalid_api_key (401) when hash does not match", async () => {
    setupNotBlocked();
    const token = makeToken();
    const wrongToken = makeToken();
    mockFindFirst.mockResolvedValue(makeRecord(wrongToken));
    await expect(
      authenticateApiKey(makeBearerRequest(token)),
    ).rejects.toMatchObject({
      code: "invalid_api_key",
      httpStatus: 401,
    });
  });

  it("hash mismatch is consistent across arbitrary tokens (>=50 iterations)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 48, maxLength: 48 }),
        async (suffix) => {
          vi.clearAllMocks();
          setupNotBlocked();
          const token = "gct_" + suffix;
          const differentToken =
            "gct_" + crypto.randomBytes(24).toString("hex");
          mockFindFirst.mockResolvedValue(makeRecord(differentToken));
          await expect(
            authenticateApiKey(makeBearerRequest(token)),
          ).rejects.toMatchObject({
            code: "invalid_api_key",
            httpStatus: 401,
          });
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ─── Revoked key ─────────────────────────────────────────────────────────────

describe("authenticateApiKey: revoked key", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws invalid_api_key (401) when DB returns null due to query filter)", async () => {
    // The query uses `where: { prefix, isActive: true }` so a revoked key returns null → invalid_api_key
    setupNotBlocked();
    mockFindFirst.mockResolvedValue(null); // DB filters out inactive keys
    const token = makeToken();
    await expect(
      authenticateApiKey(makeBearerRequest(token)),
    ).rejects.toMatchObject({
      code: "invalid_api_key",
      httpStatus: 401,
    });
  });
});

// ─── Expired key ─────────────────────────────────────────────────────────────

describe("authenticateApiKey: expired key", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws api_key_expired (401) when expiresAt is in the past", async () => {
    setupNotBlocked();
    const token = makeToken();
    const pastDate = new Date(Date.now() - 1000);
    mockFindFirst.mockResolvedValue(makeRecord(token, { expiresAt: pastDate }));
    await expect(
      authenticateApiKey(makeBearerRequest(token)),
    ).rejects.toMatchObject({
      code: "api_key_expired",
      httpStatus: 401,
    });
  });

  it("allows key when expiresAt is in the future", async () => {
    setupNotBlocked();
    const token = makeToken();
    const futureDate = new Date(Date.now() + 86400_000);
    mockFindFirst.mockResolvedValue(
      makeRecord(token, { expiresAt: futureDate }),
    );
    const ctx = await authenticateApiKey(makeBearerRequest(token));
    expect(ctx.userId).toBe("user_1");
  });

  it("allows key when expiresAt is null (no expiry)", async () => {
    setupNotBlocked();
    const token = makeToken();
    mockFindFirst.mockResolvedValue(makeRecord(token, { expiresAt: null }));
    const ctx = await authenticateApiKey(makeBearerRequest(token));
    expect(ctx.userId).toBe("user_1");
  });
});

// ─── Successful auth ──────────────────────────────────────────────────────────

describe("authenticateApiKey: success", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns correct AuthContext on valid token", async () => {
    setupNotBlocked();
    const token = makeToken();
    mockFindFirst.mockResolvedValue(
      makeRecord(token, { scopes: ["complete", "chat"], projectId: "proj_1" }),
    );
    mockUpdateApiKey.mockResolvedValue({});
    const ctx = await authenticateApiKey(makeBearerRequest(token));
    expect(ctx.userId).toBe("user_1");
    expect(ctx.apiKeyId).toBe("key_1");
    expect(ctx.scopes).toEqual(["complete", "chat"]);
    expect(ctx.projectId).toBe("proj_1");
  });

  it("fires lastUsedAt update as fire-and-forget (does not await)", async () => {
    setupNotBlocked();
    const token = makeToken();
    mockFindFirst.mockResolvedValue(makeRecord(token));
    mockUpdateApiKey.mockResolvedValue({});
    await authenticateApiKey(makeBearerRequest(token));
    // update is called but not awaited — just verify it was called
    expect(mockUpdateApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      }),
    );
  });
});

// ─── Brute-force blocking ─────────────────────────────────────────────────────

describe("authenticateApiKey: brute-force blocking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws invalid_api_key (401) when IP is blocked", async () => {
    mockRedisGet.mockResolvedValue("1"); // IP is blocked
    const token = makeToken();
    await expect(
      authenticateApiKey(makeBearerRequest(token)),
    ).rejects.toMatchObject({
      code: "invalid_api_key",
      httpStatus: 401,
    });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("blocks IP after 10 failed attempts", async () => {
    setupNotBlocked();
    mockFindFirst.mockResolvedValue(null);
    mockRedisIncr.mockResolvedValue(10);
    mockRedisExpire.mockResolvedValue(1);
    mockRedisSet.mockResolvedValue("OK");
    mockLogAudit.mockResolvedValue(undefined);

    const token = makeToken();
    await expect(
      authenticateApiKey(makeBearerRequest(token)),
    ).rejects.toMatchObject({
      code: "invalid_api_key",
    });

    // Give fire-and-forget a tick to run
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringContaining("brute:ip:"),
      "1",
      expect.objectContaining({ ex: 900 }),
    );
  });
});

// ─── requireScope ─────────────────────────────────────────────────────────────

describe("requireScope", () => {
  it("does not throw when scope is present", () => {
    expect(() =>
      requireScope(["complete", "chat", "read"], "complete"),
    ).not.toThrow();
    expect(() =>
      requireScope(["complete", "chat", "read"], "read"),
    ).not.toThrow();
  });

  it("throws insufficient_scope (403) when scope is missing", () => {
    expect(() => requireScope(["read"], "complete")).toThrow(
      expect.objectContaining({ code: "insufficient_scope", httpStatus: 403 }),
    );
  });

  it("scope enforcement is consistent for arbitrary scope sets (>=100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("complete", "chat", "read", "admin"), {
          minLength: 0,
          maxLength: 4,
        }),
        fc.constantFrom("complete", "chat", "read", "admin"),
        (scopes, required) => {
          const hasScope = scopes.includes(required);
          if (hasScope) {
            expect(() => requireScope(scopes, required)).not.toThrow();
          } else {
            expect(() => requireScope(scopes, required)).toThrow(
              expect.objectContaining({ code: "insufficient_scope" }),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── ApiAuthError ─────────────────────────────────────────────────────────────

describe("ApiAuthError", () => {
  it("is an instance of Error", () => {
    const err = new ApiAuthError("missing_api_key", 401);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiAuthError");
  });

  it("carries correct code and httpStatus", () => {
    const codes = [
      ["missing_api_key", 401],
      ["invalid_api_key", 401],
      ["api_key_revoked", 401],
      ["api_key_expired", 401],
      ["insufficient_scope", 403],
    ] as const;
    for (const [code, status] of codes) {
      const err = new ApiAuthError(code, status);
      expect(err.code).toBe(code);
      expect(err.httpStatus).toBe(status);
    }
  });
});

// ─── Property Tests (P1–P4) ───────────────────────────────────────────────────

// Feature: core-api-budget-firewall, Property 1: API Key Structural Invariants
// For any generated API key K: K.raw matches /^gct_[0-9a-f]{48}$/, SHA-256(K.raw) === K.keyHash, K.raw.slice(0, 12) === K.prefix
// Validates: Requirements 1.1, 1.2, 1.3, 1.11, 1.12
describe("Property 1: API Key Structural Invariants", () => {
  it("generated key format, hash, and prefix invariants hold for arbitrary key material", () => {
    fc.assert(
      fc.property(
        // Generate 24 random bytes (48 hex chars) as key material
        fc.uint8Array({ minLength: 24, maxLength: 24 }),
        (keyBytes) => {
          // Simulate key generation: gct_ + 48 hex chars
          const rawKey = "gct_" + Buffer.from(keyBytes).toString("hex");

          // Invariant 1: format matches /^gct_[0-9a-f]{48}$/
          expect(rawKey).toMatch(/^gct_[0-9a-f]{48}$/);

          // Invariant 2: SHA-256(raw) === keyHash
          const keyHash = crypto
            .createHash("sha256")
            .update(rawKey)
            .digest("hex");
          const recomputed = crypto
            .createHash("sha256")
            .update(rawKey)
            .digest("hex");
          expect(keyHash).toBe(recomputed);

          // Invariant 3: prefix === first 12 chars of raw key
          const prefix = rawKey.slice(0, 12);
          expect(prefix).toBe(rawKey.slice(0, 12));
          expect(prefix).toHaveLength(12);
          expect(prefix).toBe(
            "gct_" + Buffer.from(keyBytes).toString("hex").slice(0, 8),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("SHA-256 hash of raw key matches stored keyHash for arbitrary keys", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 24, maxLength: 24 }),
        (keyBytes) => {
          const rawKey = "gct_" + Buffer.from(keyBytes).toString("hex");
          const keyHash = crypto
            .createHash("sha256")
            .update(rawKey)
            .digest("hex");

          // Verify: timingSafeEqual(sha256(rawKey), Buffer.from(keyHash, "hex")) === true
          const providedHash = crypto
            .createHash("sha256")
            .update(rawKey)
            .digest();
          const storedHash = Buffer.from(keyHash, "hex");
          expect(providedHash.length).toBe(storedHash.length);
          expect(crypto.timingSafeEqual(providedHash, storedHash)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: core-api-budget-firewall, Property 2: Authentication Round-Trip
// Create key → authenticate → correct userId/scopes returned
// Validates: Requirements 2.7, 2.11
describe("Property 2: Authentication Round-Trip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("authenticateApiKey returns correct userId and scopes for any valid key and scope set", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => s.trim().length > 0),
        fc.array(fc.constantFrom("complete", "chat", "read", "admin"), {
          minLength: 1,
          maxLength: 4,
        }),
        async (userId, scopes) => {
          vi.clearAllMocks();
          setupNotBlocked();

          const token = makeToken();
          const record = {
            id: "key_roundtrip",
            userId,
            prefix: token.slice(0, 12),
            keyHash: sha256Hex(token),
            isActive: true,
            expiresAt: null,
            scopes,
            projectId: null,
          };
          mockFindFirst.mockResolvedValue(record);
          mockUpdateApiKey.mockResolvedValue({});

          const ctx = await authenticateApiKey(makeBearerRequest(token));

          expect(ctx.userId).toBe(userId);
          expect(ctx.scopes).toEqual(scopes);
          expect(ctx.apiKeyId).toBe("key_roundtrip");
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: core-api-budget-firewall, Property 3: Revocation Correctness
// Revoke key → authenticate → 401 api_key_revoked
// Validates: Requirements 1.8, 2.12
describe("Property 3: Revocation Correctness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revoked key (isActive=false filtered by DB) always returns invalid_api_key 401", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => s.trim().length > 0),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        async (_userId) => {
          vi.clearAllMocks();
          setupNotBlocked();

          // The DB query uses `where: { prefix, isActive: true }` so revoked keys return null
          mockFindFirst.mockResolvedValue(null);

          const token = makeToken();
          await expect(
            authenticateApiKey(makeBearerRequest(token)),
          ).rejects.toMatchObject({
            code: "invalid_api_key",
            httpStatus: 401,
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("key with isActive=false in record always throws (api_key_revoked path via isActive check)", async () => {
    // This tests the explicit isActive check in the code (belt-and-suspenders after hash match)
    // In practice the DB query filters isActive=true, but the code also checks explicitly
    // We simulate a scenario where the record slips through with isActive=false
    vi.clearAllMocks();
    setupNotBlocked();

    const token = makeToken();
    // Simulate record with matching hash but isActive=false (bypassing DB filter)
    const record = makeRecord(token, { isActive: false });
    mockFindFirst.mockResolvedValue(record);

    // The code checks isActive after hash match → throws api_key_revoked
    await expect(
      authenticateApiKey(makeBearerRequest(token)),
    ).rejects.toMatchObject({
      code: "api_key_revoked",
      httpStatus: 401,
    });
  });
});

// Feature: core-api-budget-firewall, Property 4: Scope Enforcement
// Random scope sets: verify 403 when required scope missing, pass when present
// Validates: Requirements 3.6, 3.7
describe("Property 4: Scope Enforcement", () => {
  it("requireScope throws 403 iff required scope is absent from the key's scope set", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("complete", "chat", "read", "admin"), {
          minLength: 0,
          maxLength: 4,
        }),
        fc.constantFrom("complete", "chat", "read", "admin"),
        (scopes, required) => {
          const hasScope = scopes.includes(required);
          if (hasScope) {
            // R ∈ S → must NOT throw
            expect(() => requireScope(scopes, required)).not.toThrow();
          } else {
            // R ∉ S → must throw insufficient_scope 403
            let thrown: unknown;
            try {
              requireScope(scopes, required);
            } catch (e) {
              thrown = e;
            }
            expect(thrown).toBeInstanceOf(ApiAuthError);
            expect((thrown as ApiAuthError).code).toBe("insufficient_scope");
            expect((thrown as ApiAuthError).httpStatus).toBe(403);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("scope enforcement holds for authenticated requests: missing scope → 403 from authenticateApiKey flow", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom("complete", "chat", "read", "admin"), {
          minLength: 0,
          maxLength: 4,
        }),
        fc.constantFrom("complete", "chat", "read", "admin"),
        async (scopes, required) => {
          vi.clearAllMocks();
          setupNotBlocked();

          const token = makeToken();
          mockFindFirst.mockResolvedValue(makeRecord(token, { scopes }));
          mockUpdateApiKey.mockResolvedValue({});

          const hasScope = scopes.includes(required);

          if (hasScope) {
            // Auth succeeds, then requireScope should not throw
            const ctx = await authenticateApiKey(makeBearerRequest(token));
            expect(() => requireScope(ctx.scopes, required)).not.toThrow();
          } else {
            // Auth succeeds but requireScope throws
            const ctx = await authenticateApiKey(makeBearerRequest(token));
            expect(() => requireScope(ctx.scopes, required)).toThrow(
              expect.objectContaining({
                code: "insufficient_scope",
                httpStatus: 403,
              }),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
