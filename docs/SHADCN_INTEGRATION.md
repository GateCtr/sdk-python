# Intégration shadcn/ui avec le branding GateCtr

## Configuration

Les composants shadcn/ui héritent automatiquement du branding GateCtr grâce aux variables CSS sémantiques définies dans `app/globals.css`.

## Variables CSS disponibles

### Couleurs sémantiques

```css
--background         /* Fond principal */
--foreground         /* Texte principal */
--card              /* Fond des cartes */
--card-foreground   /* Texte des cartes */
--popover           /* Fond des popovers */
--popover-foreground /* Texte des popovers */
--primary           /* Couleur primaire (Navy #1B4F82) */
--primary-foreground /* Texte sur primary */
--secondary         /* Couleur secondaire (Cyan #00B4C8) */
--secondary-foreground /* Texte sur secondary */
--muted             /* Couleur atténuée */
--muted-foreground  /* Texte atténué */
--accent            /* Couleur d'accent (Cyan Light #00D4E8) */
--accent-foreground /* Texte sur accent */
--destructive       /* Couleur destructive (rouge) */
--destructive-foreground /* Texte sur destructive */
--border            /* Couleur des bordures */
--input             /* Couleur des inputs */
--ring              /* Couleur du focus ring */
```

## Classes Tailwind disponibles

### Couleurs de base

```tsx
// Background
<div className="bg-background text-foreground">...</div>

// Card
<div className="bg-card text-card-foreground">...</div>

// Primary (Navy)
<button className="bg-primary text-primary-foreground">...</button>

// Secondary (Cyan)
<button className="bg-secondary text-secondary-foreground">...</button>

// Accent (Cyan Light)
<div className="bg-accent text-accent-foreground">...</div>

// Muted
<div className="bg-muted text-muted-foreground">...</div>
```

### Bordures et focus

```tsx
// Bordure
<div className="border border-border">...</div>

// Input
<input className="border-input bg-background">...</input>

// Focus ring
<button className="focus:ring-2 focus:ring-ring">...</button>
```

## Exemples de composants shadcn/ui

### Button

```tsx
import { Button } from "@/components/ui/button";

// Variant primary (Navy)
<Button variant="default">Primary Button</Button>

// Variant secondary (Cyan)
<Button variant="secondary">Secondary Button</Button>

// Variant destructive
<Button variant="destructive">Delete</Button>

// Variant outline
<Button variant="outline">Outline</Button>

// Variant ghost
<Button variant="ghost">Ghost</Button>
```

### Card

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>Card content</CardContent>
</Card>;
```

### Input

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

<div>
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    placeholder="you@example.com"
    className="focus:ring-secondary"
  />
</div>;
```

### Badge

```tsx
import { Badge } from "@/components/ui/badge";

// Default (Primary)
<Badge>Default</Badge>

// Secondary (Cyan)
<Badge variant="secondary">Secondary</Badge>

// Destructive
<Badge variant="destructive">Error</Badge>

// Outline
<Badge variant="outline">Outline</Badge>
```

### Alert

```tsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Info (Secondary color)
<Alert>
  <AlertTitle>Info</AlertTitle>
  <AlertDescription>This is an info message</AlertDescription>
</Alert>

// Destructive
<Alert variant="destructive">
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>This is an error message</AlertDescription>
</Alert>
```

## Installation de composants shadcn/ui

Pour ajouter un composant shadcn/ui :

```bash
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add badge
npx shadcn@latest add alert
```

Les composants seront automatiquement créés dans `components/ui/` et utiliseront les variables CSS du branding GateCtr.

## Personnalisation avancée

### Modifier les couleurs d'un composant

```tsx
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

<Button
  className={cn(
    "bg-secondary-500 hover:bg-secondary-400",
    "text-white font-semibold",
  )}
>
  Custom Button
</Button>;
```

### Créer une variante personnalisée

```tsx
// components/ui/button.tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/90",
        // Ajouter une variante custom
        cyan: "bg-secondary-500 text-white hover:bg-secondary-400",
      },
    },
  },
);
```

## Dark Mode

Les composants shadcn/ui s'adaptent automatiquement au dark mode grâce aux variables CSS définies dans `@media (prefers-color-scheme: dark)`.

```tsx
// Fonctionne automatiquement
<Card>
  <CardContent>Ce contenu s'adapte au dark mode</CardContent>
</Card>
```

## Accessibilité

Tous les composants shadcn/ui respectent les standards WCAG 2.1 AA :

- Focus visible avec `ring-ring`
- Contraste suffisant entre texte et fond
- Support clavier complet
- ARIA attributes appropriés

## Ressources

- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [GateCtr Design System](./DESIGN_SYSTEM.md)
