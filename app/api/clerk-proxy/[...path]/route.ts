/**
 * Clerk Frontend API Proxy
 * Forwards all /__clerk/* requests to Clerk's Frontend API.
 * Required when running behind ngrok or any tunnel in development.
 * See: https://clerk.com/docs/advanced-usage/using-proxies
 */

const CLERK_FRONTEND_API = "https://frontend-api.clerk.dev";

async function handler(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = new URL(req.url);
  const targetUrl = `${CLERK_FRONTEND_API}/${path.join("/")}${url.search}`;

  const headers = new Headers(req.headers);
  headers.set(
    "Clerk-Proxy-Url",
    `${process.env.NEXT_PUBLIC_APP_URL}/api/clerk-proxy`,
  );
  headers.set("Clerk-Secret-Key", process.env.CLERK_SECRET_KEY!);
  headers.set(
    "X-Forwarded-For",
    req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "127.0.0.1",
  );

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    // @ts-expect-error — duplex required for streaming body
    duplex: "half",
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
