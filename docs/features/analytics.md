# Analytics

Every token. Every cost. Real-time.

## What's tracked

Every request through GateCtr is logged automatically:

| Metric         | Description                         |
| -------------- | ----------------------------------- |
| `tokens_in`    | Prompt tokens sent                  |
| `tokens_out`   | Completion tokens received          |
| `tokens_saved` | Tokens removed by Context Optimizer |
| `cost_usd`     | Estimated cost of the request       |
| `model`        | Model used                          |
| `latency_ms`   | End-to-end latency                  |
| `project_id`   | Project the request belongs to      |
| `timestamp`    | UTC timestamp                       |

## Dashboard

View your usage at [gatectr.com/dashboard](https://gatectr.com/dashboard):

- **Overview** — total tokens, total cost, requests/day
- **By project** — breakdown per project
- **By model** — cost per model
- **Trends** — 7d / 30d / 90d charts

## Query via API

```bash
curl https://api.gatectr.com/v1/usage \
  -H "Authorization: Bearer $GATECTR_API_KEY" \
  -G \
  --data-urlencode "project_id=proj_123" \
  --data-urlencode "from=2025-01-01" \
  --data-urlencode "to=2025-01-31"
```

Response:

```json
{
  "total_tokens": 4820000,
  "total_cost_usd": 14.23,
  "tokens_saved": 1920000,
  "requests": 12400,
  "by_model": {
    "gpt-4o": { "tokens": 2100000, "cost_usd": 10.5 },
    "gpt-3.5-turbo": { "tokens": 2720000, "cost_usd": 3.73 }
  }
}
```

## Export

Export usage data as CSV from the dashboard: **Analytics → Export**.

Available on Team plan and above.

## Retention

| Plan       | Retention |
| ---------- | --------- |
| Free       | 7 days    |
| Pro        | 30 days   |
| Team       | 90 days   |
| Enterprise | Custom    |
