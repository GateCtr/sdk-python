/**
 * Unit Tests for UserWelcomeEmail Component
 *
 * Tests that the welcome email renders correctly with user data,
 * supports English and French locales, and includes an unsubscribe link.
 *
 * Validates Requirements: 11.1, 11.2, 11.8
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@react-email/render";
import UserWelcomeEmail from "@/components/emails/user-welcome";

// Mock environment variable used in the component
vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.gatectr.com");

describe("UserWelcomeEmail", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.gatectr.com");
  });

  describe("English locale (default)", () => {
    it("renders with user name", async () => {
      const html = await render(
        <UserWelcomeEmail name="Alice" email="alice@example.com" locale="en" />,
      );

      expect(html).toContain("Alice");
      expect(html).toContain("GateCtr");
    });

    it("renders without user name using default greeting", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="en" />,
      );

      expect(html).toContain("Hi,");
    });

    it("renders English preview text", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="en" />,
      );

      expect(html).toContain("Your GateCtr workspace is ready.");
    });

    it("renders English CTA button", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="en" />,
      );

      expect(html).toContain("Open dashboard");
    });

    it("renders English dashboard link", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="en" />,
      );

      expect(html).toContain("/dashboard");
      // English locale should NOT have /fr/ prefix
      expect(html).not.toContain("/fr/dashboard");
    });

    it("renders feature descriptions in English", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="en" />,
      );

      expect(html).toContain("Budget Firewall");
      expect(html).toContain("Context Optimizer");
      expect(html).toContain("Model Router");
    });
  });

  describe("French locale", () => {
    it("renders French heading", async () => {
      const html = await render(
        <UserWelcomeEmail name="Alice" email="alice@example.com" locale="fr" />,
      );

      expect(html).toContain("GateCtr");
    });

    it("renders French greeting with name", async () => {
      const html = await render(
        <UserWelcomeEmail name="Alice" email="alice@example.com" locale="fr" />,
      );

      expect(html).toContain("Bonjour");
      expect(html).toContain("Alice");
    });

    it("renders French default greeting without name", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />,
      );

      expect(html).toContain("Bonjour,");
    });

    it("renders French preview text", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />,
      );

      expect(html).toContain("Votre espace GateCtr est prêt.");
    });

    it("renders French CTA button", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />,
      );

      expect(html).toContain("Ouvrir le tableau de bord");
    });

    it("renders French dashboard link with /fr/ prefix", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />,
      );

      expect(html).toContain("/fr/dashboard");
    });

    it("renders French feature descriptions", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />,
      );

      expect(html).toContain("Budget Firewall");
      expect(html).toContain("Context Optimizer");
      expect(html).toContain("Model Router");
    });

    it("renders French unsubscribe text", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />,
      );

      expect(html).toContain("Se désabonner");
    });
  });

  describe("Unsubscribe link", () => {
    it("includes unsubscribe link with encoded email in English", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="en" />,
      );

      expect(html).toContain("unsubscribe");
      expect(html).toContain("alice@example.com");
    });

    it("includes unsubscribe link with encoded email in French", async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />,
      );

      expect(html).toContain("unsubscribe");
      expect(html).toContain("alice@example.com");
    });

    it("unsubscribe link uses the app URL", async () => {
      const html = await render(
        <UserWelcomeEmail email="user@test.com" locale="en" />,
      );

      expect(html).toContain("https://app.gatectr.com/unsubscribe");
    });

    it("unsubscribe link falls back when env var is not set", async () => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

      const html = await render(
        <UserWelcomeEmail email="user@test.com" locale="en" />,
      );

      expect(html).toContain("unsubscribe");
      expect(html).toContain("user@test.com");
    });
  });

  describe("Common structure", () => {
    it("renders GateCtr brand name", async () => {
      const html = await render(<UserWelcomeEmail email="alice@example.com" />);

      expect(html).toContain("GateCtr");
    });

    it("renders gatectr.com footer link", async () => {
      const html = await render(<UserWelcomeEmail email="alice@example.com" />);

      expect(html).toContain("gatectr.com");
    });

    it("defaults to English locale when no locale prop is provided", async () => {
      const html = await render(<UserWelcomeEmail email="alice@example.com" />);

      expect(html).toContain("Open dashboard");
      expect(html).not.toContain("Ouvrir le tableau de bord");
    });
  });
});
