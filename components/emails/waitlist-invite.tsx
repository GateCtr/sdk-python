import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface WaitlistInviteEmailProps {
  name?: string;
  email: string;
  inviteCode: string;
  expiresAt: Date;
  expiryDays?: number;
}

export default function WaitlistInviteEmail({
  name,
  email,
  inviteCode,
  expiresAt,
  expiryDays: expiryDaysProp,
}: WaitlistInviteEmailProps) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gatectr.com";
  const signupUrl = `${appUrl}/sign-up?invite=${inviteCode}`;
  const expiryDays =
    expiryDaysProp ??
    Math.ceil(
      (expiresAt.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
    );

  return (
    <Html>
      <Head />
      <Preview>{`Your GateCtr spot is open. ${expiryDays}d left.`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>GateCtr</Heading>
          </Section>

          <Section style={content}>
            <Text style={greeting}>{name ? `Hi ${name},` : "Hi,"}</Text>
            <Heading style={h1}>Your spot is open.</Heading>
            <Text style={text}>
              Connect in 5 min. Your API key stays yours. GateCtr routes,
              optimizes, and controls — you just save.
            </Text>

            <Section style={inviteBox}>
              <Text style={inviteLabel}>Invite code</Text>
              <Text style={inviteCode_}>{inviteCode}</Text>
            </Section>

            <Section style={ctaWrap}>
              <Button href={signupUrl} style={button}>
                Create account
              </Button>
            </Section>

            <Text style={linkHint}>
              Or:{" "}
              <Link href={signupUrl} style={inlineLink}>
                {signupUrl}
              </Link>
            </Text>

            <Section style={steps}>
              <Text style={stepsTitle}>5 min setup</Text>
              <Text style={step}>1. Create your account with {email}</Text>
              <Text style={step}>
                2. Add your LLM API keys (OpenAI, Anthropic, Mistral&hellip;)
              </Text>
              <Text style={step}>
                3. Swap your endpoint URL. That&apos;s it.
              </Text>
            </Section>

            <Section style={expiry}>
              <Text style={expiryText}>
                ⏱ Expires in {expiryDays} {expiryDays === 1 ? "day" : "days"}.
              </Text>
            </Section>

            <Text style={hint}>Questions? Reply to this email.</Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>GateCtr — One gateway. Every LLM.</Text>
            <Text style={footerText}>
              <Link href="https://gatectr.com" style={footerLink}>
                gatectr.com
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif',
};
const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  maxWidth: "560px",
  padding: "0 0 48px",
};
const header = { padding: "32px 40px", borderBottom: "1px solid #e6ebf1" };
const logo = {
  color: "#1B4F82",
  fontSize: "28px",
  fontWeight: "700",
  margin: "0",
};
const content = { padding: "40px 40px 0" };
const greeting = { color: "#718096", fontSize: "15px", margin: "0 0 8px" };
const h1 = {
  color: "#1a1a1a",
  fontSize: "24px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 16px",
};
const text = {
  color: "#4a5568",
  fontSize: "15px",
  lineHeight: "1.7",
  margin: "0 0 28px",
};
const inviteBox = {
  background: "linear-gradient(135deg, #00B4C8 0%, #1B4F82 100%)",
  borderRadius: "10px",
  padding: "24px",
  textAlign: "center" as const,
  margin: "0 0 24px",
};
const inviteLabel = {
  color: "rgba(255,255,255,0.8)",
  fontSize: "12px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 8px",
};
const inviteCode_ = {
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: "700",
  letterSpacing: "3px",
  fontFamily: "monospace",
  margin: "0",
};
const ctaWrap = { textAlign: "center" as const, margin: "0 0 16px" };
const button = {
  backgroundColor: "#1B4F82",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600",
  padding: "12px 32px",
  textDecoration: "none",
  display: "inline-block",
};
const linkHint = {
  color: "#a0aec0",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "0 0 32px",
};
const inlineLink = { color: "#00B4C8", textDecoration: "none" };
const steps = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "20px 24px",
  margin: "0 0 20px",
};
const stepsTitle = {
  color: "#718096",
  fontSize: "12px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 12px",
};
const step = {
  color: "#4a5568",
  fontSize: "14px",
  lineHeight: "1.8",
  margin: "0 0 4px",
};
const expiry = {
  backgroundColor: "#fffbeb",
  border: "1px solid #fcd34d",
  borderRadius: "6px",
  padding: "12px 16px",
  margin: "0 0 20px",
  textAlign: "center" as const,
};
const expiryText = {
  color: "#92400e",
  fontSize: "13px",
  fontWeight: "600",
  margin: "0",
};
const hint = { color: "#a0aec0", fontSize: "13px", margin: "0" };
const footer = {
  borderTop: "1px solid #e6ebf1",
  padding: "24px 40px",
  textAlign: "center" as const,
};
const footerText = {
  color: "#a0aec0",
  fontSize: "12px",
  lineHeight: "1.6",
  margin: "0 0 4px",
};
const footerLink = { color: "#a0aec0", textDecoration: "underline" };
