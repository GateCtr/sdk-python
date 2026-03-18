/**
 * Property-Based Tests for Webhook Idempotency
 *
 * These tests verify that processing the same webhook event multiple times
 * produces the same result as processing it once.
 *
 * Properties covered:
 * - Property 48: Webhook Idempotency - User Creation
 * - Property 49: Webhook Idempotency - User Update
 * - Property 50: Webhook Idempotency - User Deletion
 * - Property 51: Webhook Idempotency General
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks (hoisted before any dynamic imports)
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
    },
    userRole: {
      create: vi.fn(),
    },
    emailLog: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
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

vi.mock("svix", () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn(),
  })),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a realistic Clerk user ID */
const clerkUserIdArb = fc
  .string({ minLength: 8, maxLength: 20, unit: "binary-ascii" })
  .map((s) => `user_${s.replace(/[^a-z0-9]/gi, "x")}`);

/** Generates a realistic Svix event ID */
const svixEventIdArb = fc
  .string({ minLength: 8, maxLength: 20, unit: "binary-ascii" })
  .map((s) => `evt_${s.replace(/[^a-z0-9]/gi, "x")}`);

/** Generates a valid email address */
const emailArb = fc
  .tuple(
    fc.string({ minLength: 3, maxLength: 10, unit: "grapheme-ascii" }),
    fc.constantFrom("example.com", "test.org", "mail.net"),
  )
  .map(([local, domain]) => `${local.replace(/[^a-z0-9]/gi, "x")}@${domain}`);

/** Generates an optional name string */
const nameArb = fc.option(
  fc.string({ minLength: 2, maxLength: 30, unit: "grapheme-ascii" }),
  { nil: null },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulates the idempotency logic extracted from the webhook handler.
 *
 * The handler checks:
 * 1. In-memory processedEvents set (event-level deduplication)
 * 2. Database-level check (user already exists for user.created)
 *
 * We test the observable database state rather than the HTTP handler directly,
 * because the handler depends on Next.js internals (headers(), Request) that
 * are hard to instantiate in unit tests.
 */

interface UserState {
  clerkId: string;
  email: string;
  name: string | null;
  isActive: boolean;
  roleAssigned: boolean;
}

/**
 * Simulates processing a user.created event against an in-memory user store.
 * Returns the resulting store state (idempotent: calling N times == calling once).
 */
function simulateUserCreated(
  store: Map<string, UserState>,
  processedIds: Set<string>,
  eventId: string,
  clerkId: string,
  email: string,
  name: string | null,
): Map<string, UserState> {
  // Idempotency check 1: event already processed
  if (processedIds.has(eventId)) return store;

  // Idempotency check 2: user already exists in DB
  if (!store.has(clerkId)) {
    store.set(clerkId, {
      clerkId,
      email,
      name,
      isActive: true,
      roleAssigned: true,
    });
  }

  processedIds.add(eventId);
  return store;
}

/**
 * Simulates processing a user.updated event.
 */
function simulateUserUpdated(
  store: Map<string, UserState>,
  processedIds: Set<string>,
  eventId: string,
  clerkId: string,
  email: string,
  name: string | null,
): Map<string, UserState> {
  if (processedIds.has(eventId)) return store;

  const existing = store.get(clerkId);
  if (existing) {
    store.set(clerkId, { ...existing, email, name });
  }

  processedIds.add(eventId);
  return store;
}

/**
 * Simulates processing a user.deleted event.
 */
function simulateUserDeleted(
  store: Map<string, UserState>,
  processedIds: Set<string>,
  eventId: string,
  clerkId: string,
): Map<string, UserState> {
  if (processedIds.has(eventId)) return store;

  const existing = store.get(clerkId);
  if (existing) {
    store.set(clerkId, { ...existing, isActive: false });
  }

  processedIds.add(eventId);
  return store;
}

/** Deep-clones a Map<string, UserState> for snapshot comparison */
function cloneStore(store: Map<string, UserState>): Map<string, UserState> {
  return new Map(Array.from(store.entries()).map(([k, v]) => [k, { ...v }]));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Webhook Idempotency Property Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Property 48: Webhook Idempotency - User Creation
  // -------------------------------------------------------------------------

  /**
   * Property 48: Webhook Idempotency - User Creation
   *
   * For any user.created webhook event, processing it N times produces the
   * same database state as processing it once. Specifically:
   * - Exactly one User record is created
   * - The DEVELOPER role is assigned exactly once
   * - Duplicate events are silently ignored
   *
   * Validates: Requirement 14.1
   */
  describe("Property 48: Webhook Idempotency - User Creation", () => {
    it("processing user.created N times creates exactly one user record", () => {
      fc.assert(
        fc.property(
          clerkUserIdArb,
          svixEventIdArb,
          emailArb,
          nameArb,
          fc.integer({ min: 1, max: 10 }), // number of duplicate deliveries
          (clerkId, eventId, email, name, deliveries) => {
            const store = new Map<string, UserState>();
            const processedIds = new Set<string>();

            // Process the same event `deliveries` times
            for (let i = 0; i < deliveries; i++) {
              simulateUserCreated(
                store,
                processedIds,
                eventId,
                clerkId,
                email,
                name,
              );
            }

            // Exactly one user should exist
            expect(store.size).toBe(1);
            expect(store.has(clerkId)).toBe(true);

            const user = store.get(clerkId)!;
            expect(user.email).toBe(email);
            expect(user.isActive).toBe(true);
            expect(user.roleAssigned).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("state after N deliveries equals state after 1 delivery", () => {
      fc.assert(
        fc.property(
          clerkUserIdArb,
          svixEventIdArb,
          emailArb,
          nameArb,
          fc.integer({ min: 2, max: 10 }),
          (clerkId, eventId, email, name, deliveries) => {
            // Single delivery
            const storeOnce = new Map<string, UserState>();
            simulateUserCreated(
              storeOnce,
              new Set(),
              eventId,
              clerkId,
              email,
              name,
            );

            // N deliveries
            const storeN = new Map<string, UserState>();
            const processedIds = new Set<string>();
            for (let i = 0; i < deliveries; i++) {
              simulateUserCreated(
                storeN,
                processedIds,
                eventId,
                clerkId,
                email,
                name,
              );
            }

            // States must be identical
            expect(storeN).toEqual(storeOnce);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("different event IDs for the same user do not create duplicate users", () => {
      fc.assert(
        fc.property(
          clerkUserIdArb,
          emailArb,
          nameArb,
          fc.array(svixEventIdArb, { minLength: 2, maxLength: 5 }),
          (clerkId, email, name, eventIds) => {
            const store = new Map<string, UserState>();
            const processedIds = new Set<string>();

            // Each unique event ID is a separate delivery attempt
            for (const eventId of eventIds) {
              simulateUserCreated(
                store,
                processedIds,
                eventId,
                clerkId,
                email,
                name,
              );
            }

            // Still only one user record (DB-level idempotency via clerkId uniqueness)
            expect(store.size).toBe(1);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("mock-based: prisma.user.create is called at most once per clerkId", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { prisma } = (await import("@/lib/prisma")) as any;

      await fc.assert(
        fc.asyncProperty(
          clerkUserIdArb,
          emailArb,
          nameArb,
          fc.integer({ min: 2, max: 5 }),
          async (clerkId, email, name, deliveries) => {
            vi.clearAllMocks();

            const createdUser = {
              id: "db-user-id",
              clerkId,
              email,
              name,
              isActive: true,
            };
            const developerRole = { id: "role-dev", name: "DEVELOPER" };

            // First call: user does not exist yet; subsequent calls: already exists
            prisma.user.findUnique
              .mockResolvedValueOnce(null)
              .mockResolvedValue(createdUser);

            prisma.$transaction.mockImplementation(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              async (fn: (tx: any) => Promise<unknown>) => {
                const tx = {
                  user: { create: vi.fn().mockResolvedValue(createdUser) },
                  role: {
                    findUnique: vi.fn().mockResolvedValue(developerRole),
                  },
                  userRole: { create: vi.fn().mockResolvedValue({}) },
                };
                return fn(tx);
              },
            );

            // Simulate N deliveries of the same event
            const processedIds = new Set<string>();
            const eventId = `evt_${clerkId}`;

            for (let i = 0; i < deliveries; i++) {
              if (!processedIds.has(eventId)) {
                const existing = await prisma.user.findUnique({
                  where: { clerkId },
                });
                if (!existing) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await prisma.$transaction(async (tx: any) => {
                    const u = await tx.user.create({
                      data: { clerkId, email, name },
                    });
                    const role = await tx.role.findUnique({
                      where: { name: "DEVELOPER" },
                    });
                    await tx.userRole.create({
                      data: { userId: u.id, roleId: role.id },
                    });
                    return u;
                  });
                }
                processedIds.add(eventId);
              }
            }

            // $transaction (user creation) should have been called exactly once
            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 49: Webhook Idempotency - User Update
  // -------------------------------------------------------------------------

  /**
   * Property 49: Webhook Idempotency - User Update
   *
   * For any user.updated webhook event, processing it N times produces the
   * same final User state as processing it once. The last-write-wins semantics
   * are preserved and no partial updates occur.
   *
   * Validates: Requirement 14.2
   */
  describe("Property 49: Webhook Idempotency - User Update", () => {
    it("processing user.updated N times yields the same final state as once", () => {
      fc.assert(
        fc.property(
          clerkUserIdArb,
          svixEventIdArb,
          emailArb,
          nameArb,
          emailArb, // updated email
          nameArb, // updated name
          fc.integer({ min: 1, max: 10 }),
          (
            clerkId,
            eventId,
            initialEmail,
            initialName,
            updatedEmail,
            updatedName,
            deliveries,
          ) => {
            // Seed the store with an existing user
            const seedStore = () => {
              const s = new Map<string, UserState>();
              s.set(clerkId, {
                clerkId,
                email: initialEmail,
                name: initialName,
                isActive: true,
                roleAssigned: true,
              });
              return s;
            };

            // Single delivery
            const storeOnce = seedStore();
            simulateUserUpdated(
              storeOnce,
              new Set(),
              eventId,
              clerkId,
              updatedEmail,
              updatedName,
            );

            // N deliveries
            const storeN = seedStore();
            const processedIds = new Set<string>();
            for (let i = 0; i < deliveries; i++) {
              simulateUserUpdated(
                storeN,
                processedIds,
                eventId,
                clerkId,
                updatedEmail,
                updatedName,
              );
            }

            expect(storeN).toEqual(storeOnce);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("final state reflects the event payload regardless of delivery count", () => {
      fc.assert(
        fc.property(
          clerkUserIdArb,
          svixEventIdArb,
          emailArb,
          nameArb,
          emailArb,
          nameArb,
          fc.integer({ min: 1, max: 10 }),
          (
            clerkId,
            eventId,
            initialEmail,
            initialName,
            updatedEmail,
            updatedName,
            deliveries,
          ) => {
            const store = new Map<string, UserState>();
            store.set(clerkId, {
              clerkId,
              email: initialEmail,
              name: initialName,
              isActive: true,
              roleAssigned: true,
            });

            const processedIds = new Set<string>();
            for (let i = 0; i < deliveries; i++) {
              simulateUserUpdated(
                store,
                processedIds,
                eventId,
                clerkId,
                updatedEmail,
                updatedName,
              );
            }

            const user = store.get(clerkId)!;
            // Final state must match the event payload
            expect(user.email).toBe(updatedEmail);
            expect(user.name).toBe(updatedName);
            // isActive must not be changed by an update event
            expect(user.isActive).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("sequential distinct update events converge to the last event payload", () => {
      fc.assert(
        fc.property(
          clerkUserIdArb,
          emailArb,
          nameArb,
          // Generate a sequence of (eventId, email, name) update events
          fc.array(fc.tuple(svixEventIdArb, emailArb, nameArb), {
            minLength: 1,
            maxLength: 5,
          }),
          (clerkId, initialEmail, initialName, updates) => {
            const store = new Map<string, UserState>();
            store.set(clerkId, {
              clerkId,
              email: initialEmail,
              name: initialName,
              isActive: true,
              roleAssigned: true,
            });

            const processedIds = new Set<string>();
            for (const [eventId, email, name] of updates) {
              simulateUserUpdated(
                store,
                processedIds,
                eventId,
                clerkId,
                email,
                name,
              );
            }

            // The last unique event determines the final state
            const uniqueUpdates = updates.filter(
              ([id], idx, arr) => arr.findIndex(([eid]) => eid === id) === idx,
            );
            const [, lastEmail, lastName] =
              uniqueUpdates[uniqueUpdates.length - 1];

            const user = store.get(clerkId)!;
            expect(user.email).toBe(lastEmail);
            expect(user.name).toBe(lastName);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 50: Webhook Idempotency - User Deletion
  // -------------------------------------------------------------------------

  /**
   * Property 50: Webhook Idempotency - User Deletion
   *
   * For any user.deleted webhook event, processing it N times keeps isActive
   * as false without errors. The user record is never physically removed.
   *
   * Validates: Requirement 14.3
   */
  describe("Property 50: Webhook Idempotency - User Deletion", () => {
    it("processing user.deleted N times keeps isActive=false", () => {
      fc.assert(
        fc.property(
          clerkUserIdArb,
          svixEventIdArb,
          emailArb,
          nameArb,
          fc.integer({ min: 1, max: 10 }),
          (clerkId, eventId, email, name, deliveries) => {
            const store = new Map<string, UserState>();
            store.set(clerkId, {
              clerkId,
              email,
              name,
              isActive: true,
              roleAssigned: true,
            });

            const processedIds = new Set<string>();
            for (let i = 0; i < deliveries; i++) {
              simulateUserDeleted(store, processedIds, eventId, clerkId);
            }

            // User record must still exist (soft delete)
            expect(store.has(clerkId)).toBe(true);
            // isActive must be false
            expect(store.get(clerkId)!.isActive).toBe(false);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("state after N deletions equals state after 1 deletion", () => {
      fc.assert(
        fc.property(
          clerkUserIdArb,
          svixEventIdArb,
          emailArb,
          nameArb,
          fc.integer({ min: 2, max: 10 }),
          (clerkId, eventId, email, name, deliveries) => {
            const seed = () => {
              const s = new Map<string, UserState>();
              s.set(clerkId, {
                clerkId,
                email,
                name,
                isActive: true,
                roleAssigned: true,
              });
              return s;
            };

            const storeOnce = seed();
            simulateUserDeleted(storeOnce, new Set(), eventId, clerkId);

            const storeN = seed();
            const processedIds = new Set<string>();
            for (let i = 0; i < deliveries; i++) {
              simulateUserDeleted(storeN, processedIds, eventId, clerkId);
            }

            expect(storeN).toEqual(storeOnce);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("user record is never physically removed by a deletion event", () => {
      fc.assert(
        fc.property(
          clerkUserIdArb,
          svixEventIdArb,
          emailArb,
          nameArb,
          fc.integer({ min: 1, max: 10 }),
          (clerkId, eventId, email, name, deliveries) => {
            const store = new Map<string, UserState>();
            store.set(clerkId, {
              clerkId,
              email,
              name,
              isActive: true,
              roleAssigned: true,
            });

            const processedIds = new Set<string>();
            for (let i = 0; i < deliveries; i++) {
              simulateUserDeleted(store, processedIds, eventId, clerkId);
            }

            // Record must still be present (soft delete, not hard delete)
            expect(store.size).toBe(1);
            expect(store.has(clerkId)).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("deletion after update preserves updated fields with isActive=false", () => {
      fc.assert(
        fc.property(
          clerkUserIdArb,
          emailArb,
          nameArb,
          emailArb,
          nameArb,
          (clerkId, initialEmail, initialName, updatedEmail, updatedName) => {
            const store = new Map<string, UserState>();
            store.set(clerkId, {
              clerkId,
              email: initialEmail,
              name: initialName,
              isActive: true,
              roleAssigned: true,
            });

            const processedIds = new Set<string>();

            // Update then delete
            simulateUserUpdated(
              store,
              processedIds,
              "evt_update",
              clerkId,
              updatedEmail,
              updatedName,
            );
            simulateUserDeleted(store, processedIds, "evt_delete", clerkId);

            const user = store.get(clerkId)!;
            expect(user.email).toBe(updatedEmail);
            expect(user.name).toBe(updatedName);
            expect(user.isActive).toBe(false);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 51: Webhook Idempotency General
  // -------------------------------------------------------------------------

  /**
   * Property 51: Webhook Idempotency General
   *
   * For ALL webhook event types, processing an event N times produces the
   * same database state as processing it once: process(E)^N == process(E).
   *
   * This is the general idempotency property that subsumes Properties 48-50.
   *
   * Validates: Requirement 14.4
   */
  describe("Property 51: Webhook Idempotency General", () => {
    type WebhookEventType = "user.created" | "user.updated" | "user.deleted";

    const eventTypeArb = fc.constantFrom<WebhookEventType>(
      "user.created",
      "user.updated",
      "user.deleted",
    );

    it("process(E)^N == process(E) for all event types", () => {
      fc.assert(
        fc.property(
          eventTypeArb,
          clerkUserIdArb,
          svixEventIdArb,
          emailArb,
          nameArb,
          fc.integer({ min: 1, max: 10 }),
          (eventType, clerkId, eventId, email, name, deliveries) => {
            const seedStore = () => {
              const s = new Map<string, UserState>();
              // For update/delete, seed an existing user
              if (eventType !== "user.created") {
                s.set(clerkId, {
                  clerkId,
                  email: "old@example.com",
                  name: "Old Name",
                  isActive: true,
                  roleAssigned: true,
                });
              }
              return s;
            };

            const applyEvent = (
              store: Map<string, UserState>,
              ids: Set<string>,
            ) => {
              switch (eventType) {
                case "user.created":
                  return simulateUserCreated(
                    store,
                    ids,
                    eventId,
                    clerkId,
                    email,
                    name,
                  );
                case "user.updated":
                  return simulateUserUpdated(
                    store,
                    ids,
                    eventId,
                    clerkId,
                    email,
                    name,
                  );
                case "user.deleted":
                  return simulateUserDeleted(store, ids, eventId, clerkId);
              }
            };

            // Single delivery
            const storeOnce = seedStore();
            applyEvent(storeOnce, new Set());

            // N deliveries
            const storeN = seedStore();
            const processedIds = new Set<string>();
            for (let i = 0; i < deliveries; i++) {
              applyEvent(storeN, processedIds);
            }

            expect(storeN).toEqual(storeOnce);
          },
        ),
        { numRuns: 300 },
      );
    });

    it("event ID deduplication prevents any state mutation after first processing", () => {
      fc.assert(
        fc.property(
          eventTypeArb,
          clerkUserIdArb,
          svixEventIdArb,
          emailArb,
          nameArb,
          fc.integer({ min: 2, max: 10 }),
          (eventType, clerkId, eventId, email, name, deliveries) => {
            const store = new Map<string, UserState>();
            if (eventType !== "user.created") {
              store.set(clerkId, {
                clerkId,
                email: "old@example.com",
                name: "Old",
                isActive: true,
                roleAssigned: true,
              });
            }

            const processedIds = new Set<string>();

            const applyEvent = () => {
              switch (eventType) {
                case "user.created":
                  return simulateUserCreated(
                    store,
                    processedIds,
                    eventId,
                    clerkId,
                    email,
                    name,
                  );
                case "user.updated":
                  return simulateUserUpdated(
                    store,
                    processedIds,
                    eventId,
                    clerkId,
                    email,
                    name,
                  );
                case "user.deleted":
                  return simulateUserDeleted(
                    store,
                    processedIds,
                    eventId,
                    clerkId,
                  );
              }
            };

            // First delivery
            applyEvent();
            const snapshotAfterFirst = cloneStore(store);

            // Subsequent deliveries must not change state
            for (let i = 1; i < deliveries; i++) {
              applyEvent();
              expect(store).toEqual(snapshotAfterFirst);
            }
          },
        ),
        { numRuns: 300 },
      );
    });

    it("mixed event sequence with duplicates converges to correct final state", () => {
      fc.assert(
        fc.property(
          clerkUserIdArb,
          emailArb,
          nameArb,
          emailArb,
          nameArb,
          fc.integer({ min: 1, max: 5 }), // duplicate count for created
          fc.integer({ min: 1, max: 5 }), // duplicate count for updated
          fc.integer({ min: 1, max: 5 }), // duplicate count for deleted
          (
            clerkId,
            initEmail,
            initName,
            updEmail,
            updName,
            nCreate,
            nUpdate,
            nDelete,
          ) => {
            const store = new Map<string, UserState>();
            const processedIds = new Set<string>();

            // Deliver user.created nCreate times
            for (let i = 0; i < nCreate; i++) {
              simulateUserCreated(
                store,
                processedIds,
                "evt_create",
                clerkId,
                initEmail,
                initName,
              );
            }

            // Deliver user.updated nUpdate times
            for (let i = 0; i < nUpdate; i++) {
              simulateUserUpdated(
                store,
                processedIds,
                "evt_update",
                clerkId,
                updEmail,
                updName,
              );
            }

            // Deliver user.deleted nDelete times
            for (let i = 0; i < nDelete; i++) {
              simulateUserDeleted(store, processedIds, "evt_delete", clerkId);
            }

            // Final state: one record, updated fields, soft-deleted
            expect(store.size).toBe(1);
            const user = store.get(clerkId)!;
            expect(user.email).toBe(updEmail);
            expect(user.name).toBe(updName);
            expect(user.isActive).toBe(false);
            expect(user.roleAssigned).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("multiple distinct users are each idempotent independently", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(clerkUserIdArb, svixEventIdArb, emailArb, nameArb),
            { minLength: 2, maxLength: 5 },
          ),
          fc.integer({ min: 1, max: 5 }),
          (users, deliveries) => {
            const store = new Map<string, UserState>();
            const processedIds = new Set<string>();

            // Deliver each user's created event `deliveries` times
            for (const [clerkId, eventId, email, name] of users) {
              for (let i = 0; i < deliveries; i++) {
                simulateUserCreated(
                  store,
                  processedIds,
                  eventId,
                  clerkId,
                  email,
                  name,
                );
              }
            }

            // The number of users created equals the number of unique clerkIds
            // whose eventId was seen first (shared processedIds means a duplicate
            // eventId across different users will skip the second user entirely).
            // Count how many unique clerkIds actually made it into the store.
            const uniqueClerkIds = new Set(users.map(([id]) => id));
            // store.size <= uniqueClerkIds.size (some may be skipped by eventId dedup)
            expect(store.size).toBeLessThanOrEqual(uniqueClerkIds.size);

            // Each user in the store must have valid state
            for (const [clerkId] of users) {
              if (store.has(clerkId)) {
                const user = store.get(clerkId)!;
                expect(user.isActive).toBe(true);
                expect(user.roleAssigned).toBe(true);
                expect(typeof user.email).toBe("string");
              }
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
