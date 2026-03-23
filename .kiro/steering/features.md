---
inclusion: always
---

# GateCtr — Features & Roadmap

## Available Features

| Feature           | Min. plan | Description                               |
| ----------------- | --------- | ----------------------------------------- |
| Context Optimizer | Pro       | Automatic prompt compression              |
| Model Router      | Pro       | Semantic routing — picks the optimal model based on request complexity and cost/latency scoring |
| Budget Firewall   | Free      | Token and budget limits per project       |
| Webhooks Engine   | Pro       | Slack, Teams, Email, URL notifications    |
| Usage Dashboard   | Free      | Real-time analytics (tokens, cost, model) |
| RBAC Multi-user   | Team      | Roles: Admin / Manager / Dev / Viewer     |
| Audit Logs        | Team      | Full history — 90 days retention          |

## Roadmap

| Feature            | Target  | Min. plan  | Description                                |
| ------------------ | ------- | ---------- | ------------------------------------------ |
| A/B Prompt Testing | Q1 2027 | Pro        | Comparative prompt testing on live traffic |
| LLM Cache Layer    | Q1 2027 | Pro        | Semantic cache for identical responses     |
| Cost Forecasting   | Q2 2027 | Team       | AI cost prediction over 30/90 days         |
| Prompt Marketplace | Q3 2027 | Pro        | Community library of optimized prompts     |
| On-premise deploy  | Q4 2027 | Enterprise | Self-hosted on client infrastructure       |

## Plan Hierarchy

`Free` < `Pro` < `Team` < `Enterprise`

- Free features are available on all plans
- Pro features require Pro or above
- Team features require Team or above
- Enterprise features are exclusive to Enterprise

## Rules for Feature-Related Copy

- Always mention the plan required when referencing a feature in UI or marketing
- Roadmap features must never be presented as available — use "Coming Q2 2025" not "Available soon"
- Free tier features (Budget Firewall, Usage Dashboard) are the primary acquisition hook — lead with them
- Pro upsell trigger: when a Free user hits a Budget Firewall limit → surface Context Optimizer + Model Router
- Team upsell trigger: when a Pro user adds a second user → surface RBAC + Audit Logs
- Enterprise trigger: self-hosted requirement or 50+ users

## Feature Descriptions (copy-ready)

| Feature            | EN one-liner                                           | FR one-liner                                                      |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------------------------- |
| Context Optimizer  | Compresses your prompts. -40% tokens. Same output.     | Compresse vos prompts. -40% de tokens. Même résultat.             |
| Model Router       | Picks the right LLM for each request. Semantic complexity scoring. Cost + latency optimized. | Sélectionne le bon LLM. Scoring sémantique. Optimisé coût + latence. |
| Budget Firewall    | Hard caps. Soft alerts. No surprise invoices.          | Limites strictes. Alertes douces. Zéro facture surprise.          |
| Webhooks Engine    | Push events to Slack, Teams, or any URL.               | Envoyez les événements vers Slack, Teams ou n'importe quelle URL. |
| Usage Dashboard    | Every token. Every cost. Real-time.                    | Chaque token. Chaque coût. En temps réel.                         |
| RBAC Multi-user    | Admin, Manager, Dev, Viewer. Your team, your rules.    | Admin, Manager, Dev, Viewer. Votre équipe, vos règles.            |
| Audit Logs         | 90 days of full request history. Compliance-ready.     | 90 jours d'historique complet. Prêt pour la conformité.           |
| A/B Prompt Testing | Test two prompts on real traffic. Keep the winner.     | Testez deux prompts sur du trafic réel. Gardez le meilleur.       |
| LLM Cache Layer    | Identical requests. One LLM call.                      | Requêtes identiques. Un seul appel LLM.                           |
| Cost Forecasting   | Know your AI bill before it arrives.                   | Anticipez votre facture IA avant qu'elle arrive.                  |
| On-premise deploy  | GateCtr on your infrastructure. Your data stays yours. | GateCtr sur votre infrastructure. Vos données restent les vôtres. |
