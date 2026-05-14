"""Core agent orchestration loop for the PartSelect AI Assistant.

Yields Server-Sent Event strings to the FastAPI streaming endpoint.

SSE event types emitted:
  {"type": "tool_call",    "tool": "<name>", "status": "running"}
  {"type": "tool_result",  "tool": "<name>", "status": "done", "data": {...}}
  {"type": "token",        "content": "<text chunk>"}
  {"type": "rich_content", "content_type": "<kind>", "data": {...}}
  {"type": "error",        "message": "<human-readable error>"}
  {"type": "done"}
"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from agent.llm_client import LLMClient
from agent.prompts import SYSTEM_PROMPT
from agent.tools import TOOL_SCHEMAS, execute_tool
from models.schemas import ChatMessage

logger = logging.getLogger(__name__)

# Singleton client — created lazily on first request to respect load_dotenv timing
_llm_client: LLMClient | None = None


def _get_client() -> LLMClient:
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client


# Maximum tool-call rounds per user turn (prevents runaway loops)
_MAX_TOOL_ROUNDS = 5

# Map tool name → rich_content content_type emitted after tool result is ready
_RICH_CONTENT_MAP: dict[str, str] = {
    "get_part_details": "product_card",
    "check_compatibility": "compatibility",
    "get_installation_guide": "install_steps",
    "search_parts_by_symptom": "troubleshoot",
    "get_parts_for_model": "product_list",
    "get_order_status": "order_status",
    "search_parts": "product_list",  # keyword search also returns a list of parts
}

# Friendly tool-status labels shown in the TypingIndicator
_TOOL_LABELS: dict[str, str] = {
    "get_part_details": "Looking up part details",
    "check_compatibility": "Checking compatibility",
    "get_installation_guide": "Fetching installation guide",
    "search_parts_by_symptom": "Diagnosing the issue",
    "get_parts_for_model": "Finding compatible parts",
    "get_order_status": "Checking order status",
    "search_parts": "Searching the parts catalog",
}


def _sse(event: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(event)}\n\n"


def _messages_to_dicts(messages: list[ChatMessage]) -> list[dict]:
    """Convert Pydantic ChatMessage list → plain dicts for the LLM client."""
    return [{"role": m.role, "content": m.content} for m in messages]


async def run_agent(
    messages: list[ChatMessage],
    session_id: str,
) -> AsyncGenerator[str, None]:
    """Main agent loop.

    Args:
        messages: Conversation history from the client (full history each turn).
        session_id: Client-supplied session identifier (used for logging only).

    Yields:
        SSE event strings terminated by double newline.
    """
    try:
        client = _get_client()
    except Exception as exc:
        logger.error("Failed to initialise LLM client: %s", exc)
        yield _sse({"type": "error", "message": str(exc)})
        yield _sse({"type": "done"})
        return

    history: list[dict] = _messages_to_dicts(messages)
    # Track emitted token text to prevent duplicate emission when the model
    # returns repeated content blocks (observed with claude-sonnet-4-5).
    _emitted_tokens: set[str] = set()
    # Track best rich_content result per content_type across all rounds so we
    # only emit one card per type (the one with the most data / highest count).
    _best_rich: dict[str, dict] = {}  # content_type → result dict

    for round_num in range(_MAX_TOOL_ROUNDS):
        try:
            blocks = await client.chat(
                messages=history,
                tools=TOOL_SCHEMAS,
                system=SYSTEM_PROMPT,
            )
        except Exception as exc:
            logger.error(
                "LLM call failed (session=%s, round=%d): %s",
                session_id,
                round_num,
                exc,
                exc_info=True,
            )
            yield _sse(
                {
                    "type": "error",
                    "message": (
                        "I'm having trouble connecting right now. "
                        "Please try again in a moment."
                    ),
                }
            )
            yield _sse({"type": "done"})
            return

        has_tool_calls = any(b.type == "tool_use" for b in blocks)

        # ----------------------------------------------------------------
        # Handle tool_use blocks first — execute all tools in this round
        # ----------------------------------------------------------------
        tool_results: list[dict] = []  # accumulated for the next history entry
        assistant_content: list[dict] = []  # Claude assistant turn content

        for block in blocks:
            if block.type == "tool_use":
                tool_label = _TOOL_LABELS.get(block.name, f"Using {block.name}")
                yield _sse(
                    {
                        "type": "tool_call",
                        "tool": block.name,
                        "label": tool_label,
                        "status": "running",
                    }
                )

                try:
                    result = await execute_tool(block.name, block.input)
                except Exception as exc:
                    logger.error(
                        "Tool '%s' raised exception (session=%s): %s",
                        block.name,
                        session_id,
                        exc,
                        exc_info=True,
                    )
                    result = {
                        "error": "tool_error",
                        "detail": f"Tool '{block.name}' encountered an error.",
                    }

                # Emit rich_content event so the frontend can render a card.
                # Skip product_list cards with 0 results — the model will explain in text.
                # Also deduplicate: only keep the richest result per content_type.
                rich_type = _RICH_CONTENT_MAP.get(block.name)
                empty_list = (
                    rich_type == "product_list"
                    and result.get("total_count", 0) == 0
                )
                if rich_type and "error" not in result and not empty_list:
                    new_count = result.get("total_count", 1)
                    existing = _best_rich.get(rich_type)
                    existing_count = existing.get("total_count", 1) if existing else -1
                    if existing is None or new_count > existing_count:
                        _best_rich[rich_type] = result

                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    }
                )

                # Track assistant content for history
                assistant_content.append(
                    {
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    }
                )

            elif block.type == "text":
                # Stream text tokens in all rounds.
                # Guard against duplicate blocks the model occasionally returns.
                assistant_content.append({"type": "text", "text": block.text})
                if block.text and block.text not in _emitted_tokens:
                    _emitted_tokens.add(block.text)
                    yield _sse({"type": "token", "content": block.text})

        # ----------------------------------------------------------------
        # Append assistant turn + tool results to history and loop
        # ----------------------------------------------------------------
        if assistant_content:
            history.append({"role": "assistant", "content": assistant_content})

        if tool_results:
            history.append({"role": "user", "content": tool_results})
            # Flush deduplicated rich cards collected in this round before looping.
            for content_type, best_result in _best_rich.items():
                yield _sse(
                    {
                        "type": "rich_content",
                        "content_type": content_type,
                        "data": best_result,
                    }
                )
            _best_rich.clear()
            # Continue loop so the model can read tool results and respond
            continue

        # Flush deduplicated rich_content cards now that all tools have run.
        for content_type, best_result in _best_rich.items():
            yield _sse(
                {
                    "type": "rich_content",
                    "content_type": content_type,
                    "data": best_result,
                }
            )
        _best_rich.clear()

        # Tokens already emitted in the loop above; signal completion.
        yield _sse({"type": "done"})
        return

    # Reached max rounds without a final text answer
    logger.warning(
        "Reached max tool rounds (%d) for session=%s", _MAX_TOOL_ROUNDS, session_id
    )
    yield _sse(
        {
            "type": "token",
            "content": (
                "\n\nI needed more steps than I'm allowed to take in one turn. "
                "Please try rephrasing your question or breaking it into smaller parts, "
                "and I'll do my best to help!"
            ),
        }
    )
    yield _sse({"type": "done"})
