import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface WaitlistWelcomeEmailProps {
  name?: string;
  position: number;
  email: string;
}

export default function WaitlistWelcomeEmail({
  name,
  position,
  email,
}: WaitlistWelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Position #${position}. We'll email you when your spot opens.`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>GateCtr</Heading>
          </Section>

          <Section style={content}>
            <Text style={greeting}>{name ? `Hi ${name},` : "Hi,"}</Text>
            <Heading style={h1}>You&apos;re in. Position #{position}.</Heading>
            <Text style={text}>
              We&apos;ll email <strong>{email}</strong> when your spot opens. No
              spam. One email.
            </Text>

            <Section style={positionBox}>
              <Text style={positionLabel}>Your position</Text>
              <Text style={positionNumber}>#{position}</Text>
            </Section>

            <Section style={features}>
              <Text style={featuresTitle}>What&apos;s waiting for you</Text>
              <Text style={featureItem}>
                <strong>💰 Budget Firewall</strong>
                <br />
                Hard caps. Soft alerts. No surprise invoices.
              </Text>
              <Text style={featureItem}>
                <strong>⚡ Context Optimizer</strong>
                <br />
                -40% tokens. Same output quality.
              </Text>
              <Text style={featureItem}>
                <strong>🎯 Model Router</strong>
                <br />
                GateCtr picks the right LLM. You pay less.
              </Text>
            </Section>
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
  margin: "0 0 24px",
};
const positionBox = {
  background: "linear-gradient(135deg, #00B4C8 0%, #1B4F82 100%)",
  borderRadius: "10px",
  padding: "28px",
  textAlign: "center" as const,
  margin: "0 0 28px",
};
const positionLabel = {
  color: "rgba(255,255,255,0.8)",
  fontSize: "13px",
  fontWeight: "500",
  margin: "0 0 6px",
};
const positionNumber = {
  color: "#ffffff",
  fontSize: "52px",
  fontWeight: "700",
  margin: "0",
  lineHeight: "1",
};
const features = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "24px",
  margin: "0 0 24px",
};
const featuresTitle = {
  color: "#718096",
  fontSize: "12px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 16px",
};
const featureItem = {
  color: "#4a5568",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 14px",
};
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
