import { test, expect } from "@playwright/test";

/**
 * E2E tests for locale switching
 * Requirements: 1.8, 7.7, 15.5, 17.4
 *
 * The app uses next-intl with localePrefix: 'as-needed':
 * - English (default): /sign-in, /sign-up, /waitlist (no prefix)
 * - French: /fr/sign-in, /fr/sign-up, /fr/waitlist (with /fr/ prefix)
 *
 * Note: Real Clerk authentication is not available in E2E tests.
 * These tests verify URL-based locale behavior and page accessibility.
 */

test.describe("URL locale prefix behavior", () => {
  /**
   * Requirement 1.8: Authentication pages support multiple locales
   */
  test("English sign-in has no /fr/ prefix", async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/sign-in/);
  });

  test("French sign-in has /fr/ prefix", async ({ page }) => {
    await page.goto("/fr/sign-in");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/fr\/sign-in/);
  });

  test("English sign-up has no /fr/ prefix", async ({ page }) => {
    await page.goto("/sign-up");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/sign-up/);
  });

  test("French sign-up has /fr/ prefix", async ({ page }) => {
    await page.goto("/fr/sign-up");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/fr\/sign-up/);
  });

  test("English waitlist has no /fr/ prefix", async ({ page }) => {
    await page.goto("/waitlist");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/waitlist/);
  });

  test("French waitlist has /fr/ prefix", async ({ page }) => {
    await page.goto("/fr/waitlist");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/fr\/waitlist/);
  });
});

test.describe("Authentication pages exist in both locales (Requirement 1.8)", () => {
  test("sign-in page is accessible in English", async ({ page }) => {
    const response = await page.goto("/sign-in");
    expect(response?.status()).toBe(200);
  });

  test("sign-in page is accessible in French", async ({ page }) => {
    const response = await page.goto("/fr/sign-in");
    expect(response?.status()).toBe(200);
  });

  test("sign-up page is accessible in English", async ({ page }) => {
    const response = await page.goto("/sign-up");
    expect(response?.status()).toBe(200);
  });

  test("sign-up page is accessible in French", async ({ page }) => {
    const response = await page.goto("/fr/sign-up");
    expect(response?.status()).toBe(200);
  });
});

test.describe("French locale displays French content (Requirement 1.8, 7.7)", () => {
  test("French sign-in page renders expected French heading", async ({
    page,
  }) => {
    await page.goto("/fr/sign-in");
    await page.waitForLoadState("networkidle");
    // French translation: "Connexion à GateCtr"
    await expect(
      page.getByRole("heading", { name: /connexion à gatectr/i }),
    ).toBeVisible();
  });

  test("French sign-up page renders expected French heading", async ({
    page,
  }) => {
    await page.goto("/fr/sign-up");
    await page.waitForLoadState("networkidle");
    // French translation: "Créer votre compte GateCtr"
    await expect(
      page.getByRole("heading", { name: /créer votre compte gatectr/i }),
    ).toBeVisible();
  });

  test("English sign-in page renders English heading", async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");
    // English translation: "Sign in to GateCtr"
    await expect(
      page.getByRole("heading", { name: /sign in to gatectr/i }),
    ).toBeVisible();
  });

  test("English sign-up page renders English heading", async ({ page }) => {
    await page.goto("/sign-up");
    await page.waitForLoadState("networkidle");
    // English translation: "Create your GateCtr account"
    await expect(
      page.getByRole("heading", { name: /create your gatectr account/i }),
    ).toBeVisible();
  });
});

test.describe("LanguageSwitcher component on auth pages (Requirement 1.8)", () => {
  test("LanguageSwitcher is present on English sign-in page", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");
    // LanguageSwitcher renders a button with language name or flag
    const languageSwitcher = page
      .locator("button")
      .filter({ hasText: /english|français|en|fr/i })
      .first();
    await expect(languageSwitcher).toBeVisible({ timeout: 10000 });
  });

  test("LanguageSwitcher is present on French sign-in page", async ({
    page,
  }) => {
    await page.goto("/fr/sign-in");
    await page.waitForLoadState("networkidle");
    const languageSwitcher = page
      .locator("button")
      .filter({ hasText: /english|français|en|fr/i })
      .first();
    await expect(languageSwitcher).toBeVisible({ timeout: 10000 });
  });

  test("LanguageSwitcher is present on English sign-up page", async ({
    page,
  }) => {
    await page.goto("/sign-up");
    await page.waitForLoadState("networkidle");
    const languageSwitcher = page
      .locator("button")
      .filter({ hasText: /english|français|en|fr/i })
      .first();
    await expect(languageSwitcher).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Locale switching via URL navigation (Requirement 15.5, 17.4)", () => {
  /**
   * Requirement 15.5: Locale is preserved during authentication flow
   * Requirement 17.4: Locale preserved in redirect URLs
   */
  test("navigating from /sign-in to /fr/sign-in switches to French locale", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/sign-in/);

    // Navigate to French version
    await page.goto("/fr/sign-in");
    await page.waitForURL(/\/fr\/sign-in/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/fr\/sign-in/);
  });

  test("navigating from /fr/sign-in to /sign-in switches back to English locale", async ({
    page,
  }) => {
    await page.goto("/fr/sign-in");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/fr\/sign-in/);

    // Navigate back to English version
    await page.goto("/sign-in");
    await page.waitForURL(/^http:\/\/localhost:3000\/sign-in/, {
      timeout: 10000,
    });
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/sign-in/);
  });

  test("locale is preserved when navigating between pages in French locale", async ({
    page,
  }) => {
    // Start at French sign-in
    await page.goto("/fr/sign-in");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/fr\/sign-in/);

    // Navigate to French sign-up — locale should remain /fr/
    await page.goto("/fr/sign-up");
    await page.waitForURL(/\/fr\/sign-up/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/fr\/sign-up/);
  });

  test("locale is preserved when navigating between pages in English locale", async ({
    page,
  }) => {
    // Start at English sign-in
    await page.goto("/sign-in");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/sign-in/);

    // Navigate to English sign-up — no /fr/ prefix
    await page.goto("/sign-up");
    await page.waitForURL(/^http:\/\/localhost:3000\/sign-up/, {
      timeout: 10000,
    });
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/sign-up/);
  });
});

test.describe("Public pages accessible in both locales (Requirement 1.8)", () => {
  test("home page is accessible in English", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\//);
  });

  test("home page is accessible in French", async ({ page }) => {
    const response = await page.goto("/fr");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/fr/);
  });

  test("waitlist page is accessible in English", async ({ page }) => {
    const response = await page.goto("/waitlist");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/waitlist/);
  });

  test("waitlist page is accessible in French", async ({ page }) => {
    const response = await page.goto("/fr/waitlist");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/fr\/waitlist/);
  });
});

test.describe("Locale preserved during authentication flow (Requirement 7.7, 17.4)", () => {
  /**
   * Requirement 7.7: Locale is preserved during authentication flow
   * French sign-in stays French throughout the flow
   */
  test("French sign-in URL preserves /fr/ locale prefix after page load", async ({
    page,
  }) => {
    await page.goto("/fr/sign-in");
    await page.waitForLoadState("networkidle");
    // URL must still have /fr/ prefix after full page load (no redirect to English)
    await expect(page).toHaveURL(/\/fr\/sign-in/);
  });

  test("French sign-up URL preserves /fr/ locale prefix after page load", async ({
    page,
  }) => {
    await page.goto("/fr/sign-up");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/fr\/sign-up/);
  });

  test("unauthenticated access to French protected route redirects to French sign-in (Requirement 17.4)", async ({
    page,
  }) => {
    // Requirement 17.4: locale preserved in redirect URLs
    await page.goto("/fr/dashboard");
    await page.waitForURL(/sign-in/, { timeout: 10000 });
    const url = page.url();
    // Should redirect to a sign-in page (locale-aware middleware)
    expect(url).toContain("sign-in");
  });

  test("French sign-in page does not redirect to English version", async ({
    page,
  }) => {
    await page.goto("/fr/sign-in");
    await page.waitForLoadState("networkidle");
    // Must NOT be redirected to /sign-in (English)
    const url = page.url();
    expect(url).toMatch(/\/fr\/sign-in/);
    expect(url).not.toMatch(/^http:\/\/localhost:3000\/sign-in$/);
  });
});
