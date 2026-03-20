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

interface BillingPaymentFailedEmailProps {
  email: string;
  portalUrl: string;
  locale?: "en" | "fr";
}

export default function BillingPaymentFailedEmail({
  email,
  portalUrl,
  locale = "en",
}: BillingPaymentFailedEmailProps) {
  const c = locale === "fr" ? contentFr : contentEn;

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
            <Section style={alertBanner}>
              <Text style={alertText}>{c.alert}</Text>
            </Section>
            <Heading style={h1}>{c.headline}</Heading>
            <Text style={text}>{c.body}</Text>
            <Section style={ctaWrap}>
              <Button href={portalUrl} style={button}>
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
  preview: "Payment failed. Update your payment method to keep access.",
  alert: "⚠️ Action required",
  headline: "Payment failed.",
  body: "We couldn't process your payment. Update your payment method to keep your plan active. Access continues for now — act before your next retry.",
  cta: "Update payment method",
  hint: "Need help? Reply to this email.",
  tagline: "One gateway. Every LLM.",
  unsub: "Unsubscribe",
};

const contentFr = {
  preview: "Paiement échoué. Mettez à jour votre moyen de paiement.",
  alert: "⚠️ Action requise",
  headline: "Paiement échoué.",
  body: "Nous n'avons pas pu traiter votre paiement. Mettez à jour votre moyen de paiement pour conserver votre plan actif.",
  cta: "Mettre à jour le paiement",
  hint: "Besoin d'aide ? Répondez à cet email.",
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
const alertBanner = {
  backgroundColor: "#fff5f5",
  border: "1px solid #fed7d7",
  borderRadius: "6px",
  padding: "12px 16px",
  margin: "0 0 24px",
};
const alertText = {
  color: "#c53030",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0",
};
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
const ctaWrap = { margin: "0 0 32px" };
const button = {
  backgroundColor: "#c53030",
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
