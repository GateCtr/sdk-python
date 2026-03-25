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
