# GET /v1/usage

Query token usage and cost data for a project.

## Endpoint

```
GET https://api.gatectr.com/v1/usage
```

## Headers

| Header          | Value                   |
| --------------- | ----------------------- |
| `Authorization` | `Bearer <your-api-key>` |

## Query parameters

| Parameter    | Type     | Required | Description                         |
| ------------ | -------- | -------- | ----------------------------------- |
| `project_id` | `string` | No       | Filter by project                   |
| `from`       | `string` | No       | Start date (ISO 8601: `2025-01-01`) |
| `to`         | `string` | No       | End date (ISO 8601: `2025-01-31`)   |
| `group_by`   | `string` | No       | `model` \| `day` \| `project`       |

## Example

```bash
curl https://api.gatectr.com/v1/usage \
  -H "Authorization: Bearer $GATECTR_API_KEY" \
  -G \
  --data-urlencode "project_id=proj_123" \
  --data-urlencode "from=2025-01-01" \
  --data-urlencode "to=2025-01-31" \
  --data-urlencode "group_by=model"
```

## Response

```json
{
  "from": "2025-01-01",
  "to": "2025-01-31",
  "total_tokens": 4820000,
  "total_cost_usd": 14.23,
  "tokens_saved": 1920000,
  "requests": 12400,
  "by_model": {
    "gpt-4o": {
      "tokens": 2100000,
      "cost_usd": 10.5,
      "requests": 4200
    },
    "gpt-3.5-turbo": {
      "tokens": 2720000,
      "cost_usd": 3.73,
      "requests": 8200
    }
  }
}
```
