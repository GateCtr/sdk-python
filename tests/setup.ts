/**
 * Vitest Setup File
 *
 * This file runs before all tests to set up the testing environment.
 */

import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Mock next-intl globally to avoid ESM resolution issues with next/navigation
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "en",
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "en",
  getMessages: async () => ({}),
}));

// Mock @/i18n/routing to prevent next-intl from calling createNavigation
// which requires next/navigation exports not available in jsdom
vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "fr"], defaultLocale: "en" },
  Link: "a",
  redirect: vi.fn(),
  usePathname: vi.fn(() => "/"),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  getPathname: vi.fn(() => "/"),
}));

// Mock next/navigation with all required exports
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  notFound: vi.fn(),
}));

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock environment variables for tests
process.env.UPSTASH_REDIS_REST_URL = "https://test-redis.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_test";
process.env.CLERK_SECRET_KEY = "sk_test_test";
