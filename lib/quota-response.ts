import { NextResponse } from "next/server";
import type { QuotaResult } from "@/lib/plan-guard";

/**
 * Returns a 429 response with a structured quota_exceeded payload.
 * Only call this when result.allowed === false.
 */
export function quotaExceededResponse(
  result: QuotaResult & { allowed: false },
): NextResponse {
  return NextResponse.json(
    {
      error: "quota_exceeded",
      quota: result.quota,
      limit: result.limit,
      current: result.current,
      upgradeUrl: "/billing",
    },
    { status: 429 },
  );
}
