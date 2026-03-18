# Internationalization (i18n) Setup

## Overview

GateCtr uses `next-intl` for internationalization with a modular message structure organized by feature/page.

## Supported Languages

- English (`en`) - Default
- French (`fr`)

## Structure

```
messages/
├── en/
│   ├── common.json      # Shared translations (nav, footer, actions)
│   ├── waitlist.json    # Waitlist page translations
│   ├── admin.json       # Admin panel translations
│   └── ...              # Add more as needed
└── fr/
    ├── common.json
    ├── waitlist.json
    ├── admin.json
    └── ...
```

## Configuration Files

### `i18n/routing.ts`

Defines available locales, default locale, and routing configuration.

### `i18n/request.ts`

Loads message files for the requested locale. Automatically imports all JSON files from the locale folder.

### `next.config.ts`

Configured with `next-intl` plugin for proper routing and locale detection.

## Usage

### In Server Components

```typescript
import { useTranslations } from 'next-intl';

export default function WaitlistPage() {
  const t = useTranslations('waitlist.page');

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
    </div>
  );
}
```

### In Client Components

```typescript
'use client';

import { useTranslations } from 'next-intl';

export default function WaitlistForm() {
  const t = useTranslations('waitlist.form');

  return (
    <form>
      <label>{t('email.label')}</label>
      <input placeholder={t('email.placeholder')} />
    </form>
  );
}
```

### With Parameters

```typescript
const t = useTranslations('waitlist.success');

// messages/en/waitlist.json: "message": "You're #{position} in line"
<p>{t('message', { position: 42 })}</p>
// Output: "You're #42 in line"
```

### With Rich Text

```typescript
const t = useTranslations('common.footer');

// messages/en/common.json: "copyright": "© {year} GateCtr. All rights reserved."
<p>{t('copyright', { year: new Date().getFullYear() })}</p>
```

## Routing

### Automatic Locale Detection

The middleware automatically detects the user's preferred language from:

1. URL path (`/fr/waitlist`)
2. Cookie (`NEXT_LOCALE`)
3. `Accept-Language` header
4. Default locale (`en`)

### URL Structure

- **English (default)**: `/` → No locale prefix
  - `/waitlist` → English waitlist
  - `/dashboard` → English dashboard
- **French**: `/fr/` → With locale prefix
  - `/fr/waitlist` → French waitlist
  - `/fr/dashboard` → French dashboard
- **API routes**: `/api/*` → Not localized

This approach provides cleaner URLs for the primary language while maintaining clear locale identification for other languages.

### Link Component

Use the `Link` component from `i18n/routing` for automatic locale prefixing:

```typescript
import { Link } from '@/i18n/routing';

<Link href="/waitlist">Join Waitlist</Link>
// Renders: /en/waitlist or /fr/waitlist based on current locale
```

### Programmatic Navigation

```typescript
import { useRouter } from "@/i18n/routing";

const router = useRouter();
router.push("/waitlist"); // Automatically adds locale prefix
```

### Language Switcher

```typescript
'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/routing';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (newLocale: 'en' | 'fr') => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <select value={locale} onChange={(e) => switchLocale(e.target.value as 'en' | 'fr')}>
      <option value="en">English</option>
      <option value="fr">Français</option>
    </select>
  );
}
```

## Adding New Translations

### 1. Create Message Files

Create matching JSON files in both `messages/en/` and `messages/fr/`:

```bash
# Example: Adding dashboard translations
messages/en/dashboard.json
messages/fr/dashboard.json
```

### 2. Update i18n/request.ts

Add the new message file to the imports:

```typescript
const messages = {
  common: (await import(`../messages/${locale}/common.json`)).default,
  waitlist: (await import(`../messages/${locale}/waitlist.json`)).default,
  admin: (await import(`../messages/${locale}/admin.json`)).default,
  dashboard: (await import(`../messages/${locale}/dashboard.json`)).default, // Add this
};
```

### 3. Use in Components

```typescript
const t = useTranslations('dashboard');
<h1>{t('title')}</h1>
```

## Message File Organization

### Common Pattern

```json
{
  "section": {
    "subsection": {
      "key": "value"
    }
  }
}
```

### Example: Form with Validation

```json
{
  "form": {
    "email": {
      "label": "Email",
      "placeholder": "you@company.com",
      "required": "Email is required",
      "invalid": "Please enter a valid email"
    }
  }
}
```

Usage:

```typescript
const t = useTranslations('waitlist.form.email');
<label>{t('label')}</label>
<input placeholder={t('placeholder')} />
{error && <span>{t('required')}</span>}
```

## Best Practices

1. **Modular Files**: Keep translations organized by feature/page
2. **Nested Keys**: Use dot notation for logical grouping
3. **Consistent Naming**: Use same structure across all locales
4. **Parameters**: Use `{param}` for dynamic values
5. **Pluralization**: Use `next-intl`'s built-in plural support
6. **Type Safety**: Consider generating TypeScript types from messages

## API Routes

API routes are NOT localized. They remain at `/api/*` without locale prefix.

## Static Pages

For static pages that need localization, ensure they're inside the `[locale]` folder:

```
app/
└── [locale]/
    ├── page.tsx           # Homepage
    ├── waitlist/
    │   └── page.tsx       # Waitlist page
    └── about/
        └── page.tsx       # About page
```

## Testing

Test both locales:

```bash
# English
http://localhost:3000/en/waitlist

# French
http://localhost:3000/fr/waitlist
```

## Environment Variables

No additional environment variables required. Locale detection works automatically.

## Production Deployment

Ensure all message files are included in the build:

```bash
pnpm build
```

The build process will validate that all message keys exist in all locales.

## Troubleshooting

### Missing Translation Key

If a key is missing, `next-intl` will show the key path in development:

```
waitlist.form.email.label
```

Add the missing key to the appropriate message file.

### Locale Not Detected

Check:

1. Middleware is properly configured
2. Browser language settings
3. Cookie `NEXT_LOCALE` value

### Type Errors

Ensure all message files have matching structure across locales.
