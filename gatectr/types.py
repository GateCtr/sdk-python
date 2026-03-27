from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field


class PerRequestOptions(BaseModel):
    budget_id: str | None = None
    optimize: bool | None = None
    route: bool | None = None


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class GateCtrMetadata(BaseModel):
    request_id: str
    latency_ms: int
    overage: bool
    model_used: str
    tokens_saved: int = 0


class UsageCounts(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class CompleteChoice(BaseModel):
    text: str
    finish_reason: str


class CompleteResponse(BaseModel):
    id: str
    object: Literal["text_completion"]
    model: str
    choices: list[CompleteChoice]
    usage: UsageCounts
    gatectr: GateCtrMetadata


class ChatChoice(BaseModel):
    message: Message
    finish_reason: str


class ChatResponse(BaseModel):
    id: str
    object: Literal["chat.completion"]
    model: str
    choices: list[ChatChoice]
    usage: UsageCounts
    gatectr: GateCtrMetadata


class StreamChunk(BaseModel):
    id: str
    delta: str | None
    finish_reason: str | None


class ModelInfo(BaseModel):
    model_id: str
    display_name: str
    provider: str
    context_window: int
    capabilities: list[str]


class ModelsResponse(BaseModel):
    models: list[ModelInfo]
    request_id: str


class UsageParams(BaseModel):
    from_: str | None = Field(None, alias="from")
    to: str | None = None
    project_id: str | None = None

    model_config = {"populate_by_name": True}


class UsageByProject(BaseModel):
    project_id: str | None
    total_tokens: int
    total_requests: int
    total_cost_usd: float


class UsageResponse(BaseModel):
    total_tokens: int
    total_requests: int
    total_cost_usd: float
    saved_tokens: int
    from_: str = Field(alias="from")
    to: str
    by_project: list[UsageByProject]
    budget_status: dict[str, object] | None = None

    model_config = {"populate_by_name": True}


@dataclass
class GateCtrConfig:
    api_key: str
    base_url: str = "https://api.gatectr.com/v1"
    timeout: float = 30.0
    max_retries: int = 3
    optimize: bool = True
    route: bool = False


# ─── Usage Trends ─────────────────────────────────────────────────────────────

class UsageTrendsParams(BaseModel):
    from_: str | None = Field(None, alias="from")
    to: str | None = None
    project_id: str | None = None
    granularity: str | None = None  # "day" | "week" | "month"

    model_config = {"populate_by_name": True}


class UsageTrendPoint(BaseModel):
    date: str
    total_tokens: int
    saved_tokens: int
    total_requests: int
    total_cost_usd: float


class UsageTrendsResponse(BaseModel):
    granularity: str
    from_: str = Field(alias="from")
    to: str
    series: list[UsageTrendPoint]

    model_config = {"populate_by_name": True}


# ─── Webhooks ─────────────────────────────────────────────────────────────────

class Webhook(BaseModel):
    id: str
    name: str
    url: str
    events: list[str]
    is_active: bool
    last_fired_at: str | None = None
    fail_count: int
    success_count: int
    created_at: str


class WebhooksListResponse(BaseModel):
    webhooks: list[Webhook]


# ─── Budget ───────────────────────────────────────────────────────────────────

class Budget(BaseModel):
    id: str
    user_id: str | None = None
    project_id: str | None = None
    max_tokens_per_day: int | None = None
    max_tokens_per_month: int | None = None
    max_cost_per_day: float | None = None
    max_cost_per_month: float | None = None
    alert_threshold_pct: int
    hard_stop: bool
    notify_on_threshold: bool
    notify_on_exceeded: bool
    created_at: str
    updated_at: str


class BudgetProject(BaseModel):
    id: str
    name: str
    slug: str


class BudgetWithProject(Budget):
    project: BudgetProject | None = None


class BudgetGetResponse(BaseModel):
    user_budget: Budget | None = None
    project_budgets: list[BudgetWithProject]


# ─── Provider Keys ────────────────────────────────────────────────────────────

class ProviderKey(BaseModel):
    id: str
    provider: str
    name: str
    is_active: bool
    last_used_at: str | None = None
    created_at: str
