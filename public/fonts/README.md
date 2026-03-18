# Polices GateCtr

## Polices requises

### 1. Syne (Display / Titres)

**Usage** : Titres H1, hero sections, logo wordmark

**Téléchargement** :

1. Allez sur [Google Fonts - Syne](https://fonts.google.com/specimen/Syne)
2. Sélectionnez les poids : Bold (700), Extra Bold (800)
3. Téléchargez et convertissez en WOFF2

**Fichiers nécessaires** :

- `Syne-Bold.woff2` (700)
- `Syne-ExtraBold.woff2` (800)

### 2. JetBrains Mono (Interface / Code)

**Usage** : Code, dashboards, données techniques

**Téléchargement** :

- Déjà inclus via Google Fonts dans `app/layout.tsx`
- Aucun fichier local nécessaire

### 3. Inter (Corps de texte)

**Usage** : Paragraphes, descriptions, labels UI

**Téléchargement** :

- Déjà inclus via Google Fonts dans `app/layout.tsx`
- Aucun fichier local nécessaire

## Alternative : Utiliser Google Fonts pour Syne

Si vous préférez ne pas télécharger les polices localement, vous pouvez utiliser Google Fonts :

```typescript
// app/layout.tsx
import { Inter, JetBrains_Mono, Syne } from "next/font/google";

const syne = Syne({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
  display: "swap",
});
```

## Structure des fichiers

```
public/fonts/
├── README.md (ce fichier)
├── Syne-Bold.woff2
└── Syne-ExtraBold.woff2
```

## Conversion en WOFF2

Si vous avez des fichiers TTF ou OTF, convertissez-les en WOFF2 :

1. Utilisez [CloudConvert](https://cloudconvert.com/ttf-to-woff2)
2. Ou utilisez [Font Squirrel Webfont Generator](https://www.fontsquirrel.com/tools/webfont-generator)

## Fallback

Si les polices ne se chargent pas, le système utilisera automatiquement :

- Helvetica Neue
- system-ui
- Sans-serif par défaut du navigateur
