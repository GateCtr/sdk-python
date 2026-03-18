# Self-hosted

Run GateCtr on your own infrastructure. Enterprise plan only.

## When to use

- Data residency requirements (GDPR, HIPAA, SOC2)
- Air-gapped environments
- 50+ users with internal billing requirements
- Custom SLA requirements

## Requirements

- Docker + Docker Compose
- PostgreSQL 15+
- Redis 7+
- 2 vCPU / 4GB RAM minimum (8GB recommended for production)

## Quick start

```bash
git clone https://github.com/GateCtr/platform
cd platform
cp .env.example .env  # fill in your config
docker compose up -d
```

## Environment variables

| Variable              | Description                        |
| --------------------- | ---------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string       |
| `REDIS_URL`           | Redis connection string            |
| `GATECTR_LICENSE_KEY` | Your Enterprise license key        |
| `ENCRYPTION_KEY`      | AES-256 key for API key encryption |
| `CLERK_SECRET_KEY`    | Clerk auth secret                  |

## Architecture

```
                    ┌─────────────────┐
Your app ──────────▶│  GateCtr API    │
                    │  (port 3000)    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         PostgreSQL        Redis        LLM providers
         (data)           (cache)      (OpenAI, etc.)
```

## Updates

Pull the latest image and restart:

```bash
docker compose pull
docker compose up -d
```

## Support

Enterprise customers get dedicated support. Contact [enterprise@gatectr.com](mailto:enterprise@gatectr.com).
