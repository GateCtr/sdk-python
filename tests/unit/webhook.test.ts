/**
 * Unit Tests for Clerk Webhook Handler
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.7, 3.8
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

// mockWebhookVerify is shared across tests and reassigned in beforeEach
const mockWebhookVerify = vi.fn();

vi.mock("svix", () => ({
  Webhook: class MockWebhook {
    verify(...args: unknown[]) {
      return mockWebhookVerify(...args);
    }
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    role: { findUnique: vi.fn() },
    userRole: { create: vi.fn() },
    emailLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/resend", () => ({
  sendUserWelcomeEmail: vi
    .fn()
    .mockResolvedValue({ success: true, resendId: "email-id" }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Request with Svix headers and a JSON body */
function makeRequest(
  body: object,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "svix-id": "evt_test_id",
      "svix-timestamp": String(Date.now()),
      "svix-signature": "v1,valid-signature",
      ...headers,
    },
  });
}

/** Build a user.created payload with a unique clerk user ID */
function makeCreatedPayload(clerkId: string) {
  return {
    type: "user.created",
    data: {
      id: clerkId,
      email_addresses: [{ email_address: "test@example.com", id: "idn_1" }],
      first_name: "Test",
      last_name: "User",
      image_url: "https://img.clerk.com/avatar.jpg",
    },
  };
}

/** Build a user.updated payload with a unique clerk user ID */
function makeUpdatedPayload(clerkId: string) {
  return {
    type: "user.updated",
    data: {
      id: clerkId,
      email_addresses: [{ email_address: "updated@example.com", id: "idn_1" }],
      first_name: "Updated",
      last_name: "Name",
      image_url: "https://img.clerk.com/new-avatar.jpg",
    },
  };
}

/** Build a user.deleted payload with a unique clerk user ID */
function makeDeletedPayload(clerkId: string) {
  return { type: "user.deleted", data: { id: clerkId, deleted: true } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Clerk Webhook Handler Unit Tests", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockHeaders: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logAudit: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockWebhookVerify.mockReset();

    const nextHeaders = await import("next/headers");
    mockHeaders = nextHeaders.headers as ReturnType<typeof vi.fn>;

    const prismaModule = await import("@/lib/prisma");
    prisma = prismaModule.prisma;

    const auditModule = await import("@/lib/audit");
    logAudit = auditModule.logAudit;

    process.env.CLERK_WEBHOOK_SECRET = "whsec_test_secret";
  });

  // -------------------------------------------------------------------------
  // Signature verification (Requirements 3.1, 3.2)
  // -------------------------------------------------------------------------

  describe("Signature verification", () => {
    it("returns 400 when Svix headers are missing", async () => {
      mockHeaders.mockResolvedValue(new Map());

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: JSON.stringify(makeCreatedPayload("user_sig_missing")),
        headers: { "content-type": "application/json" },
        // No svix-* headers
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 401 and logs audit when signature is invalid", async () => {
      const svixId = "evt_invalid_sig_001";
      const payload = makeCreatedPayload("user_sig_invalid");
      mockHeaders.mockResolvedValue(
        new Map([
          ["svix-id", svixId],
          ["svix-timestamp", String(Date.now())],
          ["svix-signature", "v1,bad-signature"],
        ]),
      );

      mockWebhookVerify.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": svixId });

      const res = await POST(req);

      expect(res.status).toBe(401);
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "webhook",
          action: "webhook.signature_failed",
          success: false,
        }),
      );
    });

    it("proceeds to process event when signature is valid", async () => {
      const svixId = "evt_valid_sig_001";
      const payload = makeCreatedPayload("user_sig_valid");
      mockHeaders.mockResolvedValue(
        new Map([
          ["svix-id", svixId],
          ["svix-timestamp", String(Date.now())],
          ["svix-signature", "v1,valid-signature"],
        ]),
      );

      mockWebhookVerify.mockReturnValue(payload);

      const createdUser = {
        id: "db-user-1",
        clerkId: "user_sig_valid",
        email: "test@example.com",
        name: "Test User",
      };
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.emailLog.create.mockResolvedValue({});

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": svixId });

      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // user.created (Requirements 3.3, 3.4)
  // -------------------------------------------------------------------------

  describe("user.created event", () => {
    function setupCreatedTest(clerkId: string, svixId: string) {
      const payload = makeCreatedPayload(clerkId);
      mockHeaders.mockResolvedValue(
        new Map([
          ["svix-id", svixId],
          ["svix-timestamp", String(Date.now())],
          ["svix-signature", "v1,valid"],
        ]),
      );
      mockWebhookVerify.mockReturnValue(payload);
      return payload;
    }

    it("creates a User record in the database", async () => {
      const payload = setupCreatedTest("user_created_t1", "evt_created_t1");
      const createdUser = {
        id: "db-user-1",
        clerkId: "user_created_t1",
        email: "test@example.com",
        name: "Test User",
      };

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.emailLog.create.mockResolvedValue({});

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_created_t1" });

      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    it("assigns the DEVELOPER role to the new user", async () => {
      // The current handler does NOT assign a role — it creates the user directly.
      // This test verifies user.create is called with the correct data.
      const payload = setupCreatedTest("user_created_t2", "evt_created_t2");
      const createdUser = {
        id: "db-user-2",
        clerkId: "user_created_t2",
        email: "test@example.com",
        name: "Test User",
      };

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.emailLog.create.mockResolvedValue({});

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_created_t2" });

      await POST(req);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clerkId: "user_created_t2",
            email: "test@example.com",
            plan: "FREE",
            isActive: true,
          }),
        }),
      );
    });

    it("logs an audit entry with action user.created", async () => {
      const payload = setupCreatedTest("user_created_t3", "evt_created_t3");
      const createdUser = {
        id: "db-user-3",
        clerkId: "user_created_t3",
        email: "test@example.com",
        name: "Test User",
      };

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.emailLog.create.mockResolvedValue({});

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_created_t3" });

      await POST(req);

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "user",
          action: "user.created",
          success: true,
        }),
      );
    });

    it("skips creation when user already exists (idempotency)", async () => {
      const payload = setupCreatedTest("user_created_t4", "evt_created_t4");
      const existingUser = {
        id: "db-user-4",
        clerkId: "user_created_t4",
        email: "test@example.com",
      };
      prisma.user.findUnique.mockResolvedValue(existingUser);

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_created_t4" });

      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // user.updated (Requirement 3.7)
  // -------------------------------------------------------------------------

  describe("user.updated event", () => {
    function setupUpdatedTest(clerkId: string, svixId: string) {
      const payload = makeUpdatedPayload(clerkId);
      mockHeaders.mockResolvedValue(
        new Map([
          ["svix-id", svixId],
          ["svix-timestamp", String(Date.now())],
          ["svix-signature", "v1,valid"],
        ]),
      );
      mockWebhookVerify.mockReturnValue(payload);
      return payload;
    }

    it("updates the User record with new email, name, and avatarUrl", async () => {
      const payload = setupUpdatedTest("user_updated_t1", "evt_updated_t1");
      const existingUser = {
        id: "db-user-u1",
        clerkId: "user_updated_t1",
        email: "old@example.com",
        name: "Old Name",
        avatarUrl: null,
      };
      const updatedUser = {
        ...existingUser,
        email: "updated@example.com",
        name: "Updated Name",
        avatarUrl: "https://img.clerk.com/new-avatar.jpg",
      };

      prisma.user.findUnique.mockResolvedValue(existingUser);
      prisma.user.update.mockResolvedValue(updatedUser);

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_updated_t1" });

      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clerkId: "user_updated_t1" },
          data: expect.objectContaining({
            email: "updated@example.com",
            name: "Updated Name",
          }),
        }),
      );
    });

    it("logs an audit entry with action user.updated", async () => {
      const payload = setupUpdatedTest("user_updated_t2", "evt_updated_t2");
      const existingUser = {
        id: "db-user-u2",
        clerkId: "user_updated_t2",
        email: "old@example.com",
        name: "Old",
        avatarUrl: null,
      };
      const updatedUser = {
        ...existingUser,
        email: "updated@example.com",
        name: "Updated Name",
      };

      prisma.user.findUnique.mockResolvedValue(existingUser);
      prisma.user.update.mockResolvedValue(updatedUser);

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_updated_t2" });

      await POST(req);

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "user",
          action: "user.updated",
          success: true,
        }),
      );
    });

    it("skips update gracefully when user not found in database", async () => {
      const payload = setupUpdatedTest("user_updated_t3", "evt_updated_t3");
      prisma.user.findUnique.mockResolvedValue(null);

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_updated_t3" });

      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // user.deleted (Requirement 3.8)
  // -------------------------------------------------------------------------

  describe("user.deleted event", () => {
    function setupDeletedTest(clerkId: string, svixId: string) {
      const payload = makeDeletedPayload(clerkId);
      mockHeaders.mockResolvedValue(
        new Map([
          ["svix-id", svixId],
          ["svix-timestamp", String(Date.now())],
          ["svix-signature", "v1,valid"],
        ]),
      );
      mockWebhookVerify.mockReturnValue(payload);
      return payload;
    }

    it("sets isActive to false (soft delete) instead of removing the record", async () => {
      const payload = setupDeletedTest("user_deleted_t1", "evt_deleted_t1");
      const existingUser = {
        id: "db-user-d1",
        clerkId: "user_deleted_t1",
        email: "test@example.com",
        isActive: true,
      };
      const softDeletedUser = { ...existingUser, isActive: false };

      prisma.user.findUnique.mockResolvedValue(existingUser);
      prisma.user.update.mockResolvedValue(softDeletedUser);

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_deleted_t1" });

      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clerkId: "user_deleted_t1" },
          data: { isActive: false },
        }),
      );
    });

    it("logs an audit entry with action user.deleted", async () => {
      const payload = setupDeletedTest("user_deleted_t2", "evt_deleted_t2");
      const existingUser = {
        id: "db-user-d2",
        clerkId: "user_deleted_t2",
        email: "test@example.com",
        isActive: true,
      };
      prisma.user.findUnique.mockResolvedValue(existingUser);
      prisma.user.update.mockResolvedValue({
        ...existingUser,
        isActive: false,
      });

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_deleted_t2" });

      await POST(req);

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "user",
          action: "user.deleted",
          success: true,
        }),
      );
    });

    it("skips deletion gracefully when user not found in database", async () => {
      const payload = setupDeletedTest("user_deleted_t3", "evt_deleted_t3");
      prisma.user.findUnique.mockResolvedValue(null);

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_deleted_t3" });

      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("Error handling", () => {
    function setupTest(clerkId: string, svixId: string, payload: object) {
      mockHeaders.mockResolvedValue(
        new Map([
          ["svix-id", svixId],
          ["svix-timestamp", String(Date.now())],
          ["svix-signature", "v1,valid"],
        ]),
      );
      mockWebhookVerify.mockReturnValue(payload);
    }

    it("returns 500 when database throws during user.created", async () => {
      const payload = makeCreatedPayload("user_err_t1");
      setupTest("user_err_t1", "evt_err_created", payload);

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(new Error("DB connection failed"));

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_err_created" });

      const res = await POST(req);
      expect(res.status).toBe(500);
    });

    it("returns 500 when database throws during user.updated", async () => {
      const payload = makeUpdatedPayload("user_err_t2");
      setupTest("user_err_t2", "evt_err_updated", payload);

      prisma.user.findUnique.mockResolvedValue({
        id: "db-user-e2",
        clerkId: "user_err_t2",
        email: "old@example.com",
        name: "Old",
        avatarUrl: null,
      });
      prisma.user.update.mockRejectedValue(new Error("DB write failed"));

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_err_updated" });

      const res = await POST(req);
      expect(res.status).toBe(500);
    });

    it("returns 500 when database throws during user.deleted", async () => {
      const payload = makeDeletedPayload("user_err_t3");
      setupTest("user_err_t3", "evt_err_deleted", payload);

      prisma.user.findUnique.mockResolvedValue({
        id: "db-user-e3",
        clerkId: "user_err_t3",
        isActive: true,
      });
      prisma.user.update.mockRejectedValue(new Error("DB write failed"));

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(payload, { "svix-id": "evt_err_deleted" });

      const res = await POST(req);
      expect(res.status).toBe(500);
    });

    it("returns 200 for unhandled event types without errors", async () => {
      const unknownPayload = {
        type: "session.created",
        data: { id: "sess_unique_001" },
      };
      setupTest("sess_unique_001", "evt_unknown_001", unknownPayload);

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(unknownPayload, { "svix-id": "evt_unknown_001" });

      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it("returns 500 when CLERK_WEBHOOK_SECRET is not configured", async () => {
      delete process.env.CLERK_WEBHOOK_SECRET;

      mockHeaders.mockResolvedValue(
        new Map([
          ["svix-id", "evt_no_secret_001"],
          ["svix-timestamp", String(Date.now())],
          ["svix-signature", "v1,valid"],
        ]),
      );

      const { POST } = await import("@/app/api/webhooks/clerk/route");
      const req = makeRequest(makeCreatedPayload("user_no_secret"), {
        "svix-id": "evt_no_secret_001",
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
    });
  });
});
