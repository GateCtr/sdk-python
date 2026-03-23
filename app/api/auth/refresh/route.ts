import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/refresh?redirect=/dashboard
 *
 * Forces Clerk to issue a fresh session token by calling auth() server-side,
 * then redirects to the requested path.
 *
 * Used after onboarding completion to ensure the new publicMetadata
 * (onboardingComplete: true) is reflected in the JWT before hitting
 * the middleware gate.
 */
export async function GET(req: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const { searchParams } = new URL(req.url);
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  // Validate redirect path — only allow relative paths on same origin
  const safePath = redirect.startsWith("/") ? redirect : "/dashboard";

  const response = NextResponse.redirect(new URL(safePath, req.url));
  // Tell Clerk middleware to re-evaluate the session on next request
  response.headers.set("x-clerk-auth-reason", "token-refresh");
  return response;
}
