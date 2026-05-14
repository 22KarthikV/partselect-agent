from __future__ import annotations

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from enum import Enum

from dotenv import load_dotenv

load_dotenv(override=True)

from fastapi import Body, FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from agent.orchestrator import run_agent
from agent.tools import get_part_details, search_parts
from agent.vector_store import get_status as vs_get_status
from agent.vector_store import initialize_vector_store
from data.database import (
    create_tables,
    get_all_parts_for_indexing,
    get_all_symptoms_for_indexing,
    get_conversation_messages,
    get_conversations,
    get_db_connection,
    save_conversation,
)
from models.schemas import (
    ChatRequest,
    ConversationSummary,
    ErrorResponse,
    HealthResponse,
    MessageRecord,
    SaveConversationRequest,
    SearchResult,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create SQLite tables
    with get_db_connection() as conn:
        create_tables(conn)

    # Initialize vector store off the event loop (model loading is CPU-bound)
    parts = get_all_parts_for_indexing()
    symptoms = get_all_symptoms_for_indexing()
    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=1) as executor:
        ok = await loop.run_in_executor(executor, initialize_vector_store, parts, symptoms)
    if not ok:
        logger.warning("Vector store failed to initialize — semantic search unavailable.")

    yield


app = FastAPI(
    title="PartSelect AI Agent API",
    description="Backend API for the PartSelect AI chat agent — refrigerator and dishwasher parts.",
    version="1.0.0",
    lifespan=lifespan,
)

_origins_raw = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
origins = [o.strip() for o in _origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    try:
        with get_db_connection() as conn:
            conn.execute("SELECT COUNT(*) FROM parts").fetchone()
        db_status = "connected"
    except Exception as exc:
        db_status = f"error: {exc}"

    return HealthResponse(status="ok", db=db_status, vector_store=vs_get_status())


# ---------------------------------------------------------------------------
# Catalog stats
# ---------------------------------------------------------------------------


@app.get("/api/stats")
async def catalog_stats():
    """Return live counts from the database for the frontend status display."""
    try:
        with get_db_connection() as conn:
            total_parts = conn.execute("SELECT COUNT(*) FROM parts").fetchone()[0]
            fridge_parts = conn.execute(
                "SELECT COUNT(*) FROM parts WHERE appliance_type='refrigerator'"
            ).fetchone()[0]
            dish_parts = conn.execute(
                "SELECT COUNT(*) FROM parts WHERE appliance_type='dishwasher'"
            ).fetchone()[0]
            total_models = conn.execute("SELECT COUNT(*) FROM models").fetchone()[0]
            compat_pairs = conn.execute("SELECT COUNT(*) FROM compatibility").fetchone()[0]
        return {
            "parts": total_parts,
            "refrigerator_parts": fridge_parts,
            "dishwasher_parts": dish_parts,
            "models": total_models,
            "compatibility_pairs": compat_pairs,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Part lookup
# ---------------------------------------------------------------------------


@app.get("/api/part/{part_number}")
async def get_part(
    part_number: str = Path(..., min_length=1, max_length=50, pattern=r"^[A-Za-z0-9\-]+$"),
):
    result = await get_part_details(part_number)
    if "error" in result and result["error"] == "not_found":
        raise HTTPException(status_code=404, detail=result["detail"])
    return result


# ---------------------------------------------------------------------------
# Parts search (convenience endpoint for frontend)
# ---------------------------------------------------------------------------


class ApplianceType(str, Enum):
    refrigerator = "refrigerator"
    dishwasher = "dishwasher"


@app.get("/api/parts/search")
async def search_parts_endpoint(
    q: str = Query(..., min_length=1, max_length=200),
    appliance_type: ApplianceType | None = Query(default=None),
):
    result = await search_parts(q, appliance_type.value if appliance_type else None)
    return result


# ---------------------------------------------------------------------------
# Chat endpoint — streaming SSE
# ---------------------------------------------------------------------------


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Stream agent responses as Server-Sent Events.

    The client reads the stream and renders tokens + rich cards incrementally.
    Each SSE line has the form:  data: <json>\n\n
    """
    if not request.messages:
        raise HTTPException(status_code=422, detail="messages must not be empty")

    async def event_stream():
        async for event in run_agent(request.messages, request.session_id):
            yield event

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Conversation history
# ---------------------------------------------------------------------------

_CONV_ID_PATTERN = r"^[A-Za-z0-9\-_]+$"


@app.get("/api/conversations", response_model=list[ConversationSummary])
async def list_conversations(
    user_id: str = Query(..., min_length=1, max_length=64, pattern=_CONV_ID_PATTERN),
):
    return get_conversations(user_id)


@app.get(
    "/api/conversations/{conversation_id}/messages",
    response_model=list[MessageRecord],
)
async def load_conversation_messages(
    conversation_id: str = Path(..., min_length=1, max_length=64, pattern=_CONV_ID_PATTERN),
):
    return get_conversation_messages(conversation_id)


@app.post("/api/conversations/{conversation_id}/save")
async def save_conv(
    conversation_id: str = Path(..., min_length=1, max_length=64, pattern=_CONV_ID_PATTERN),
    request: SaveConversationRequest = Body(...),
):
    msgs = [{"role": m.role, "content": m.content, "rich_cards": m.rich_cards} for m in request.messages]
    save_conversation(conversation_id, request.user_id, request.title, msgs)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Global error handler
# ---------------------------------------------------------------------------


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="internal_server_error",
            detail="An unexpected error occurred. Please try again.",
        ).model_dump(),
    )
