# Implementation Plan: seo-complete

## Overview

Implement production-grade SEO for GateCtr using TypeScript / Next.js 16 App Router with next-intl 4. The implementation is organized around the shared `lib/seo.ts` utility that all other pieces consume, followed by per-surface metadata, structured data, crawl directives, and the OG image endpoint.

## Tasks

- [x] 1. Create `lib/seo.ts` — shared SEO context utility
  - Implement `getSeoContext()` reading the `host` header via `next/headers`
  - Implement `buildCanonicalUrl(path, locale, context)` with EN/FR prefix rules
  - Implement `buildAlternateUrls(path, context)` returning `{ en, fr, xDefault }`
  - Add `getSeoContextWithHost(host)` overload for testability (accepts host string directly)
  - Export `SeoContext` interface
  - Apply fallbacks: `NEXT_PUBLIC_MARKETING_URL ?? "https://gatectr.com"`, `NEXT_PUBLIC_APP_URL ?? "https://app.gatectr.com"`
  - Treat absent `host` header as marketing subdomain
  - _Requirements: 3.5, 3.6, 3.7, 3.8, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.9_

  - [x] 1.1 Write property test for canonical URL locale prefix invariant
    - **Property 1: Canonical URL locale prefix invariant**
    - **Validates: Requirements 3.2, 3.3**
    - Use `fc.constantFrom('en', 'fr')` and `fc.stringMatching(/^\/[a-z-/]*$/)` as arbitraries
    - Assert URL starts with `marketingUrl`, contains `/fr/` iff locale is `fr`, never contains `//`

  - [x] 1.2 Write property test for alternate URL round-trip
    - **Property 2: Alternate URL round-trip**
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - Assert `alts.en === buildCanonicalUrl(path, 'en', ctx)`, `alts.fr === buildCanonicalUrl(path, 'fr', ctx)`, `alts.xDefault === alts.en`

  - [x] 1.3 Write property test for getSeoContext fallback invariant
    - **Property 8: getSeoContext fallback invariant**
    - **Validates: Requirements 3.7, 3.8, 11.5, 11.6**
    - Parameterize over `fc.constantFrom('gatectr.com', 'app.gatectr.com', 'localhost:3000', 'app.localhost:3000')`
    - Assert `ctx.marketingUrl.length > 0 && ctx.appUrl.length > 0` for all inputs

- [x] 2. Add SEO translation keys to i18n message files
  - Create `messages/en/home.json` with `metadata.title`, `metadata.description`, `metadata.ogTitle`, `metadata.ogDescription`
  - Create `messages/fr/home.json` with French equivalents
  - Add `metadata.ogTitle` and `metadata.ogDescription` to existing `messages/en/waitlist.json` and `messages/fr/waitlist.json`
  - Verify `messages/en/auth.json` and `messages/fr/auth.json` have `metadata.signIn.title`, `metadata.signIn.description`, `metadata.signUp.title`, `metadata.signUp.description`
  - Update `i18n/request.ts` to load the new `home` namespace for both locales
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 3. Implement marketing layout `generateMetadata` in `app/[locale]/(marketing)/layout.tsx`
  - Replace the current minimal metadata export with a full implementation
  - Use `getTranslations({ locale, namespace: 'metadata.marketing' })` for default title template and description
  - Call `getSeoContext()` and `buildCanonicalUrl` / `buildAlternateUrls`
  - Set `robots: { index: true, follow: true }`
  - Set `alternates.canonical` and `alternates.languages`
  - Set `openGraph` with `type: 'website'`, `siteName`, `locale`, `alternateLocale`, default OG image `{ url: '/og/default.png', width: 1200, height: 630 }`
  - Set `twitter: { card: 'summary_large_image', images: ['/og/default.png'] }`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_

  - [x] 3.1 Write property test for og:locale complement invariant
    - **Property 9: og:locale complement invariant**
    - **Validates: Requirements 2.7, 2.8**
    - Extract a pure `buildOgLocale(locale)` helper from the layout
    - Assert `og.locale !== og.alternateLocale` for all locale inputs

- [x] 4. Implement per-page `generateMetadata` on home and waitlist pages
  - Add `generateMetadata` to `app/[locale]/page.tsx` using `home.metadata` namespace; set `title`, `description`, `alternates.canonical`, `openGraph.url`, `openGraph.title`, `openGraph.description`, `twitter.title`, `twitter.description`
  - Split `app/[locale]/(marketing)/waitlist/page.tsx` into a server shell + client form component (the page is currently `'use client'`); add `generateMetadata` to the server shell using `waitlist.metadata` namespace
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.5, 2.6, 3.1, 3.2, 3.3_

- [x] 5. Implement auth layout `generateMetadata` in `app/[locale]/(auth)/layout.tsx`
  - Replace current minimal metadata with `robots: { index: false, follow: false }` and `alternates.canonical` using `buildCanonicalUrl` with `appUrl` base
  - Omit Open Graph and Twitter tags
  - _Requirements: 1.8, 2.9, 3.1, 3.4, 4.4_

- [x] 6. Add `generateMetadata` to sign-in and sign-up pages
  - Add `generateMetadata` to `app/[locale]/(auth)/sign-in/[[...sign-in]]/page.tsx` using `auth.metadata.signIn` namespace
  - Add `generateMetadata` to `app/[locale]/(auth)/sign-up/[[...sign-up]]/page.tsx` using `auth.metadata.signUp` namespace
  - _Requirements: 1.1, 1.2, 1.5, 1.8_

- [x] 7. Add noindex metadata to admin and dashboard layouts
  - Add or update `generateMetadata` in the admin layout to set `robots: { index: false, follow: false }`
  - Add or update `generateMetadata` in the dashboard layout (if it exists) to set `robots: { index: false, follow: false }`
  - _Requirements: 1.6, 2.9, 4.4, 11.7_

  - [x] 7.1 Write unit test for app subdomain forces noindex
    - **Property 3: App subdomain forces noindex**
    - **Validates: Requirements 1.6, 1.8, 11.7**
    - Mock `getSeoContext` to return `isAppSubdomain: true`; assert resolved robots metadata contains `noindex`

- [x] 8. Checkpoint — Ensure all metadata tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Create `components/seo/json-ld.tsx` — JSON-LD Server Components
  - Implement generic `JsonLd({ schema })` that renders `<script type="application/ld+json">{JSON.stringify(schema)}</script>`
  - Implement `WebSiteJsonLd`, `OrganizationJsonLd`, and `WebPageJsonLd` convenience wrappers
  - All components are Server Components (no `'use client'`)
  - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [x] 9.1 Write property test for JSON-LD serialization round-trip
    - **Property 7: JSON-LD serialization round-trip**
    - **Validates: Requirements 5.5**
    - Use `fc.dictionary(fc.string(), fc.jsonValue())` as arbitrary
    - Render `<JsonLd schema={schema} />`, parse `<script>` text content, assert deep equality with input

- [x] 10. Inject JSON-LD schemas into home and waitlist pages
  - Add `<WebSiteJsonLd>` and `<OrganizationJsonLd>` to `app/[locale]/page.tsx` using `NEXT_PUBLIC_MARKETING_URL` as `url`; populate `sameAs` with an empty array (to be filled with social links later)
  - Add `<WebPageJsonLd>` to `app/[locale]/(marketing)/waitlist/page.tsx` server shell
  - Use `getTranslations` to populate `description` in the locale's language
  - _Requirements: 5.1, 5.2, 5.3, 5.6_

- [x] 11. Implement `app/sitemap.ts`
  - Export a `MetadataRoute.Sitemap` default function
  - Call `getSeoContext()`; return `[]` when `isAppSubdomain` is `true`
  - On marketing subdomain: return entries for `/` and `/waitlist` with `lastModified: new Date()`, correct `changeFrequency`, `priority`, and `alternates.languages` using `buildAlternateUrls`
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 11.1 Write unit test for sitemap excludes app subdomain
    - **Property 4: Sitemap excludes app subdomain**
    - **Validates: Requirements 6.8**
    - Mock `getSeoContext` to return `isAppSubdomain: true`; assert returned array is empty

  - [x] 11.2 Write property test for sitemap contains both locales
    - **Property 5: Sitemap contains both locales for every marketing page**
    - **Validates: Requirements 6.2, 6.7**
    - For each entry in the sitemap result, assert `alternates.languages.en` and `alternates.languages.fr` are non-empty strings

- [x] 12. Implement `app/robots.ts`
  - Export a `MetadataRoute.Robots` default function
  - Call `getSeoContext()`; when `isAppSubdomain` return `{ rules: [{ userAgent: '*', disallow: '/' }] }` with no `sitemap` field
  - On marketing subdomain: return full `rules` with `allow: '/'` and all required `disallow` paths, plus `sitemap: \`${marketingUrl}/sitemap.xml\``
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 12.1 Write property test for robots subdomain dispatch
    - **Property 10: Robots subdomain dispatch**
    - **Validates: Requirements 7.4, 7.5, 7.6, 7.7**
    - Parameterize over `fc.constantFrom('gatectr.com', 'app.gatectr.com', 'app.staging.gatectr.com')`
    - Assert app hosts produce `Disallow: /` with no `sitemap`; marketing hosts produce a `sitemap` directive

- [x] 13. Checkpoint — Ensure sitemap and robots tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement `app/api/og/route.tsx` — dynamic OG image endpoint
  - Create `GET /api/og` route handler using `ImageResponse` from `next/og`
  - Read `title` and `description` query params; fall back to defaults when absent
  - Render GateCtr brand layout: dark background `#0a0a0a`, cyan accent `#00d4ff`, white text, Syne bold font for title
  - Set dimensions 1200×630
  - Set `Cache-Control: public, max-age=86400, immutable` response header
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 14.1 Write property test for OG image dimensions invariant
    - **Property 6: OG image dimensions invariant**
    - **Validates: Requirements 10.5**
    - Use `fc.string()` for title and description arbitraries
    - Assert response status is 200 and `content-type` starts with `image/`

- [x] 15. Update `app/manifest.json` and root layout PWA metadata
  - Update `app/manifest.json`: fix `name` typo (`"GateCtrl"` → `"GateCtr"`), set all required fields (`short_name`, `description`, `start_url`, `display`, `orientation`, `theme_color`, `background_color`, `categories`, `icons` at 192×192 and 512×512)
  - Update `app/layout.tsx` root metadata export: add `themeColor` array (dark/light media queries), `appleWebApp: { capable: true, statusBarStyle: 'default', title: 'GateCtr' }`, `manifest: '/manifest.json'`, explicit `viewport`
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 16. Add `NEXT_PUBLIC_MARKETING_URL` to environment variable files
  - Add `NEXT_PUBLIC_MARKETING_URL="https://gatectr.com"` to `.env.example` and `.env.local.example`
  - Verify `NEXT_PUBLIC_APP_URL` is present in both files
  - _Requirements: 3.5, 3.6, 11.4_

- [x] 17. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use **fast-check** with Vitest (`fc.assert` / `fc.property`)
- Unit tests live in `tests/unit/`, property tests in `tests/property/`
- `getSeoContextWithHost(host)` is the testable overload — it bypasses `next/headers` for pure unit testing
- The waitlist page refactor (task 4) is required because `generateMetadata` cannot be exported from a `'use client'` module
