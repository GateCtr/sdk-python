/**
 * Test script for billing emails
 * Usage: pnpm tsx scripts/test-billing-emails.ts [email] [locale]
 *
 * Examples:
 *   pnpm tsx scripts/test-billing-emails.ts test@example.com en
 *   pnpm tsx scripts/test-billing-emails.ts test@example.com fr
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import {
  sendBillingUpgradeEmail,
  sendBillingReceiptEmail,
  sendBillingPaymentFailedEmail,
  sendBillingDowngradeEmail,
  sendBillingCancellationEmail,
  sendBillingRenewalReminderEmail,
} from "../lib/resend";

const email = process.argv[2] || "test@example.com";
const locale = (process.argv[3] === "fr" ? "fr" : "en") as "en" | "fr";

const now = new Date();
const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
const inThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

const tests: Array<{
  name: string;
  fn: () => Promise<{ success: boolean; error?: unknown }>;
}> = [
  {
    name: "upgrade (Pro)",
    fn: () => sendBillingUpgradeEmail(email, "Pro", locale),
  },
  {
    name: "receipt ($29.00)",
    fn: () => sendBillingReceiptEmail(email, 2900, null, locale),
  },
  {
    name: "payment failed",
    fn: () =>
      sendBillingPaymentFailedEmail(
        email,
        "http://localhost:3000/billing",
        locale,
      ),
  },
  {
    name: "cancellation scheduled",
    fn: () => sendBillingCancellationEmail(email, "Pro", inThirtyDays, locale),
  },
  {
    name: "renewal reminder",
    fn: () => sendBillingRenewalReminderEmail(email, inSevenDays, 2900, locale),
  },
  {
    name: "downgrade (to Free)",
    fn: () =>
      sendBillingDowngradeEmail(
        email,
        ["Context Optimizer", "Model Router", "Unlimited webhooks"],
        locale,
      ),
  },
];

async function run() {
  console.log(`\nSending billing emails to: ${email} (locale: ${locale})\n`);

  for (const test of tests) {
    process.stdout.write(`  [${test.name}] ... `);
    try {
      const result = await test.fn();
      if (result.success) {
        console.log("OK");
      } else {
        console.log("FAILED", result.error);
      }
    } catch (err) {
      console.log("ERROR", err);
    }
  }

  console.log("\nDone.\n");
}

run();
