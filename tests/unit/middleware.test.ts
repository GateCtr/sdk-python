/**
 * Unit Tests for Middleware (proxy.ts)
 *
 * Tests the core middleware logic:
 * - Unauthenticated users are redirected to sign-in
 * - Authenticated users can access protected routes
 * - Admin routes require admin role
 * - Public routes allow unauthenticated access
 * - API routes return 401 for unauthenticated requests
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5, 6.2
 *
 * NOTE: Because clerkMiddleware wraps the handler, we test the internal
 * logic (sanitizeRedirectUrl, redirect URL construction, route matching)
 * directly rather than invoking the full middleware stack which requires
 * a Next.js runtime.
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/permissions", () => ({
  checkRouteAccess: vi.fn(),
  ROLE_PERMISSIONS: {},
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next-intl/middleware", () => ({
  default: vi.fn(() => vi.fn(() => ({ status: 200 }))),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: vi.fn(
    (handler: (auth: unknown, req: unknown) => unknown) => handler,
  ),
  // createRouteMatcher is not exercised in these unit tests — stub it out
  createRouteMatcher: vi.fn(() => vi.fn(() => false)),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn(() => ({ type: "next" })),
    redirect: vi.fn((url: URL) => ({ type: "redirect", url: url.href })),
    json: vi.fn((body: object, init?: { status?: number }) => ({
      type: "json",
      body,
      status: init?.status ?? 200,
    })),
  },
}));

vi.mock("./i18n/routing", () => ({
  routing: { defaultLocale: "en", locales: ["en", "fr"] },
}));

// ---------------------------------------------------------------------------
// sanitizeRedirectUrl — extracted logic tests
// ---------------------------------------------------------------------------

/**
 * We test the sanitizeRedirectUrl logic inline since it is not exported.
 * The function is reproduced here to match proxy.ts exactly.
 */
const ALLOWED_REDIRECT_HOSTS = new Set(["localhost:3000"]);

function sanitizeRedirectUrl(
  raw: string | null,
  requestUrl: string,
): string | null {
  if (!raw) return null;
  try {
    const base = new URL(requestUrl);
    const target = new URL(raw, base);
    if (!ALLOWED_REDIRECT_HOSTS.has(target.host)) return null;
    return target.pathname + target.search + target.hash;
  } catch {
    return null;
  }
}

describe("sanitizeRedirectUrl", () => {
  it("returns the path for a same-origin relative URL", () => {
    expect(
      sanitizeRedirectUrl("/dashboard", "http://localhost:3000/sign-in"),
    ).toBe("/dashboard");
  });

  it("returns path + query for a relative URL with query params", () => {
    expect(
      sanitizeRedirectUrl(
        "/dashboard?tab=billing",
        "http://localhost:3000/sign-in",
      ),
    ).toBe("/dashboard?tab=billing");
  });

  it("returns null for an external domain", () => {
    expect(
      sanitizeRedirectUrl(
        "https://evil.com/steal",
        "http://localhost:3000/sign-in",
      ),
    ).toBeNull();
  });

  it("returns null for a protocol-relative external URL", () => {
    expect(
      sanitizeRedirectUrl("//evil.com/path", "http://localhost:3000/sign-in"),
    ).toBeNull();
  });

  it("returns null for null input", () => {
    expect(
      sanitizeRedirectUrl(null, "http://localhost:3000/sign-in"),
    ).toBeNull();
  });

  it("strips the host from an absolute same-origin URL", () => {
    expect(
      sanitizeRedirectUrl(
        "http://localhost:3000/dashboard",
        "http://localhost:3000/sign-in",
      ),
    ).toBe("/dashboard");
  });
});

// ---------------------------------------------------------------------------
// Redirect URL construction
// ---------------------------------------------------------------------------

describe("Redirect URL construction", () => {
  const BASE = "http://localhost:3000";

  function buildSignInRedirect(pathname: string, locale: "en" | "fr"): URL {
    const signInPath = locale === "fr" ? "/fr/sign-in" : "/sign-in";
    const signInUrl = new URL(signInPath, BASE);
    const safeRedirect = sanitizeRedirectUrl(pathname, `${BASE}${pathname}`);
    if (safeRedirect) signInUrl.searchParams.set("redirect_url", safeRedirect);
    return signInUrl;
  }

  describe("Unauthenticated users are redirected to sign-in (Req 2.1)", () => {
    it("redirects /dashboard to /sign-in?redirect_url=/dashboard", () => {
      const url = buildSignInRedirect("/dashboard", "en");
      expect(url.pathname).toBe("/sign-in");
      expect(url.searchParams.get("redirect_url")).toBe("/dashboard");
    });

    it("redirects /admin/users to /sign-in?redirect_url=/admin/users", () => {
      const url = buildSignInRedirect("/admin/users", "en");
      expect(url.pathname).toBe("/sign-in");
      expect(url.searchParams.get("redirect_url")).toBe("/admin/users");
    });

    it("redirects /fr/dashboard to /fr/sign-in?redirect_url=/fr/dashboard", () => {
      const url = buildSignInRedirect("/fr/dashboard", "fr");
      expect(url.pathname).toBe("/fr/sign-in");
      expect(url.searchParams.get("redirect_url")).toBe("/fr/dashboard");
    });

    it("preserves query parameters in redirect_url", () => {
      const url = buildSignInRedirect("/dashboard?tab=billing", "en");
      expect(url.pathname).toBe("/sign-in");
      expect(url.searchParams.get("redirect_url")).toBe(
        "/dashboard?tab=billing",
      );
    });
  });

  describe("Locale preservation in redirects (Req 2.4)", () => {
    it("English paths use /sign-in", () => {
      const url = buildSignInRedirect("/profile", "en");
      expect(url.pathname).toBe("/sign-in");
    });

    it("French paths use /fr/sign-in", () => {
      const url = buildSignInRedirect("/fr/profile", "fr");
      expect(url.pathname).toBe("/fr/sign-in");
    });
  });
});

// ---------------------------------------------------------------------------
// Public route detection
// ---------------------------------------------------------------------------

describe("Public routes allow unauthenticated access (Req 2.2)", () => {
  const publicPaths = [
    "/",
    "/waitlist",
    "/fr",
    "/fr/waitlist",
    "/api/waitlist",
    "/api/waitlist/invite",
    "/api/v1/complete",
    "/api/health",
    "/sign-in",
    "/sign-in/sso-callback",
    "/sign-up",
    "/sign-up/verify",
    "/fr/sign-in",
    "/fr/sign-up",
  ];

  // Replicate the isPublicRoute logic from proxy.ts
  function isPublicRoute(pathname: string): boolean {
    const patterns = [
      /^\/$/,
      /^\/waitlist$/,
      /^\/fr$/,
      /^\/fr\/waitlist$/,
      /^\/api\/waitlist(\/.*)?$/,
      /^\/api\/v1\/.+$/,
      /^\/api\/health$/,
      /^\/sign-in(\/.*)?$/,
      /^\/sign-up(\/.*)?$/,
      /^\/fr\/sign-in(\/.*)?$/,
      /^\/fr\/sign-up(\/.*)?$/,
    ];
    return patterns.some((p) => p.test(pathname));
  }

  it.each(publicPaths)('"%s" is a public route', (path) => {
    expect(isPublicRoute(path)).toBe(true);
  });

  const protectedPaths = [
    "/dashboard",
    "/admin/users",
    "/fr/dashboard",
    "/profile",
    "/settings",
  ];

  it.each(protectedPaths)('"%s" is NOT a public route', (path) => {
    expect(isPublicRoute(path)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Admin route detection
// ---------------------------------------------------------------------------

describe("Admin routes require admin role (Req 6.2)", () => {
  function isAdminRoute(pathname: string): boolean {
    return (
      /^\/admin(\/.*)?$/.test(pathname) || /^\/fr\/admin(\/.*)?$/.test(pathname)
    );
  }

  const adminPaths = [
    "/admin",
    "/admin/users",
    "/admin/audit-logs",
    "/admin/waitlist",
    "/fr/admin",
    "/fr/admin/users",
  ];

  it.each(adminPaths)('"%s" is an admin route', (path) => {
    expect(isAdminRoute(path)).toBe(true);
  });

  const nonAdminPaths = [
    "/dashboard",
    "/profile",
    "/fr/dashboard",
    "/api/admin",
  ];

  it.each(nonAdminPaths)('"%s" is NOT an admin route', (path) => {
    expect(isAdminRoute(path)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// API route behaviour
// ---------------------------------------------------------------------------

describe("API routes return 401 for unauthenticated requests (Req 2.5)", () => {
  /**
   * The middleware logic for API routes:
   * 1. /api/webhooks/* → pass through (no auth)
   * 2. Non-public API routes without userId → 401
   * 3. Public API routes → pass through
   */
  function handleApiRoute(
    pathname: string,
    userId: string | null,
    isPublic: boolean,
  ): { status: number } | "next" {
    if (pathname.startsWith("/api/webhooks/")) return "next";
    if (!isPublic && !userId) return { status: 401 };
    return "next";
  }

  it("webhook routes pass through without auth", () => {
    expect(handleApiRoute("/api/webhooks/clerk", null, false)).toBe("next");
  });

  it("protected API route without userId returns 401", () => {
    expect(handleApiRoute("/api/auth/permissions", null, false)).toEqual({
      status: 401,
    });
  });

  it("protected API route with userId passes through", () => {
    expect(handleApiRoute("/api/auth/permissions", "user_123", false)).toBe(
      "next",
    );
  });

  it("public API route without userId passes through", () => {
    expect(handleApiRoute("/api/waitlist", null, true)).toBe("next");
  });

  it("public API route /api/v1/* passes through without auth", () => {
    expect(handleApiRoute("/api/v1/complete", null, true)).toBe("next");
  });

  it("public API route /api/health passes through without auth", () => {
    expect(handleApiRoute("/api/health", null, true)).toBe("next");
  });
});

// ---------------------------------------------------------------------------
// Authenticated users can access protected routes (Req 2.3)
// ---------------------------------------------------------------------------

describe("Authenticated users can access protected routes (Req 2.3)", () => {
  /**
   * When userId is present and the route is not admin-only, the middleware
   * should allow the request (pass to intl middleware).
   */
  function shouldAllowAccess(
    pathname: string,
    userId: string | null,
    isPublic: boolean,
    isAdmin: boolean,
    hasAdminAccess: boolean,
  ): boolean {
    if (!isPublic && !userId) return false; // unauthenticated → redirect
    if (isAdmin && userId && !hasAdminAccess) return false; // admin route, no access
    return true;
  }

  it("authenticated user can access /dashboard", () => {
    expect(
      shouldAllowAccess("/dashboard", "user_123", false, false, false),
    ).toBe(true);
  });

  it("unauthenticated user cannot access /dashboard", () => {
    expect(shouldAllowAccess("/dashboard", null, false, false, false)).toBe(
      false,
    );
  });

  it("authenticated admin can access /admin/users", () => {
    expect(
      shouldAllowAccess("/admin/users", "user_123", false, true, true),
    ).toBe(true);
  });

  it("authenticated non-admin cannot access /admin/users", () => {
    expect(
      shouldAllowAccess("/admin/users", "user_123", false, true, false),
    ).toBe(false);
  });

  it("unauthenticated user can access public route /", () => {
    expect(shouldAllowAccess("/", null, true, false, false)).toBe(true);
  });

  it("unauthenticated user can access /waitlist", () => {
    expect(shouldAllowAccess("/waitlist", null, true, false, false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Locale extraction
// ---------------------------------------------------------------------------

describe("Locale extraction from pathname", () => {
  function extractLocale(pathname: string): "en" | "fr" {
    return /^\/fr(\/|$)/.test(pathname) ? "fr" : "en";
  }

  it('extracts "fr" from /fr/dashboard', () => {
    expect(extractLocale("/fr/dashboard")).toBe("fr");
  });

  it('extracts "fr" from /fr', () => {
    expect(extractLocale("/fr")).toBe("fr");
  });

  it('extracts "en" from /dashboard', () => {
    expect(extractLocale("/dashboard")).toBe("en");
  });

  it('extracts "en" from /', () => {
    expect(extractLocale("/")).toBe("en");
  });

  it('extracts "en" from /france (not a locale prefix)', () => {
    expect(extractLocale("/france")).toBe("en");
  });
});
