"""Pydantic request/response schemas for the PartSelect AI Agent API.

These models serve two purposes:
  1. FastAPI request validation — invalid payloads are rejected with a 422
     before reaching any business logic.
  2. Response serialisation — FastAPI serialises return values through these
     models, ensuring a consistent JSON shape for the frontend.

Tool result shapes (PartDetail, CompatibilityResult, etc.) mirror the dicts
returned by agent/tools.py so the frontend receives identically-keyed objects
whether a response comes from the REST endpoints or the SSE stream.
"""
from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class PartDetail(BaseModel):
    """Normalised part record returned by all part-lookup endpoints."""
    model_config = ConfigDict(from_attributes=True)

    ps_number: str
    mfr_number: str
    name: str
    appliance_type: str
    category: str
    price: float
    in_stock: bool
    description: str
    install_steps: list[str] = Field(default_factory=list)
    image_url: str = ""
    partselect_url: str = ""


class DiagnosedPart(BaseModel):
    """A part matched by symptom search, with a likelihood tier and reason."""

    part: PartDetail
    likelihood: Literal["most_likely", "possible", "less_likely"]
    reason: str


class CompatibilityResult(BaseModel):
    """Result of a part-to-model compatibility check."""

    part_number: str
    model_number: str
    is_compatible: bool
    explanation: str
    part_name: str = ""
    model_description: str = ""
    alternative_parts: list[PartDetail] = Field(default_factory=list)


class InstallGuide(BaseModel):
    """Step-by-step installation instructions for a part."""

    part_number: str
    part_name: str
    steps: list[str]
    estimated_time: str = ""
    tools_needed: list[str] = Field(default_factory=list)


class SymptomResult(BaseModel):
    """Symptom diagnosis result: ranked parts with repair guidance."""

    appliance_type: str
    symptom: str
    diagnosed_parts: list[DiagnosedPart] = Field(default_factory=list)
    repair_guidance: str = ""
    safety_note: str = ""


class ModelParts(BaseModel):
    """Parts compatible with a specific appliance model."""

    model_number: str
    brand: str = ""
    appliance_type: str = ""
    description: str = ""
    parts: list[PartDetail] = Field(default_factory=list)
    total_count: int = 0


class OrderItem(BaseModel):
    ps_number: str
    name: str
    quantity: int = 1
    price: float = 0.0


class OrderStatus(BaseModel):
    """Customer order status including tracking and line items."""

    order_id: str
    status: str
    estimated_delivery: str = ""
    tracking_number: str = ""
    items: list[OrderItem] = Field(default_factory=list)


class SearchResult(BaseModel):
    """Keyword search results from the parts catalog."""

    query: str
    parts: list[PartDetail] = Field(default_factory=list)
    total_count: int = 0


class HealthResponse(BaseModel):
    status: str
    db: str
    vector_store: str


class ChatMessage(BaseModel):
    """A single turn in a conversation (user or assistant)."""

    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=20_000)


class ChatRequest(BaseModel):
    """Incoming POST /api/chat payload."""

    messages: list[ChatMessage] = Field(..., min_length=1, max_length=200)
    session_id: str = Field(
        default="",
        max_length=64,
        pattern=r"^[A-Za-z0-9\-_]*$",
        description="Client-generated session ID (alphanumeric + hyphens/underscores only).",
    )


class ErrorResponse(BaseModel):
    error: str
    detail: str = ""


class MessageRecord(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    rich_cards: list[Any] = Field(default_factory=list)
    created_at: str


class ConversationSummary(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int = 0


class SaveMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=20_000)
    rich_cards: list[Any] = Field(default_factory=list)


class SaveConversationRequest(BaseModel):
    """Payload for POST /api/conversations/{id}/save."""

    user_id: str = Field(..., max_length=64, pattern=r"^[A-Za-z0-9\-_]+$")
    title: str = Field(default="New conversation", max_length=200)
    messages: list[SaveMessage] = Field(..., max_length=200)
