import { headers } from "next/headers";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendUserWelcomeEmail } from "@/lib/resend";

/**
 * Clerk Webhook Handler
 *
 * Handles user lifecycle events from Clerk:
 * - user.created: Create user in database, assign DEVELOPER role, send welcome email
 * - user.updated: Update user information in database
 * - user.deleted: Soft delete user (set isActive to false)
 *
 * All webhooks are verified using Svix signature verification.
 * Implements idempotency using Clerk event IDs.
 */

// Store processed event IDs in memory (in production, use Redis or database)
const processedEvents = new Set<string>();

export async function POST(req: Request) {
  // Extract Svix headers for signature verification
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  // Verify required headers are present
  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error("Missing Svix headers");
    return new Response("Missing Svix headers", { status: 400 });
  }

  // Get webhook secret from environment
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("CLERK_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // Get request body
  const payload = await req.text();
  const body = JSON.parse(payload);

  // Verify webhook signature using Svix
  const wh = new Webhook(webhookSecret);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    // Log signature verification failure to audit log
    await logAudit({
      resource: "webhook",
      action: "webhook.signature_failed",
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      ipAddress:
        req.headers.get("x-forwarded-for") ||
        req.headers.get("x-real-ip") ||
        undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 401 });
  }

  // Check for idempotency - skip if event already processed
  const eventId = body.data?.id || svixId;
  if (processedEvents.has(eventId)) {
    console.log(`Event ${eventId} already processed, skipping`);
    return new Response("Event already processed", { status: 200 });
  }

  // Handle different event types
  const eventType = evt.type;

  try {
    switch (eventType) {
      case "user.created":
        await handleUserCreated(evt, req);
        break;

      case "user.updated":
        await handleUserUpdated(evt);
        break;

      case "user.deleted":
        await handleUserDeleted(evt);
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Mark event as processed
    processedEvents.add(eventId);

    // Clean up old event IDs (keep last 1000)
    if (processedEvents.size > 1000) {
      const entries = Array.from(processedEvents);
      entries
        .slice(0, entries.length - 1000)
        .forEach((id) => processedEvents.delete(id));
    }

    return new Response("Webhook processed successfully", { status: 200 });
  } catch (error) {
    console.error(`Error processing ${eventType}:`, error);

    // Log error to Sentry in production
    if (
      process.env.NODE_ENV === "production" &&
      typeof window === "undefined"
    ) {
      // Sentry will be configured globally
      console.error("Sentry logging:", error);
    }

    // Return 500 to trigger Clerk retry
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * Handle user.created event
 * - Create User record in database
 * - Assign DEVELOPER role
 * - Send welcome email
 * - Log audit entry
 */
async function handleUserCreated(evt: WebhookEvent, req: Request) {
  if (evt.type !== "user.created") return;

  const { id, email_addresses, first_name, last_name, image_url } = evt.data;

  const email = email_addresses[0]?.email_address;
  if (!email) {
    throw new Error("No email address found in user.created event");
  }

  const name = [first_name, last_name].filter(Boolean).join(" ") || null;

  // Check if user already exists (idempotency at database level)
  const existingUser = await prisma.user.findUnique({
    where: { clerkId: id },
  });

  if (existingUser) {
    console.log(`User ${id} already exists, skipping creation`);
    return;
  }

  // Create user in database — no system role assigned, plan is the access control
  const user = await prisma.user.create({
    data: {
      clerkId: id,
      email,
      name,
      avatarUrl: image_url || null,
      plan: "FREE",
      isActive: true,
    },
  });

  // Log audit entry for user creation
  await logAudit({
    userId: user.id,
    resource: "user",
    action: "user.created",
    resourceId: user.id,
    newValue: { clerkId: id, email, name },
    success: true,
    ipAddress:
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      undefined,
    userAgent: req.headers.get("user-agent") || undefined,
  });

  // Send welcome email asynchronously (don't block webhook response)
  // Detect locale from browser if available, default to English
  const acceptLanguage = req.headers.get("accept-language");
  const locale = acceptLanguage?.toLowerCase().includes("fr") ? "fr" : "en";

  // Send email without awaiting (fire and forget)
  sendUserWelcomeEmail(email, name, locale)
    .then(async (result) => {
      // Log email attempt to EmailLog table
      await prisma.emailLog.create({
        data: {
          userId: user.id,
          resendId: result.resendId || null,
          to: email,
          subject:
            locale === "fr" ? "Bienvenue sur GateCtr" : "Welcome to GateCtr",
          template: "user-welcome",
          status: result.success ? "SENT" : "FAILED",
          error: result.success ? null : String(result.error),
        },
      });

      if (!result.success) {
        console.error("Failed to send welcome email:", result.error);
        // Log to Sentry but don't throw - email failure shouldn't break user creation
        if (process.env.NODE_ENV === "production") {
          console.error("Sentry logging: Welcome email failed", result.error);
        }
      }
    })
    .catch((error) => {
      console.error("Error logging email attempt:", error);
    });

  console.log(`User created: ${email} (${user.id})`);
}

/**
 * Handle user.updated event
 * - Update User record in database
 * - Log audit entry
 */
async function handleUserUpdated(evt: WebhookEvent) {
  if (evt.type !== "user.updated") return;

  const { id, email_addresses, first_name, last_name, image_url } = evt.data;

  const email = email_addresses[0]?.email_address;
  if (!email) {
    throw new Error("No email address found in user.updated event");
  }

  const name = [first_name, last_name].filter(Boolean).join(" ") || null;

  // Find user by clerkId
  const existingUser = await prisma.user.findUnique({
    where: { clerkId: id },
  });

  if (!existingUser) {
    console.warn(`User ${id} not found for update, skipping`);
    return;
  }

  // Update user in database
  const updatedUser = await prisma.user.update({
    where: { clerkId: id },
    data: {
      email,
      name,
      avatarUrl: image_url || null,
    },
  });

  // Log audit entry for user update
  await logAudit({
    userId: updatedUser.id,
    resource: "user",
    action: "user.updated",
    resourceId: updatedUser.id,
    oldValue: {
      email: existingUser.email,
      name: existingUser.name,
      avatarUrl: existingUser.avatarUrl,
    },
    newValue: {
      email: updatedUser.email,
      name: updatedUser.name,
      avatarUrl: updatedUser.avatarUrl,
    },
    success: true,
  });

  console.log(`User updated: ${email} (${updatedUser.id})`);
}

/**
 * Handle user.deleted event
 * - Soft delete user (set isActive to false)
 * - Log audit entry
 */
async function handleUserDeleted(evt: WebhookEvent) {
  if (evt.type !== "user.deleted") return;

  const { id } = evt.data;

  // Find user by clerkId
  const existingUser = await prisma.user.findUnique({
    where: { clerkId: id },
  });

  if (!existingUser) {
    console.warn(`User ${id} not found for deletion, skipping`);
    return;
  }

  // Soft delete user (set isActive to false)
  const deletedUser = await prisma.user.update({
    where: { clerkId: id },
    data: {
      isActive: false,
    },
  });

  // Log audit entry for user deletion
  await logAudit({
    userId: deletedUser.id,
    resource: "user",
    action: "user.deleted",
    resourceId: deletedUser.id,
    oldValue: { isActive: true },
    newValue: { isActive: false },
    success: true,
  });

  console.log(`User soft deleted: ${deletedUser.email} (${deletedUser.id})`);
}
