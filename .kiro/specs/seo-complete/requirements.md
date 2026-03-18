# Requirements Document

## Introduction

GateCtr needs complete, production-grade SEO — the kind found on major SaaS apps (Vercel, Linear, Stripe). The app is a Next.js 16 App Router application with next-intl 4 for bilingual support (EN default, FR with `/fr/` prefix). Pages span marketing (home, waitlist), auth (sign-in, sign-up), dashboard, and admin.

The SEO system must cover: per-page metadata, Open Graph, Twitter Cards, JSON-LD structured data, canonical URLs, hreflang alternate links for i18n, sitemap.xml, robots.txt, and web app manifest. All metadata must be translated (EN/FR) and dynamically generated per page.

## Glossary

- **SEO_System**: The complete set of metadata, structured data, and crawl directives implemented in GateCtr
- **Metadata**: HTML `<head>` tags including title, description, Open Graph, Twitter Card, and canonical
- **JSON-LD**: JavaScript Object Notation for Linked Data — structured data format consumed by search engines
- **Sitemap**: XML file listing all public URLs with their localized alternates
- **Robots_File**: `robots.txt` file controlling crawler access per route group
- **Canonical_URL**: The authoritative URL for a page, preventing duplicate content indexing
- **Hreflang**: HTML attribute signaling language/region alternates to search engines
- **OG_Image**: Open Graph image used when a URL is shared on social platforms
- **Locale**: Either `en` (English, default, no prefix) or `fr` (French, `/fr/` prefix)
- **Marketing_Pages**: Public pages served on `gatectr.com`: home (`/`), waitlist (`/waitlist`)
- **Auth_Pages**: Sign-in (`/sign-in`), sign-up (`/sign-up`) — served on `app.gatectr.com`
- **Dashboard_Pages**: Protected pages under `/dashboard/*` — served on `app.gatectr.com`
- **Admin_Pages**: Protected pages under `/admin/*` — served on `app.gatectr.com`
- **Marketing_Subdomain**: The root domain `gatectr.com` — SEO-indexable, serves Marketing_Pages only
- **App_Subdomain**: The subdomain `app.gatectr.com` — noindex, serves Auth_Pages, Dashboard_Pages, Admin_Pages, and Onboarding
- **Marketing_Base_URL**: The base URL for Marketing_Pages, read from `NEXT_PUBLIC_MARKETING_URL` env var (e.g. `https://gatectr.com`)
- **App_Base_URL**: The base URL for App_Subdomain pages, read from `NEXT_PUBLIC_APP_URL` env var (e.g. `https://app.gatectr.com`)

---

## Requirements

### Requirement 1: Per-Page Metadata with i18n

**User Story:** As a developer, I want every page to export locale-aware `generateMetadata()`, so that search engines and social platforms receive accurate, translated titles and descriptions.

#### Acceptance Criteria

1. THE SEO_System SHALL generate a unique `<title>` for each page following the pattern `{Page Title} | GateCtr`
2. THE SEO_System SHALL generate a unique `<meta name="description">` for each page, with content between 120 and 160 characters
3. WHEN the locale is `fr`, THE SEO_System SHALL return French translations for all metadata fields
4. WHEN the locale is `en`, THE SEO_System SHALL return English translations for all metadata fields
5. THE SEO_System SHALL define metadata for: home, waitlist, sign-in, sign-up, dashboard, and all admin pages
6. THE SEO_System SHALL set `<meta name="robots" content="noindex, nofollow">` on all Dashboard_Pages and Admin_Pages
7. THE SEO_System SHALL set `<meta name="robots" content="index, follow">` on all Marketing_Pages
8. THE SEO_System SHALL set `<meta name="robots" content="noindex, nofollow">` on all Auth_Pages

---

### Requirement 2: Open Graph & Twitter Card Tags

**User Story:** As a marketing stakeholder, I want rich previews when GateCtr URLs are shared on social platforms, so that link shares drive click-through.

#### Acceptance Criteria

1. THE SEO_System SHALL include `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, and `og:image` tags on all Marketing_Pages
2. THE SEO_System SHALL include `twitter:card`, `twitter:title`, `twitter:description`, and `twitter:image` tags on all Marketing_Pages
3. THE SEO_System SHALL set `og:type` to `website` for Marketing_Pages
4. THE SEO_System SHALL set `og:image` to a static OG image at `/og/default.png` with dimensions 1200×630 pixels
5. WHEN a page has a specific OG image, THE SEO_System SHALL use that image instead of the default
6. WHEN the page is a Marketing_Page, THE SEO_System SHALL set `og:url` to the canonical URL using `NEXT_PUBLIC_MARKETING_URL` as the base
7. THE SEO_System SHALL set `og:locale` to `en_US` for English pages and `fr_FR` for French pages
8. THE SEO_System SHALL set `og:locale:alternate` to the other locale on all Marketing_Pages
9. IF a page is a Dashboard_Page or Admin_Page, THEN THE SEO_System SHALL omit Open Graph and Twitter Card tags

---

### Requirement 3: Canonical URLs

**User Story:** As a developer, I want canonical URLs on every public page, so that search engines do not index duplicate content across locales or subdomains.

#### Acceptance Criteria

1. THE SEO_System SHALL set a `<link rel="canonical">` tag on every Marketing_Page and Auth_Page
2. WHEN the locale is `en` and the page is a Marketing_Page, THE SEO_System SHALL set the canonical URL to `{NEXT_PUBLIC_MARKETING_URL}{path}` without a locale prefix
3. WHEN the locale is `fr` and the page is a Marketing_Page, THE SEO_System SHALL set the canonical URL to `{NEXT_PUBLIC_MARKETING_URL}/fr{path}`
4. WHEN the page is an Auth_Page, THE SEO_System SHALL set the canonical URL using `{NEXT_PUBLIC_APP_URL}{path}` as the base
5. THE SEO_System SHALL read Marketing_Page base URLs from the `NEXT_PUBLIC_MARKETING_URL` environment variable
6. THE SEO_System SHALL read Auth_Page and App_Subdomain base URLs from the `NEXT_PUBLIC_APP_URL` environment variable
7. IF `NEXT_PUBLIC_MARKETING_URL` is not set, THEN THE SEO_System SHALL fall back to `https://gatectr.com`
8. IF `NEXT_PUBLIC_APP_URL` is not set, THEN THE SEO_System SHALL fall back to `https://app.gatectr.com`

---

### Requirement 4: Hreflang Alternate Links

**User Story:** As a developer, I want hreflang tags on all marketing pages, so that Google serves the correct language version to users in each region.

#### Acceptance Criteria

1. THE SEO_System SHALL include `<link rel="alternate" hreflang="en" href="...">` and `<link rel="alternate" hreflang="fr" href="...">` on every Marketing_Page
2. THE SEO_System SHALL include `<link rel="alternate" hreflang="x-default" href="...">` pointing to the English URL on every Marketing_Page
3. WHEN generating hreflang URLs, THE SEO_System SHALL use `NEXT_PUBLIC_MARKETING_URL` as the base URL
4. THE SEO_System SHALL omit hreflang tags from Auth_Pages, Dashboard_Pages, and Admin_Pages

---

### Requirement 5: JSON-LD Structured Data

**User Story:** As a developer, I want JSON-LD structured data on key pages, so that search engines display rich results (sitelinks, organization info, breadcrumbs).

#### Acceptance Criteria

1. THE SEO_System SHALL inject a `WebSite` JSON-LD schema on the home page including `name`, `url`, and `description`, where `url` is set to `NEXT_PUBLIC_MARKETING_URL`
2. THE SEO_System SHALL inject an `Organization` JSON-LD schema on the home page including `name`, `url`, `logo`, and `sameAs` (social links), where `url` is set to `NEXT_PUBLIC_MARKETING_URL`
3. THE SEO_System SHALL inject a `WebPage` JSON-LD schema on the waitlist page including `name`, `description`, and `url`
4. WHEN a page has breadcrumb navigation, THE SEO_System SHALL inject a `BreadcrumbList` JSON-LD schema
5. THE SEO_System SHALL render JSON-LD as a `<script type="application/ld+json">` tag in the page `<head>`
6. THE SEO_System SHALL generate JSON-LD content in the language of the current locale

---

### Requirement 6: Sitemap

**User Story:** As a developer, I want an auto-generated sitemap.xml served only from the marketing domain, so that search engines discover and index all public marketing pages efficiently.

#### Acceptance Criteria

1. THE SEO_System SHALL generate a `sitemap.xml` accessible at `gatectr.com/sitemap.xml`
2. THE SEO_System SHALL include all Marketing_Pages in the sitemap for both `en` and `fr` locales
3. THE SEO_System SHALL exclude Dashboard_Pages, Admin_Pages, Auth_Pages, and Onboarding pages from the sitemap
4. THE SEO_System SHALL set `<lastmod>` to the build date for static pages
5. THE SEO_System SHALL set `<changefreq>` to `weekly` for the home page and `monthly` for other Marketing_Pages
6. THE SEO_System SHALL set `<priority>` to `1.0` for the home page and `0.8` for other Marketing_Pages
7. THE SEO_System SHALL include `<xhtml:link rel="alternate">` entries for each locale alternate within each `<url>` block
8. WHEN a request for `/sitemap.xml` is received on the App_Subdomain (`app.gatectr.com`), THE SEO_System SHALL return a 404 response
9. WHEN generating sitemap URLs, THE SEO_System SHALL use `NEXT_PUBLIC_MARKETING_URL` as the base URL

---

### Requirement 7: Robots.txt

**User Story:** As a developer, I want subdomain-specific robots.txt files, so that crawlers are correctly directed on both the marketing domain and the app subdomain.

#### Acceptance Criteria

1. THE SEO_System SHALL generate a `robots.txt` accessible at `gatectr.com/robots.txt` that allows crawlers to access Marketing_Pages
2. THE SEO_System SHALL disallow all crawlers in `gatectr.com/robots.txt` from `/dashboard`, `/fr/dashboard`, `/admin`, `/fr/admin`, `/api`, `/onboarding`, `/fr/onboarding`, `/sign-in`, `/fr/sign-in`, `/sign-up`, and `/fr/sign-up`
3. THE SEO_System SHALL include a `Sitemap:` directive in `gatectr.com/robots.txt` pointing to the full URL of `sitemap.xml` using `NEXT_PUBLIC_MARKETING_URL` as the base
4. THE SEO_System SHALL generate a `robots.txt` accessible at `app.gatectr.com/robots.txt` that disallows all crawlers from all paths (`Disallow: /`)
5. THE `app.gatectr.com/robots.txt` SHALL NOT include a `Sitemap:` directive
6. WHEN the SEO_System detects the current subdomain is App_Subdomain, THE SEO_System SHALL serve the app-subdomain robots.txt variant
7. WHEN the SEO_System detects the current subdomain is Marketing_Subdomain, THE SEO_System SHALL serve the marketing robots.txt variant

---

### Requirement 8: Web App Manifest & PWA Metadata

**User Story:** As a developer, I want a complete web app manifest and PWA meta tags, so that GateCtr can be added to home screens with correct branding.

#### Acceptance Criteria

1. THE SEO_System SHALL serve a `manifest.json` at `/manifest.json` with `name`, `short_name`, `start_url`, `display`, `theme_color`, `background_color`, and `icons`
2. THE SEO_System SHALL include `<meta name="theme-color">` in the root layout
3. THE SEO_System SHALL include `<link rel="apple-touch-icon">` pointing to `/apple-icon.png`
4. THE SEO_System SHALL include `<meta name="apple-mobile-web-app-capable" content="yes">` in the root layout
5. THE SEO_System SHALL include `<meta name="apple-mobile-web-app-status-bar-style">` in the root layout
6. THE SEO_System SHALL reference icons at sizes 192×192 and 512×512 in the manifest

---

### Requirement 9: SEO Translation Keys

**User Story:** As a developer, I want all SEO metadata text stored in the i18n translation files, so that titles, descriptions, and OG text are maintained alongside other copy.

#### Acceptance Criteria

1. THE SEO_System SHALL store metadata strings for each page under a `metadata` namespace in the corresponding translation file
2. THE SEO_System SHALL provide translations in both `messages/en/` and `messages/fr/` for every metadata key
3. WHEN a translation key is missing, THE SEO_System SHALL fall back to the English value
4. THE SEO_System SHALL include metadata keys for: `title`, `description`, `ogTitle`, `ogDescription` for each public page
5. THE SEO_System SHALL use `getTranslations()` from `next-intl/server` to resolve metadata strings at request time

---

### Requirement 10: OG Image Generation

**User Story:** As a developer, I want a dynamic OG image endpoint, so that page-specific social previews can be generated without maintaining static images for every page.

#### Acceptance Criteria

1. THE SEO_System SHALL expose an OG image route at `/api/og` using Next.js `ImageResponse`
2. WHEN called with a `title` query parameter, THE SEO_System SHALL render that title in the OG image
3. WHEN called with a `description` query parameter, THE SEO_System SHALL render that description in the OG image
4. THE SEO_System SHALL render the GateCtr logo and brand colors in the OG image
5. THE SEO_System SHALL return images with dimensions 1200×630 pixels
6. THE SEO_System SHALL set a `Cache-Control` header of `public, max-age=86400, immutable` on OG image responses

---

### Requirement 11: Subdomain-Aware SEO Context Detection

**User Story:** As a developer, I want the SEO system to detect the current subdomain context at request time, so that the correct base URLs, robots directives, and metadata are applied automatically without manual per-page configuration.

#### Acceptance Criteria

1. THE SEO_System SHALL detect whether the current request originates from Marketing_Subdomain (`gatectr.com`) or App_Subdomain (`app.gatectr.com`) by inspecting the request host header
2. WHEN the host starts with `app.`, THE SEO_System SHALL classify the context as App_Subdomain and apply App_Base_URL for all URL generation
3. WHEN the host does not start with `app.`, THE SEO_System SHALL classify the context as Marketing_Subdomain and apply Marketing_Base_URL for all URL generation
4. THE SEO_System SHALL read `NEXT_PUBLIC_MARKETING_URL` as the Marketing_Base_URL and `NEXT_PUBLIC_APP_URL` as the App_Base_URL from environment variables
5. IF `NEXT_PUBLIC_MARKETING_URL` is not set, THEN THE SEO_System SHALL fall back to `https://gatectr.com`
6. IF `NEXT_PUBLIC_APP_URL` is not set, THEN THE SEO_System SHALL fall back to `https://app.gatectr.com`
7. WHEN the subdomain context is App_Subdomain, THE SEO_System SHALL set `<meta name="robots" content="noindex, nofollow">` on all pages regardless of page type
8. WHEN the subdomain context is Marketing_Subdomain, THE SEO_System SHALL apply per-page robots directives as defined in Requirement 1
9. THE SEO_System SHALL expose a utility function that returns the resolved `{ marketingUrl, appUrl, isAppSubdomain }` context for use in `generateMetadata()`, sitemap, and robots handlers
