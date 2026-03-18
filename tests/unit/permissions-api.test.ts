/**
 * Unit Tests for Permission API Routes
 *
 * Tests for:
 *   GET  /api/auth/permissions       - returns all user permissions
 *   POST /api/auth/permissions/check - checks a specific permission
 *
 * Validates Requirements: 5.1, 5.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/permissions", () => ({
  getUserPermissions: vi.fn(),
  hasPermission: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal POST Request with a JSON body. */
function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/permissions/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Build a POST Request whose body is not valid JSON. */
function makeMalformedRequest(): Request {
  return new Request("http://localhost/api/auth/permissions/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json{{{",
  });
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe("GET /api/auth/permissions", () => {
  let mockAuth: ReturnType<typeof vi.fn>;
  let mockFindUnique: ReturnType<typeof vi.fn>;
  let mockGetUserPermissions: ReturnType<typeof vi.fn>;
  let GET: () => Promise<NextResponse>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const clerkModule = await import("@clerk/nextjs/server");
    mockAuth = clerkModule.auth as unknown as ReturnType<typeof vi.fn>;

    const { prisma } = await import("@/lib/prisma");
    mockFindUnique = prisma.user.findUnique as unknown as ReturnType<
      typeof vi.fn
    >;

    const permsModule = await import("@/lib/permissions");
    mockGetUserPermissions =
      permsModule.getUserPermissions as unknown as ReturnType<typeof vi.fn>;

    // Re-import route after mocks are in place
    ({ GET } = await import("@/app/api/auth/permissions/route"));
  });

  it("returns all permissions for an authenticated user", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk_abc" });
    mockFindUnique.mockResolvedValue({ id: "user_123" });
    mockGetUserPermissions.mockResolvedValue(["analytics:read", "users:read"]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ permissions: ["analytics:read", "users:read"] });
    expect(mockGetUserPermissions).toHaveBeenCalledWith("user_123");
  });

  it("returns an empty permissions array when user has no roles", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk_abc" });
    mockFindUnique.mockResolvedValue({ id: "user_123" });
    mockGetUserPermissions.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ permissions: [] });
  });

  it("returns 401 when the request is unauthenticated (no Clerk session)", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: "Unauthorized" });
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockGetUserPermissions).not.toHaveBeenCalled();
  });

  it("returns 401 when the Clerk user has no matching database record", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk_ghost" });
    mockFindUnique.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: "Unauthorized" });
    expect(mockGetUserPermissions).not.toHaveBeenCalled();
  });

  it("resolves the internal user ID from the Clerk ID before fetching permissions", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk_xyz" });
    mockFindUnique.mockResolvedValue({ id: "internal_456" });
    mockGetUserPermissions.mockResolvedValue(["billing:read"]);

    await GET();

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { clerkId: "clerk_xyz" },
      select: { id: true },
    });
    expect(mockGetUserPermissions).toHaveBeenCalledWith("internal_456");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/permissions/check", () => {
  let mockAuth: ReturnType<typeof vi.fn>;
  let mockFindUnique: ReturnType<typeof vi.fn>;
  let mockHasPermission: ReturnType<typeof vi.fn>;
  let POST: (req: Request) => Promise<NextResponse>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const clerkModule = await import("@clerk/nextjs/server");
    mockAuth = clerkModule.auth as unknown as ReturnType<typeof vi.fn>;

    const { prisma } = await import("@/lib/prisma");
    mockFindUnique = prisma.user.findUnique as unknown as ReturnType<
      typeof vi.fn
    >;

    const permsModule = await import("@/lib/permissions");
    mockHasPermission = permsModule.hasPermission as unknown as ReturnType<
      typeof vi.fn
    >;

    ({ POST } = await import("@/app/api/auth/permissions/check/route"));
  });

  it("returns { allowed: true } when user has the requested permission", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk_abc" });
    mockFindUnique.mockResolvedValue({ id: "user_123" });
    mockHasPermission.mockResolvedValue(true);

    const res = await POST(makePostRequest({ permission: "users:read" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ allowed: true });
    expect(mockHasPermission).toHaveBeenCalledWith("user_123", "users:read");
  });

  it("returns { allowed: false } when user lacks the requested permission", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk_abc" });
    mockFindUnique.mockResolvedValue({ id: "user_123" });
    mockHasPermission.mockResolvedValue(false);

    const res = await POST(makePostRequest({ permission: "users:delete" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ allowed: false });
  });

  it("returns 401 when the request is unauthenticated (no Clerk session)", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const res = await POST(makePostRequest({ permission: "users:read" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: "Unauthorized" });
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockHasPermission).not.toHaveBeenCalled();
  });

  it("returns 401 when the Clerk user has no matching database record", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk_ghost" });
    mockFindUnique.mockResolvedValue(null);

    const res = await POST(makePostRequest({ permission: "analytics:read" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: "Unauthorized" });
    expect(mockHasPermission).not.toHaveBeenCalled();
  });

  it("returns 400 when the permission field is missing from the body", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk_abc" });
    mockFindUnique.mockResolvedValue({ id: "user_123" });

    const res = await POST(makePostRequest({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/permission/i);
    expect(mockHasPermission).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk_abc" });
    mockFindUnique.mockResolvedValue({ id: "user_123" });

    const res = await POST(makeMalformedRequest());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/bad request/i);
  });

  it("resolves the internal user ID from the Clerk ID before checking permission", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk_xyz" });
    mockFindUnique.mockResolvedValue({ id: "internal_456" });
    mockHasPermission.mockResolvedValue(true);

    await POST(makePostRequest({ permission: "audit:read" }));

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { clerkId: "clerk_xyz" },
      select: { id: true },
    });
    expect(mockHasPermission).toHaveBeenCalledWith(
      "internal_456",
      "audit:read",
    );
  });

  it("correctly checks analytics:read permission", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk_abc" });
    mockFindUnique.mockResolvedValue({ id: "user_123" });
    mockHasPermission.mockResolvedValue(true);

    const res = await POST(makePostRequest({ permission: "analytics:read" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ allowed: true });
    expect(mockHasPermission).toHaveBeenCalledWith(
      "user_123",
      "analytics:read",
    );
  });

  it("correctly checks billing:write permission", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk_abc" });
    mockFindUnique.mockResolvedValue({ id: "user_123" });
    mockHasPermission.mockResolvedValue(false);

    const res = await POST(makePostRequest({ permission: "billing:write" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ allowed: false });
  });
});
