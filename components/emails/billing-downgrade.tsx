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

interface BillingDowngradeEmailProps {
  email: string;
  lostFeatures: string[];
  locale?: "en" | "fr";
}

export default function BillingDowngradeEmail({
  email,
  lostFeatures,
  locale = "en",
}: BillingDowngradeEmailProps) {
  const c = locale === "fr" ? contentFr : contentEn;
  const billingUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://gatectr.com"}${locale === "fr" ? "/fr" : ""}/billing`;

  return (
    <Html>
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>GateCtr</Heading>
          </Section>
          <Section style={content}>
            <Heading style={h1}>{c.headline}</Heading>
            <Text style={text}>{c.body}</Text>
            {lostFeatures.length > 0 && (
              <Section style={featureBox}>
                <Text style={featureTitle}>{c.lostLabel}</Text>
                {lostFeatures.map((f) => (
                  <Text key={f} style={featureItem}>
                    — {f}
                  </Text>
                ))}
              </Section>
            )}
            <Section style={ctaWrap}>
              <Button href={billingUrl} style={button}>
                {c.cta}
              </Button>
            </Section>
            <Text style={hint}>{c.hint}</Text>
          </Section>
          <Section style={footer}>
            <Text style={footerText}>GateCtr — {c.tagline}</Text>
            <Text style={footerText}>
              <Link
                href={`${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?email=${email}`}
                style={footerLink}
              >
                {c.unsub}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const contentEn = {
  preview: "Your plan has been downgraded to Free.",
  headline: "You're on the Free plan.",
  body: "Your subscription has ended and your account has been moved to the Free plan. Your data is safe — you just have fewer limits now.",
  lostLabel: "Features no longer available:",
  cta: "Reactivate plan",
  hint: "Changed your mind? Reactivate anytime — no setup required.",
  tagline: "One gateway. Every LLM.",
  unsub: "Unsubscribe",
};

const contentFr = {
  preview: "Votre plan a été rétrogradé vers Free.",
  headline: "Vous êtes sur le plan Free.",
  body: "Votre abonnement a pris fin et votre compte a été déplacé vers le plan Free. Vos données sont en sécurité.",
  lostLabel: "Fonctionnalités non disponibles :",
  cta: "Réactiver le plan",
  hint: "Vous avez changé d'avis ? Réactivez à tout moment — aucune configuration requise.",
  tagline: "Une passerelle. Tous les LLMs.",
  unsub: "Se désabonner",
};

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
const h1 = {
  color: "#1a1a1a",
  fontSize: "24px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 20px",
};
const text = {
  color: "#4a5568",
  fontSize: "15px",
  lineHeight: "1.7",
  margin: "0 0 24px",
};
const featureBox = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "20px 24px",
  margin: "0 0 24px",
};
const featureTitle = {
  color: "#718096",
  fontSize: "13px",
  fontWeight: "600" as const,
  margin: "0 0 12px",
};
const featureItem = { color: "#4a5568", fontSize: "14px", margin: "0 0 6px" };
const ctaWrap = { margin: "0 0 32px" };
const button = {
  backgroundColor: "#1B4F82",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600",
  padding: "12px 28px",
  textDecoration: "none",
  display: "inline-block",
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
