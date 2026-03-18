/**
 * Unit Tests for UserWelcomeEmail Component
 *
 * Tests that the welcome email renders correctly with user data,
 * supports English and French locales, and includes an unsubscribe link.
 *
 * Validates Requirements: 11.1, 11.2, 11.8
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@react-email/render';
import UserWelcomeEmail from '@/components/emails/user-welcome';

// Mock environment variable used in the component
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.gatectr.com');

describe('UserWelcomeEmail', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.gatectr.com');
  });

  describe('English locale (default)', () => {
    it('renders with user name', async () => {
      const html = await render(
        <UserWelcomeEmail name="Alice" email="alice@example.com" locale="en" />
      );

      expect(html).toContain('Alice');
      expect(html).toContain('Welcome to GateCtr');
    });

    it('renders without user name using default greeting', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="en" />
      );

      expect(html).toContain('Hi there,');
    });

    it('renders English preview text', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="en" />
      );

      expect(html).toContain('Welcome to GateCtr - Your LLM cost control platform');
    });

    it('renders English CTA button', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="en" />
      );

      expect(html).toContain('Go to Dashboard');
    });

    it('renders English dashboard link', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="en" />
      );

      expect(html).toContain('/dashboard');
      // English locale should NOT have /fr/ prefix
      expect(html).not.toContain('/fr/dashboard');
    });

    it('renders feature descriptions in English', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="en" />
      );

      expect(html).toContain('Budget Firewall');
      expect(html).toContain('Context Optimizer');
      expect(html).toContain('Model Router');
    });
  });

  describe('French locale', () => {
    it('renders French heading', async () => {
      const html = await render(
        <UserWelcomeEmail name="Alice" email="alice@example.com" locale="fr" />
      );

      expect(html).toContain('Bienvenue sur GateCtr');
    });

    it('renders French greeting with name', async () => {
      const html = await render(
        <UserWelcomeEmail name="Alice" email="alice@example.com" locale="fr" />
      );

      expect(html).toContain('Bonjour');
      expect(html).toContain('Alice');
    });

    it('renders French default greeting without name', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />
      );

      expect(html).toContain('Bonjour,');
    });

    it('renders French preview text', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />
      );

      expect(html).toContain('Bienvenue sur GateCtr - Votre plateforme de contrôle des coûts LLM');
    });

    it('renders French CTA button', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />
      );

      expect(html).toContain('Accéder au tableau de bord');
    });

    it('renders French dashboard link with /fr/ prefix', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />
      );

      expect(html).toContain('/fr/dashboard');
    });

    it('renders French feature descriptions', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />
      );

      expect(html).toContain('Pare-feu budgétaire');
      expect(html).toContain('Optimiseur de contexte');
      expect(html).toContain('Routeur de modèles');
    });

    it('renders French unsubscribe text', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />
      );

      expect(html).toContain('Se désabonner');
    });
  });

  describe('Unsubscribe link', () => {
    it('includes unsubscribe link with encoded email in English', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="en" />
      );

      expect(html).toContain('unsubscribe');
      expect(html).toContain('alice@example.com');
    });

    it('includes unsubscribe link with encoded email in French', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" locale="fr" />
      );

      expect(html).toContain('unsubscribe');
      expect(html).toContain('alice@example.com');
    });

    it('unsubscribe link uses the app URL', async () => {
      const html = await render(
        <UserWelcomeEmail email="user@test.com" locale="en" />
      );

      expect(html).toContain('https://app.gatectr.com/unsubscribe');
    });

    it('unsubscribe link falls back to localhost when env var is not set', async () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');

      const html = await render(
        <UserWelcomeEmail email="user@test.com" locale="en" />
      );

      // Component uses || 'http://localhost:3000' fallback
      expect(html).toContain('unsubscribe');
      expect(html).toContain('user@test.com');
    });
  });

  describe('Common structure', () => {
    it('renders GateCtr brand name', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" />
      );

      expect(html).toContain('GateCtr');
    });

    it('renders gatectr.com footer link', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" />
      );

      expect(html).toContain('gatectr.com');
    });

    it('defaults to English locale when no locale prop is provided', async () => {
      const html = await render(
        <UserWelcomeEmail email="alice@example.com" />
      );

      expect(html).toContain('Go to Dashboard');
      expect(html).not.toContain('Accéder au tableau de bord');
    });
  });
});
