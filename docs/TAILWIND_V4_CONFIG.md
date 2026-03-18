# Configuration Tailwind CSS 4 avec shadcn/ui

## Vue d'ensemble

GateCtr utilise Tailwind CSS 4 avec une approche CSS-first, sans fichier `tailwind.config.js`. Toute la configuration se fait via CSS natif dans `app/globals.css`.

## Structure de configuration

### 1. Import de Tailwind

```css
@import "tailwindcss";
```

Cette directive unique remplace l'ancien système de `@tailwind base`, `@tailwind components`, etc.

### 2. Variables CSS dans `:root`

Les variables CSS sont définies dans `:root` pour les valeurs de base et shadcn/ui:

```css
:root {
  /* Couleurs de base GateCtr */
  --color-navy: #1b4f82;
  --color-cyan: #00b4c8;

  /* Variables shadcn/ui */
  --background: #ffffff;
  --foreground: #4a5568;
  --primary: #1b4f82;
  --secondary: #00b4c8;
  --border: #e2e8f0;
  --ring: #00b4c8;
  --radius: 0.5rem;
  /* ... */
}
```

### 3. Directive `@theme`

La directive `@theme` enregistre les variables CSS avec Tailwind pour les rendre disponibles comme classes utilitaires:

```css
@theme {
  /* Couleurs shadcn/ui - préfixe --color- requis */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);

  /* Échelles de couleurs personnalisées */
  --color-primary-50: #e8eef5;
  --color-primary-500: #1b4f82;
  --color-primary-900: #0a2340;

  /* Border radius */
  --radius-sm: calc(var(--radius) - 4px);
  --radius-lg: var(--radius);

  /* Animations Radix UI */
  --animate-accordion-down: accordion-down 0.2s ease-out;

  @keyframes accordion-down {
    from {
      height: 0;
    }
    to {
      height: var(--radix-accordion-content-height);
    }
  }
}
```

## Règles importantes

### Préfixes requis dans `@theme`

Tailwind CSS 4 nécessite des préfixes spécifiques dans `@theme`:

- **Couleurs**: `--color-*` (ex: `--color-primary`, `--color-background`)
- **Fonts**: `--font-*` (ex: `--font-display`, `--font-body`)
- **Radius**: `--radius-*` (ex: `--radius-sm`, `--radius-lg`)
- **Animations**: `--animate-*` (ex: `--animate-accordion-down`)
- **Spacing**: `--spacing-*` (optionnel)
- **Text sizes**: `--text-*` (ex: `--text-xl`, `--text-2xl`)

### Utilisation dans les composants

Une fois enregistrées dans `@theme`, les variables deviennent des classes Tailwind:

```tsx
// Variables CSS définies
--color-primary: var(--primary);
--color-secondary: var(--secondary);

// Utilisables comme classes Tailwind
<button className="bg-primary text-primary-foreground">
  Primary Button
</button>

<div className="bg-secondary hover:bg-secondary-600">
  Secondary Element
</div>
```

## Configuration PostCSS

Le fichier `postcss.config.mjs` utilise le plugin Tailwind CSS 4:

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

## Dark Mode

Le dark mode est géré via `@media (prefers-color-scheme: dark)`:

```css
:root {
  --background: #ffffff;
  --foreground: #4a5568;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #14406a;
    --foreground: #edf2f7;
  }
}
```

Les variables dans `@theme` référencent automatiquement les bonnes valeurs selon le mode.

## Palette de couleurs GateCtr

### Couleurs principales

| Couleur    | Variable              | Hex     | Usage                     |
| ---------- | --------------------- | ------- | ------------------------- |
| Navy       | `--color-primary`     | #1B4F82 | Boutons primaires, titres |
| Navy Deep  | `--color-primary-700` | #14406A | Sidebar, headers dark     |
| Cyan       | `--color-secondary`   | #00B4C8 | CTA, accents, icônes      |
| Cyan Light | `--color-accent`      | #00D4E8 | Hover states, badges      |
| Grey Dark  | `--color-grey-600`    | #4A5568 | Texte principal           |
| Grey Light | `--color-grey-100`    | #EDF2F7 | Backgrounds secondaires   |

### Échelles complètes

Chaque couleur dispose d'une échelle de 50 à 950:

```css
--color-primary-50: #e8eef5; /* Très clair */
--color-primary-500: #1b4f82; /* Base */
--color-primary-900: #0a2340; /* Très foncé */
```

## Composants shadcn/ui

Les composants shadcn/ui utilisent automatiquement les variables définies:

```tsx
import { Button } from "@/components/ui/button";

// Utilise --color-primary
<Button variant="default">Primary</Button>

// Utilise --color-secondary
<Button variant="secondary">Secondary</Button>

// Utilise --color-destructive
<Button variant="destructive">Delete</Button>
```

## Installation de nouveaux composants

### Méthode manuelle (recommandée pour Tailwind v4)

1. Copier le code du composant depuis [ui.shadcn.com](https://ui.shadcn.com)
2. Créer le fichier dans `components/ui/`
3. Installer les dépendances Radix UI nécessaires

```bash
# Exemple pour le composant Switch
pnpm add @radix-ui/react-switch
```

### CLI shadcn (en attente de support v4)

Le CLI shadcn sera mis à jour pour supporter Tailwind CSS 4. En attendant, utilisez la méthode manuelle.

## Animations Radix UI

Les animations pour les composants Radix UI (Accordion, Collapsible, etc.) sont définies dans `@theme`:

```css
@theme {
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;

  @keyframes accordion-down {
    from {
      height: 0;
    }
    to {
      height: var(--radix-accordion-content-height);
    }
  }

  @keyframes accordion-up {
    from {
      height: var(--radix-accordion-content-height);
    }
    to {
      height: 0;
    }
  }
}
```

Utilisables dans les composants:

```tsx
<div className="animate-accordion-down">...</div>
```

## Typographie

Les polices sont configurées dans `@theme` et `app/layout.tsx`:

```css
@theme {
  --font-display: var(--font-display), "Helvetica Neue", system-ui, sans-serif;
  --font-body: var(--font-body), "Helvetica Neue", system-ui, sans-serif;
  --font-mono: var(--font-mono), "Courier New", monospace;
}
```

```tsx
// app/layout.tsx
import { Syne, Inter, JetBrains_Mono } from "next/font/google";

const syne = Syne({ subsets: ["latin"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});
```

## Ressources

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Article: Using Shadcn UI with Tailwind v4](https://www.luisball.com/blog/shadcn-ui-with-tailwind-v4)
- [GateCtr Design System](./DESIGN_SYSTEM.md)

## Troubleshooting

### Warning: Unknown at rule @theme

Ce warning est normal et peut être ignoré. C'est une directive Tailwind CSS 4 que certains linters ne reconnaissent pas encore.

### Les couleurs ne s'appliquent pas

Vérifiez que:

1. Les variables dans `@theme` ont le préfixe `--color-`
2. Les variables référencent bien celles définies dans `:root`
3. PostCSS est correctement configuré avec `@tailwindcss/postcss`

### Dark mode ne fonctionne pas

Assurez-vous que:

1. Les variables sont redéfinies dans `@media (prefers-color-scheme: dark)`
2. Les variables dans `@theme` utilisent `var()` pour référencer les valeurs de `:root`
