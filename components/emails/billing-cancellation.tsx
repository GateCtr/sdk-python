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

interface BillingCancellationEmailProps {
  email: string;
  planName: string;
  accessUntil: Date;
  locale?: "en" | "fr";
}

export default function BillingCancellationEmail({
  email,
  planName,
  accessUntil,
  locale = "en",
}: BillingCancellationEmailProps) {
  const dateStr = accessUntil.toLocaleDateString(
    locale === "fr" ? "fr-FR" : "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );
  const c =
    locale === "fr"
      ? contentFr(planName, dateStr)
      : contentEn(planName, dateStr);
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
            <Section style={accessBox}>
              <Text style={accessLabel}>{c.accessLabel}</Text>
              <Text style={accessDate}>{dateStr}</Text>
            </Section>
            <Text style={text}>{c.resumeHint}</Text>
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

const contentEn = (planName: string, dateStr: string) => ({
  preview: `Your ${planName} subscription is scheduled to cancel on ${dateStr}.`,
  headline: "Cancellation scheduled.",
  body: `Your ${planName} subscription will not renew. You keep full access until your current period ends.`,
  accessLabel: "Access until",
  resumeHint:
    "Changed your mind? You can resume your subscription anytime before that date.",
  cta: "Resume subscription",
  hint: "Questions? Reply to this email.",
  tagline: "One gateway. Every LLM.",
  unsub: "Unsubscribe",
});

const contentFr = (planName: string, dateStr: string) => ({
  preview: `Votre abonnement ${planName} est programmé pour être annulé le ${dateStr}.`,
  headline: "Annulation programmée.",
  body: `Votre abonnement ${planName} ne sera pas renouvelé. Vous conservez un accès complet jusqu'à la fin de la période en cours.`,
  accessLabel: "Accès jusqu'au",
  resumeHint:
    "Vous avez changé d'avis ? Vous pouvez reprendre votre abonnement à tout moment avant cette date.",
  cta: "Reprendre l'abonnement",
  hint: "Des questions ? Répondez à cet email.",
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
const accessBox = {
  backgroundColor: "#f6f9fc",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
};
const accessLabel = {
  color: "#718096",
  fontSize: "12px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 4px",
};
const accessDate = {
  color: "#1a1a1a",
  fontSize: "20px",
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
