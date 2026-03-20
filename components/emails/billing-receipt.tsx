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

interface BillingReceiptEmailProps {
  email: string;
  amount: number; // in cents
  currency?: string;
  invoicePdfUrl?: string | null;
  locale?: "en" | "fr";
}

export default function BillingReceiptEmail({
  email,
  amount,
  currency = "eur",
  invoicePdfUrl,
  locale = "en",
}: BillingReceiptEmailProps) {
  const formatted = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);

  const c = locale === "fr" ? contentFr(formatted) : contentEn(formatted);

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
            <Section style={amountBox}>
              <Text style={amountLabel}>{c.amountLabel}</Text>
              <Text style={amountValue}>{formatted}</Text>
            </Section>
            {invoicePdfUrl && (
              <Section style={ctaWrap}>
                <Button href={invoicePdfUrl} style={button}>
                  {c.cta}
                </Button>
              </Section>
            )}
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

const contentEn = (amount: string) => ({
  preview: `Payment confirmed — ${amount}`,
  headline: "Payment confirmed.",
  body: "Your GateCtr subscription has been renewed. Here's your receipt.",
  amountLabel: "Amount charged",
  cta: "Download invoice",
  hint: "Questions about this charge? Reply to this email.",
  tagline: "One gateway. Every LLM.",
  unsub: "Unsubscribe",
});

const contentFr = (amount: string) => ({
  preview: `Paiement confirmé — ${amount}`,
  headline: "Paiement confirmé.",
  body: "Votre abonnement GateCtr a été renouvelé. Voici votre reçu.",
  amountLabel: "Montant débité",
  cta: "Télécharger la facture",
  hint: "Des questions sur ce paiement ? Répondez à cet email.",
  tagline: "Une passerelle. Tous les LLMs.",
  unsub: "Se désabonner",
});

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
const amountBox = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "20px 24px",
  margin: "0 0 24px",
};
const amountLabel = { color: "#718096", fontSize: "13px", margin: "0 0 4px" };
const amountValue = {
  color: "#1a1a1a",
  fontSize: "28px",
  fontWeight: "700",
  margin: "0",
};
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
