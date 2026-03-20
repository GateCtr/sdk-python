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

interface BillingRenewalReminderEmailProps {
  email: string;
  renewalDate: Date;
  amount: number; // in cents
  currency?: string;
  locale?: "en" | "fr";
}

export default function BillingRenewalReminderEmail({
  email,
  renewalDate,
  amount,
  currency = "eur",
  locale = "en",
}: BillingRenewalReminderEmailProps) {
  const formattedDate = new Intl.DateTimeFormat(
    locale === "fr" ? "fr-FR" : "en-US",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  ).format(renewalDate);

  const formattedAmount = new Intl.NumberFormat(
    locale === "fr" ? "fr-FR" : "en-US",
    {
      style: "currency",
      currency: currency.toUpperCase(),
    },
  ).format(amount / 100);

  const c =
    locale === "fr"
      ? contentFr(formattedDate, formattedAmount)
      : contentEn(formattedDate, formattedAmount);
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
            <Section style={infoBox}>
              <Text style={infoRow}>
                <span style={infoLabel}>{c.dateLabel}</span> {formattedDate}
              </Text>
              <Text style={infoRow}>
                <span style={infoLabel}>{c.amountLabel}</span> {formattedAmount}
              </Text>
            </Section>
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

const contentEn = (date: string, amount: string) => ({
  preview: `Your GateCtr subscription renews on ${date}.`,
  headline: "Renewal in 7 days.",
  body: `Your subscription renews on ${date} for ${amount}. No action needed — we'll charge your card on file automatically.`,
  dateLabel: "Renewal date:",
  amountLabel: "Amount:",
  cta: "Manage billing",
  hint: "Want to change your plan? Visit billing settings.",
  tagline: "One gateway. Every LLM.",
  unsub: "Unsubscribe",
});

const contentFr = (date: string, amount: string) => ({
  preview: `Votre abonnement GateCtr se renouvelle le ${date}.`,
  headline: "Renouvellement dans 7 jours.",
  body: `Votre abonnement se renouvelle le ${date} pour ${amount}. Aucune action requise — nous débiterons votre carte automatiquement.`,
  dateLabel: "Date de renouvellement :",
  amountLabel: "Montant :",
  cta: "Gérer la facturation",
  hint: "Vous souhaitez changer de plan ? Consultez les paramètres de facturation.",
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
const infoBox = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "20px 24px",
  margin: "0 0 24px",
};
const infoRow = { color: "#4a5568", fontSize: "14px", margin: "0 0 8px" };
const infoLabel = { color: "#718096", fontWeight: "600" as const };
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
