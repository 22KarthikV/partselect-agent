from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class PartDetail(BaseModel):
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
    part: PartDetail
    likelihood: Literal["most_likely", "possible", "less_likely"]
    reason: str


class CompatibilityResult(BaseModel):
    part_number: str
    model_number: str
    is_compatible: bool
    explanation: str
    part_name: str = ""
    model_description: str = ""
    alternative_parts: list[PartDetail] = Field(default_factory=list)


class InstallGuide(BaseModel):
    part_number: str
    part_name: str
    steps: list[str]
    estimated_time: str = ""
    tools_needed: list[str] = Field(default_factory=list)


class SymptomResult(BaseModel):
    appliance_type: str
    symptom: str
    diagnosed_parts: list[DiagnosedPart] = Field(default_factory=list)
    repair_guidance: str = ""
    safety_note: str = ""


class ModelParts(BaseModel):
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
    order_id: str
    status: str
    estimated_delivery: str = ""
    tracking_number: str = ""
    items: list[OrderItem] = Field(default_factory=list)


class SearchResult(BaseModel):
    query: str
    parts: list[PartDetail] = Field(default_factory=list)
    total_count: int = 0


class HealthResponse(BaseModel):
    status: str
    db: str
    vector_store: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=20_000)


class ChatRequest(BaseModel):
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
    user_id: str = Field(..., max_length=64, pattern=r"^[A-Za-z0-9\-_]+$")
    title: str = Field(default="New conversation", max_length=200)
    messages: list[SaveMessage] = Field(..., max_length=200)
