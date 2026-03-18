import { Resend } from "resend";
import { render } from "@react-email/render";
import WaitlistWelcomeEmail from "@/components/emails/waitlist-welcome";
import WaitlistInviteEmail from "@/components/emails/waitlist-invite";
import UserWelcomeEmail from "@/components/emails/user-welcome";

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not defined");
  }
  return new Resend(process.env.RESEND_API_KEY);
}

export const resend = new Proxy({} as Resend, {
  get(_target, prop) {
    return getResend()[prop as keyof Resend];
  },
});

export async function sendWelcomeWaitlistEmail(
  email: string,
  name: string | null,
  position: number,
) {
  try {
    const emailHtml = await render(
      WaitlistWelcomeEmail({ email, name: name || undefined, position }),
    );

    await resend.emails.send({
      from: process.env.EMAIL_FROM || "GateCtr <noreply@gatectr.io>",
      to: email,
      subject: `You're #${position} on the GateCtr waitlist!`,
      html: emailHtml,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to send waitlist email:", error);
    return { success: false, error };
  }
}

export async function sendInviteEmail(
  email: string,
  name: string | null,
  inviteCode: string,
  expiresAt: Date,
) {
  try {
    const emailHtml = await render(
      WaitlistInviteEmail({
        email,
        name: name || undefined,
        inviteCode,
        expiresAt,
      }),
    );

    await resend.emails.send({
      from: process.env.EMAIL_FROM || "GateCtr <noreply@gatectr.io>",
      to: email,
      subject: "Your GateCtr invite is ready!",
      html: emailHtml,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to send invite email:", error);
    return { success: false, error };
  }
}

/**
 * Send welcome email to newly registered user
 * @param email - User's email address
 * @param name - User's name (optional)
 * @param locale - User's preferred locale (en or fr)
 * @returns Promise with success status
 */
export async function sendUserWelcomeEmail(
  email: string,
  name: string | null,
  locale: "en" | "fr" = "en",
) {
  try {
    const emailHtml = await render(
      UserWelcomeEmail({
        email,
        name: name || undefined,
        locale,
      }),
    );

    const subject =
      locale === "fr" ? "Bienvenue sur GateCtr" : "Welcome to GateCtr";

    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || "GateCtr <noreply@gatectr.io>",
      to: email,
      subject,
      html: emailHtml,
    });

    return { success: true, resendId: result.data?.id };
  } catch (error) {
    console.error("Failed to send user welcome email:", error);
    return { success: false, error };
  }
}
