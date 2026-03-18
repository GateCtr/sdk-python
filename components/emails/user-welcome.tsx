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

interface UserWelcomeEmailProps {
  name?: string;
  email: string;
  locale?: "en" | "fr";
}

export default function UserWelcomeEmail({
  name,
  email,
  locale = "en",
}: UserWelcomeEmailProps) {
  const c = locale === "fr" ? contentFr : contentEn;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://gatectr.com"}${locale === "fr" ? "/fr" : ""}/dashboard`;

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
            <Text style={greeting}>
              {name ? `${c.hi} ${name},` : c.hiDefault}
            </Text>
            <Heading style={h1}>{c.headline}</Heading>
            <Text style={text}>{c.body}</Text>

            <Section style={ctaWrap}>
              <Button href={dashboardUrl} style={button}>
                {c.cta}
              </Button>
            </Section>

            <Section style={features}>
              {c.items.map((item) => (
                <Text key={item.title} style={featureItem}>
                  <strong>{item.title}</strong>
                  <br />
                  {item.desc}
                </Text>
              ))}
            </Section>

            <Text style={hint}>{c.hint}</Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>GateCtr — {c.tagline}</Text>
            <Text style={footerText}>
              <Link href="https://gatectr.com" style={footerLink}>
                gatectr.com
              </Link>
              {" · "}
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
  preview: "Your GateCtr workspace is ready.",
  hi: "Hi",
  hiDefault: "Hi,",
  headline: "You're in. Start saving.",
  body: "Your account is live. Connect your first LLM provider and GateCtr starts optimizing immediately.",
  cta: "Open dashboard",
  items: [
    {
      title: "💰 Budget Firewall",
      desc: "Hard caps. Soft alerts. No surprise invoices.",
    },
    {
      title: "⚡ Context Optimizer",
      desc: "-40% tokens. Same output quality.",
    },
    {
      title: "🎯 Model Router",
      desc: "GateCtr picks the right LLM. You pay less.",
    },
  ],
  hint: "Questions? Reply to this email.",
  tagline: "One gateway. Every LLM.",
  unsub: "Unsubscribe",
};

const contentFr = {
  preview: "Votre espace GateCtr est prêt.",
  hi: "Bonjour",
  hiDefault: "Bonjour,",
  headline: "C'est parti. Commencez à économiser.",
  body: "Votre compte est actif. Connectez votre premier provider LLM — GateCtr optimise immédiatement.",
  cta: "Ouvrir le tableau de bord",
  items: [
    {
      title: "💰 Budget Firewall",
      desc: "Limites strictes. Alertes douces. Zéro facture surprise.",
    },
    {
      title: "⚡ Context Optimizer",
      desc: "-40% de tokens. Même qualité de sortie.",
    },
    {
      title: "🎯 Model Router",
      desc: "GateCtr choisit le bon LLM. Vous payez moins.",
    },
  ],
  hint: "Des questions ? Répondez à cet email.",
  tagline: "Une passerelle. Tous les LLMs.",
  unsub: "Se désabonner",
};

// ─── Styles ───────────────────────────────────────────────────────────────────

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
const header = {
  padding: "32px 40px",
  borderBottom: "1px solid #e6ebf1",
};
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
  backgroundColor: "#1B4F82",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600",
  padding: "12px 28px",
  textDecoration: "none",
  display: "inline-block",
};
const features = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "24px",
  margin: "0 0 24px",
};
const featureItem = {
  color: "#4a5568",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 14px",
};
const hint = { color: "#a0aec0", fontSize: "13px", margin: "0 0 0" };
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
