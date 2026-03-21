import crypto from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logAudit } from "@/lib/audit";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthContext {
  userId: string;
  apiKeyId: string;
  scopes: string[];
  projectId?: string;
}

export type ApiAuthErrorCode =
  | "missing_api_key"
  | "invalid_api_key"
  | "api_key_revoked"
  | "api_key_expired"
  | "insufficient_scope";

export class ApiAuthError extends Error {
  code: ApiAuthErrorCode;
  httpStatus: 401 | 403;

  constructor(code: ApiAuthErrorCode, httpStatus: 401 | 403, message?: string) {
    super(message ?? code);
    this.name = "ApiAuthError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function sha256Hex(input: string): Buffer {
  return crypto.createHash("sha256").update(input).digest();
}

// ─── Brute-force helpers ──────────────────────────────────────────────────────

const BRUTE_COUNT_TTL = 300; // 5 minutes
const BRUTE_BLOCK_TTL = 900; // 15 minutes
const BRUTE_THRESHOLD = 10;

async function isIpBlocked(ip: string): Promise<boolean> {
  try {
    const blocked = await redis.get(`brute:ip:${ip}`);
    return blocked !== null;
  } catch {
    // fail-open
    return false;
  }
}

async function recordFailedAttempt(ip: string, userId?: string): Promise<void> {
  try {
    const countKey = `brute:count:${ip}`;
    const count = await redis.incr(countKey);
    if (count === 1) {
      // First failure in this window — set TTL
      await redis.expire(countKey, BRUTE_COUNT_TTL);
    }
    if (count >= BRUTE_THRESHOLD) {
      // Block the IP
      await redis.set(`brute:ip:${ip}`, "1", { ex: BRUTE_BLOCK_TTL });
      // Fire-and-forget: log brute force detection
      logAudit({
        userId,
        resource: "api_key",
        action: "brute_force_detected",
        ipAddress: ip,
        success: false,
      }).catch(() => {});
    }
  } catch {
    // fail-open — Redis errors must not block requests
  }
}

// ─── Core auth function ───────────────────────────────────────────────────────

export async function authenticateApiKey(
  req: NextRequest,
): Promise<AuthContext> {
  const ip = getClientIp(req);

  // 1. Extract Bearer token
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiAuthError("missing_api_key", 401);
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new ApiAuthError("missing_api_key", 401);
  }

  // 2. Check if IP is blocked (brute-force protection)
  const blocked = await isIpBlocked(ip);
  if (blocked) {
    throw new ApiAuthError("invalid_api_key", 401);
  }

  // Helper to handle auth failure side-effects
  const handleFailure = (userId?: string) => {
    // Fire-and-forget: increment brute-force counter
    recordFailedAttempt(ip, userId).catch(() => {});
    // Fire-and-forget: audit log
    logAudit({
      userId,
      resource: "api_key",
      action: "auth_failed",
      ipAddress: ip,
      success: false,
    }).catch(() => {});
  };

  // 3. Prefix lookup
  const prefix = token.slice(0, 12);
  const record = await prisma.apiKey.findFirst({
    where: { prefix, isActive: true },
  });

  if (!record) {
    handleFailure();
    throw new ApiAuthError("invalid_api_key", 401);
  }

  // 4. Constant-time hash comparison (SHA-256)
  const providedHash = sha256Hex(token);
  const storedHash = Buffer.from(record.keyHash, "hex");

  // Buffers must be same length for timingSafeEqual
  let hashMatch = false;
  if (providedHash.length === storedHash.length) {
    hashMatch = crypto.timingSafeEqual(providedHash, storedHash);
  }

  if (!hashMatch) {
    handleFailure(record.userId);
    throw new ApiAuthError("invalid_api_key", 401);
  }

  // 5. Check isActive (redundant with query but explicit per spec)
  if (!record.isActive) {
    handleFailure(record.userId);
    throw new ApiAuthError("api_key_revoked", 401);
  }

  // 6. Check expiry
  if (record.expiresAt && record.expiresAt < new Date()) {
    handleFailure(record.userId);
    throw new ApiAuthError("api_key_expired", 401);
  }

  // 9. Fire-and-forget: update lastUsedAt and lastUsedIp
  prisma.apiKey
    .update({
      where: { id: record.id },
      data: { lastUsedAt: new Date(), lastUsedIp: ip },
    })
    .catch(() => {});

  // 10. Return AuthContext
  return {
    userId: record.userId,
    apiKeyId: record.id,
    scopes: record.scopes,
    projectId: record.projectId ?? undefined,
  };
}

// ─── Scope enforcement ────────────────────────────────────────────────────────

export function requireScope(scopes: string[], required: string): void {
  if (!scopes.includes(required)) {
    throw new ApiAuthError(
      "insufficient_scope",
      403,
      `Required scope: ${required}`,
    );
  }
}
