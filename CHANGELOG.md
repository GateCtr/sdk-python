# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-27

### Added

- `usage_trends()` — time series analytics via `GET /usage/trends` (scope: `read`)
- `list_webhooks()` / `create_webhook()` / `update_webhook()` / `delete_webhook()` (scope: `read`/`admin`)
- `get_budget()` / `set_budget()` (scope: `read`/`admin`)
- `list_provider_keys()` / `add_provider_key()` / `remove_provider_key()` (scope: `read`/`admin`)
- New types: `UsageTrendsParams`, `UsageTrendPoint`, `UsageTrendsResponse`, `Webhook`, `WebhooksListResponse`, `Budget`, `BudgetGetResponse`, `ProviderKey`

## [Unreleased]
