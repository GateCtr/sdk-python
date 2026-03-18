# GateCtr — Integrations

GateCtr s'intègre avec l'écosystème existant de chaque équipe. Que vous utilisiez des outils no-code, des pipelines d'entreprise ou des stacks custom, GateCtr dispose d'un connecteur natif ou d'une intégration webhook universelle.

## Catalogue d'intégrations

| Catégorie      | Outils / Plateformes            | Type d'intégration   | Bénéfice                                |
| -------------- | ------------------------------- | -------------------- | --------------------------------------- |
| Notifications  | Slack, Microsoft Teams, Discord | Webhook natif        | Alertes budget, rapports quotidiens     |
| Email          | SendGrid, Resend, Mailgun       | SMTP / API           | Notifications utilisateur, factures     |
| BI & Analytics | Metabase, Tableau, Power BI     | Webhook + CSV export | Dashboards consommation tokens          |
| ERP / CRM      | Salesforce, HubSpot, Notion     | REST API / Webhook   | Attribution coût IA par client/deal     |
| No-Code        | Zapier, Make (Integromat), n8n  | Webhook universel    | Automatisation workflows IA sans code   |
| Dev Tools      | VS Code, Cursor, GitHub Copilot | Extension / SDK      | Contrôle tokens directement dans l'IDE  |
| Agent IA       | LangChain, LlamaIndex, AutoGPT  | SDK Python/JS natif  | Routage et budget pour agents autonomes |
| Low-Code       | Bolt.new, Lovable, Replit       | SDK + API REST       | Centralisation LLM pour apps générées   |
| Auth           | Clerk, Auth0, NextAuth          | JWT / OAuth 2.0      | Authentification et gestion des rôles   |
| Monitoring     | Sentry, Datadog, New Relic      | SDK / Webhook        | Erreurs LLM, latences, alertes ops      |
| Data Pipeline  | Airbyte, Fivetran, dbt          | REST + CSV export    | Export logs vers data warehouse         |

## Intégration universelle

Tout outil acceptant des webhooks HTTP POST peut s'intégrer avec GateCtr.

- Payload JSON standardisé
- Signature HMAC-SHA256 pour la sécurité
- Retry automatique en cas d'échec

```json
{
  "event": "budget.alert",
  "project_id": "proj_123",
  "timestamp": "2025-03-16T10:00:00Z",
  "data": {
    "tokens_used": 45000,
    "tokens_limit": 50000,
    "percent": 90,
    "cost_usd": 1.35
  }
}
```

## Diagramme d'intégration enterprise

```
Source                  Via GateCtr                     Destination
─────────────────       ────────────────────────        ──────────────────────
App SaaS             →  ┌─────────────────────┐  →     OpenAI
Agent IA             →  │  Context Optimizer  │  →     Anthropic
Dev IDE              →  │  Budget Firewall    │  →     Mistral
No-code builder      →  │  Model Router       │  →     Gemini
                        │  Analytics          │  →     Groq
                        └─────────────────────┘
```

## Règles pour le copy lié aux intégrations

- Toujours mentionner le type d'intégration (natif vs webhook) — les devs veulent savoir si c'est du travail ou pas
- Pour les intégrations no-code : insister sur "sans code" et "en quelques minutes"
- Pour les intégrations enterprise (ERP, BI) : insister sur la conformité et l'attribution des coûts
- Pour les agents IA : insister sur le contrôle et la sécurité (budget caps, fallback)
- Ne jamais promettre une intégration non encore disponible — utiliser "via webhook universel" pour les cas non natifs

## Messaging par type d'intégration

| Type                 | Message clé EN                                        | Message clé FR                                                 |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| Slack / Teams        | "Budget alerts where your team already lives."        | "Alertes budget là où votre équipe travaille déjà."            |
| LangChain / AutoGPT  | "Agents don't run forever. GateCtr caps them."        | "Les agents ne tournent pas indéfiniment. GateCtr les limite." |
| Zapier / Make        | "No code. No engineer. Just connect."                 | "Sans code. Sans dev. Connectez simplement."                   |
| Salesforce / HubSpot | "Know your AI cost per deal. Per client."             | "Connaissez votre coût IA par deal. Par client."               |
| Sentry / Datadog     | "LLM errors and latency in your existing monitoring." | "Erreurs LLM et latences dans votre monitoring existant."      |
