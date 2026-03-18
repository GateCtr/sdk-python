# GateCtr — Pricing & Plans

## Modèle SaaS hybride

GateCtr adopte un modèle SaaS hybride. L'utilisateur paye directement son provider LLM — GateCtr monétise la valeur ajoutée (optimisation, contrôle, analytics), pas les tokens eux-mêmes.

> GateCtr ne prend aucune commission sur les tokens. Vous payez directement OpenAI, Anthropic, etc. avec votre propre clé API. GateCtr facture uniquement la valeur ajoutée de sa plateforme.

## Plans

### Free — €0/mois

- Jusqu'à 50K tokens/mois
- 1 projet
- Analytics de base
- 1 webhook
- API REST + SDK
- Docs & support communauté

### Pro — €29/mois

- Jusqu'à 2M tokens/mois
- 5 projets
- Analytics avancées
- Webhooks illimités
- Context Optimizer actif
- Model Router basique
- Support email

### Team — €99/mois

- Jusqu'à 10M tokens/mois
- Projets illimités
- RBAC multi-utilisateurs
- Dashboard équipe
- Audit logs 90 jours
- Model Router avancé
- Support prioritaire

### Enterprise — Custom (sur devis)

- Tokens illimités
- SLA garanti 99.9%
- Déploiement dédié / on-prem
- SSO / SAML
- Audit logs illimités
- Intégrations ERP/BI
- Customer success manager

## Hiérarchie des plans

`Free` < `Pro` < `Team` < `Enterprise`

- Les features Free sont disponibles sur tous les plans
- Les features Pro nécessitent Pro ou supérieur
- Les features Team nécessitent Team ou supérieur
- Enterprise est exclusif au plan Enterprise

## Modèles de facturation complémentaires

| Modèle                | Description                                                       | Segment cible |
| --------------------- | ----------------------------------------------------------------- | ------------- |
| Abonnement mensuel    | Accès plateforme selon plan choisi                                | Tous segments |
| Usage-based add-on    | Facturation par tranche de 10M tokens routés au-delà du plan      | Pro & Team    |
| Savings sharing       | Option premium : % des économies tokens réalisées via l'optimizer | Enterprise    |
| Seats supplémentaires | €15/user/mois pour les membres additionnels                       | Team          |
| Onboarding premium    | Session de setup et intégration par notre équipe technique        | Enterprise    |

## Règles pour le copy lié au pricing

- Toujours rappeler que GateCtr ne facture PAS les tokens — c'est un différenciateur clé
- Le plan Free est le principal levier d'acquisition — mettre en avant Budget Firewall + Analytics
- Upsell Pro : déclenché quand un user Free atteint sa limite → mettre en avant Context Optimizer + Model Router
- Upsell Team : déclenché quand un user Pro ajoute un second utilisateur → mettre en avant RBAC + Audit Logs
- Upsell Enterprise : déclenché par besoin on-prem ou 50+ users
- Ne jamais afficher "Gratuit pour toujours" — utiliser "Plan gratuit" ou "Démarrer gratuitement"
- Toujours afficher le prix HT avec mention "sur devis" pour Enterprise

## Messaging pricing par contexte

| Contexte              | EN                                                 | FR                                                         |
| --------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| Hero / CTA            | "Start free — No card needed"                      | "Démarrer — Sans carte requise"                            |
| Pricing page headline | "Pay for control. Not for tokens."                 | "Payez pour le contrôle. Pas pour les tokens."             |
| Free plan             | "Everything you need to start. $0."                | "Tout ce qu'il faut pour démarrer. 0 €."                   |
| Pro upsell            | "Upgrade to Pro — save 40% on tokens"              | "Passer à Pro — économisez 40% sur les tokens"             |
| Enterprise            | "Book a demo"                                      | "Réserver une démo"                                        |
| Billing philosophy    | "You pay OpenAI. We charge for the control layer." | "Vous payez OpenAI. Nous facturons la couche de contrôle." |

## Données de référence (source: config/product.ts)

| Plan       | Prix      | Token limit | Projets   | Webhooks  |
| ---------- | --------- | ----------- | --------- | --------- |
| Free       | €0        | 50K/mois    | 1         | 1         |
| Pro        | €29/mois  | 2M/mois     | 5         | Illimités |
| Team       | €99/mois  | 10M/mois    | Illimités | Illimités |
| Enterprise | Sur devis | Illimités   | Illimités | Illimités |

Ces valeurs sont la source de vérité — toujours les lire depuis `config/product.ts` dans le code.
