# Budget Firewall

Hard caps per project. No surprise invoices.

## How it works

Every request passes through the Budget Firewall before reaching the LLM. If the project budget is exceeded, the request is blocked and a `429` is returned. No tokens consumed. No cost incurred.

## Set a budget

In the dashboard: **Projects → Your project → Budget**

Or via API:

```bash
curl -X PATCH https://api.gatectr.com/v1/budget \
  -H "Authorization: Bearer $GATECTR_API_KEY" \
  -d '{ "project_id": "proj_123", "limit_tokens": 100000, "period": "day" }'
```

## Budget types

| Type       | Description                               |
| ---------- | ----------------------------------------- |
| `tokens`   | Cap on total tokens (prompt + completion) |
| `cost_usd` | Cap on estimated USD cost                 |

## Periods

| Period  | Resets               |
| ------- | -------------------- |
| `day`   | Midnight UTC         |
| `month` | 1st of the month UTC |
| `total` | Never — lifetime cap |

## Soft alerts

Set a threshold to receive a webhook before the hard cap is hit:

```json
{
  "limit_tokens": 100000,
  "alert_at_percent": 80
}
```

At 80% usage, GateCtr fires a `budget.threshold_reached` webhook event.

## Blocked request response

```json
{
  "error": {
    "type": "budget_exceeded",
    "message": "Request blocked. Budget limit reached.",
    "project_id": "proj_123",
    "limit": 100000,
    "used": 100012
  }
}
```

HTTP status: `429 Too Many Requests`

## Available on

Free plan and above.
