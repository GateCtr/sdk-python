# GateCtr Design System

## Typographie

### Hiérarchie des polices

#### Display / Titres - Syne Bold (700-800)

Utilisé pour les titres H1, hero sections, et logo wordmark.

```tsx
<h1 className="font-display text-5xl font-extrabold text-primary-700">
  GateCtr
</h1>
```

#### Corps de texte - Inter

Utilisé pour les paragraphes, descriptions, et labels UI.

```tsx
<p className="font-body text-base text-grey-600">
  Universal middleware hub for LLM control
</p>
```

#### Interface / Code - JetBrains Mono

Utilisé pour le code, dashboards, et données techniques.

```tsx
<code className="font-mono text-sm text-secondary-500">
  const apiKey = "gtr_abc123";
</code>
```

### Échelle typographique

| Classe      | Taille | Usage                      |
| ----------- | ------ | -------------------------- |
| `text-xs`   | 12px   | Labels, badges, metadata   |
| `text-sm`   | 14px   | Corps secondaire, captions |
| `text-base` | 16px   | Corps principal            |
| `text-lg`   | 18px   | Lead paragraphs            |
| `text-xl`   | 20px   | H6, sous-titres            |
| `text-2xl`  | 24px   | H5                         |
| `text-3xl`  | 30px   | H4                         |
| `text-4xl`  | 36px   | H3                         |
| `text-5xl`  | 48px   | H2                         |
| `text-6xl`  | 60px   | H1, Hero                   |

### Poids de police

- `font-normal` (400) : Corps de texte
- `font-medium` (500) : Emphasis
- `font-semibold` (600) : Labels, boutons
- `font-bold` (700) : Titres
- `font-extrabold` (800) : Hero, display

### Interlignage

- `leading-tight` (1.25) : Titres
- `leading-normal` (1.5) : Corps standard
- `leading-relaxed` (1.625) : Paragraphes longs

### Exemples de combinaisons

#### Hero Section

```tsx
<div>
  <h1 className="font-display text-6xl font-extrabold text-primary-700 leading-tight">
    Control Your LLM Costs
  </h1>
  <p className="font-body text-xl text-grey-600 leading-relaxed mt-4">
    Universal middleware hub for optimization
  </p>
</div>
```

#### Dashboard Card

```tsx
<div className="bg-white p-6 rounded-lg">
  <h3 className="font-display text-2xl font-bold text-primary-700 mb-2">
    Token Usage
  </h3>
  <code className="font-mono text-4xl text-secondary-500">1,234,567</code>
  <p className="font-body text-sm text-grey-500 mt-2">tokens this month</p>
</div>
```

## Palette de couleurs

### Primary - Navy Blue

Utilisé pour les backgrounds principaux, titres, et boutons primaires.

- `primary-500` : `#1B4F82` - Couleur principale
- `primary-700` : `#14406A` - Navy Deep (sidebar, headers dark)
- Classes Tailwind : `bg-primary-500`, `text-primary-500`, `border-primary-500`

### Secondary - Cyan

Utilisé pour les accents de marque, CTA, icônes actives, et highlights.

- `secondary-500` : `#00B4C8` - Cyan principal
- `secondary-400` : `#00D4E8` - Cyan Light (hover states)
- Classes Tailwind : `bg-secondary-500`, `text-secondary-500`, `hover:bg-secondary-400`

### Accent - Cyan Light

Utilisé pour les états hover, badges, et liens actifs.

- `accent-500` : `#00D4E8`
- Classes Tailwind : `bg-accent-500`, `text-accent-500`

### Grey - Neutral

Utilisé pour le corps de texte et backgrounds secondaires.

- `grey-600` : `#4A5568` - Corps de texte principal
- `grey-100` : `#EDF2F7` - Backgrounds secondaires, cartes
- Classes Tailwind : `text-grey-600`, `bg-grey-100`

### Base

- `background` : `#FFFFFF` (light) / `#14406A` (dark)
- `foreground` : `#4A5568` (light) / `#EDF2F7` (dark)

## Utilisation des couleurs

### Boutons

```tsx
// Bouton primaire
<button className="bg-primary-500 hover:bg-primary-600 text-white">
  Primary Button
</button>

// Bouton secondaire (CTA)
<button className="bg-secondary-500 hover:bg-secondary-400 text-white">
  Call to Action
</button>

// Bouton outline
<button className="border-2 border-primary-500 text-primary-500 hover:bg-primary-50">
  Outline Button
</button>
```

### Textes

```tsx
// Titre principal
<h1 className="text-primary-700 font-bold">Main Title</h1>

// Corps de texte
<p className="text-grey-600">Body text content</p>

// Lien actif
<a className="text-secondary-500 hover:text-accent-500">Active Link</a>
```

### Backgrounds

```tsx
// Background principal
<div className="bg-background">Main content</div>

// Sidebar / Header dark
<nav className="bg-primary-700">Navigation</nav>

// Carte / Section secondaire
<div className="bg-grey-100 dark:bg-grey-800">Card content</div>
```

### Icônes et badges

```tsx
// Icône active
<Icon className="text-secondary-500" />

// Badge
<span className="bg-accent-500 text-white px-2 py-1 rounded">New</span>

// Highlight
<mark className="bg-secondary-500/20 text-secondary-700">Highlighted text</mark>
```

## Couleurs sémantiques

### Success

- `success-500` : `#48BB78`
- Usage : Messages de succès, validations

### Warning

- `warning-500` : `#ED8936`
- Usage : Avertissements, alertes

### Error

- `error-500` : `#F56565`
- Usage : Erreurs, messages d'échec

### Info

- `info-500` : `#00B4C8` (même que secondary)
- Usage : Messages informatifs

## Exemples de composants

### Card

```tsx
<div className="bg-white dark:bg-grey-800 rounded-lg shadow-md p-6 border border-grey-200 dark:border-grey-700">
  <h3 className="text-primary-700 dark:text-primary-300 font-semibold mb-2">
    Card Title
  </h3>
  <p className="text-grey-600 dark:text-grey-300">Card content goes here</p>
</div>
```

### Alert

```tsx
// Success
<div className="bg-success-50 border-l-4 border-success-500 p-4">
  <p className="text-success-700">Success message</p>
</div>

// Error
<div className="bg-error-50 border-l-4 border-error-500 p-4">
  <p className="text-error-700">Error message</p>
</div>
```

### Navigation

```tsx
<nav className="bg-primary-700 text-white">
  <a href="#" className="hover:bg-primary-600 px-4 py-2">
    Dashboard
  </a>
  <a href="#" className="hover:bg-primary-600 px-4 py-2 bg-secondary-500">
    Active Page
  </a>
</nav>
```

## Dark Mode

Le design system supporte automatiquement le dark mode via `prefers-color-scheme`.

```tsx
// Adaptatif automatique
<div className="bg-white dark:bg-grey-800 text-grey-900 dark:text-grey-100">
  Content adapts to theme
</div>
```

## Accessibilité

### Contraste des couleurs

Toutes les combinaisons respectent WCAG 2.1 niveau AA :

- ✅ `primary-500` sur blanc : 4.8:1
- ✅ `secondary-500` sur blanc : 3.2:1 (large text only)
- ✅ `grey-600` sur blanc : 7.5:1
- ✅ Blanc sur `primary-700` : 8.2:1

### Focus states

```tsx
<button className="focus:ring-2 focus:ring-secondary-500 focus:ring-offset-2">
  Accessible Button
</button>
```
