"""LLM provider abstraction for the PartSelect agent.

Reads LLM_PROVIDER from env (default: "anthropic").
Exposes a single async chat() interface regardless of provider.
"""

from __future__ import annotations

import atexit
import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

# Shared executor — avoids creating a new thread pool per LLM call.
# Max 4 workers covers typical concurrent-user load without exhausting OS threads.
_executor = ThreadPoolExecutor(max_workers=4)
atexit.register(_executor.shutdown, wait=False)


@dataclass
class ContentBlock:
    """Normalized response block — identical shape for all providers."""

    type: str  # "text" | "tool_use"
    text: str = ""
    id: str = ""
    name: str = ""
    input: dict[str, Any] = None  # type: ignore[assignment]  # populated by __post_init__

    def __post_init__(self) -> None:
        if self.input is None:
            self.input = {}  # replace None sentinel with a proper empty dict


class LLMClient:
    """Provider-agnostic LLM client.

    Usage:
        client = LLMClient()  # reads LLM_PROVIDER from env
        blocks = await client.chat(messages=..., tools=..., system=...)
    """

    def __init__(self) -> None:
        self._provider = os.environ.get("LLM_PROVIDER", "anthropic").lower()
        if self._provider == "anthropic":
            self._client = self._build_anthropic_client()
        elif self._provider == "gemini":
            self._client = self._build_gemini_client()
        else:
            raise ValueError(
                f"Unsupported LLM_PROVIDER '{self._provider}'. "
                "Use 'anthropic' (default) or 'gemini'."
            )
        logger.info("LLMClient initialized with provider: %s", self._provider)

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        system: str,
    ) -> list[ContentBlock]:
        """Send messages and return normalized content blocks.

        Args:
            messages: Conversation history in Claude message format.
            tools: Tool schemas in Claude tool_use format (input_schema key).
            system: System prompt string.

        Returns:
            List of ContentBlock — type is "text" or "tool_use".
        """
        if self._provider == "anthropic":
            return await self._chat_anthropic(messages, tools, system)
        return await self._chat_gemini(messages, tools, system)

    # ------------------------------------------------------------------
    # Anthropic (Claude) — primary
    # ------------------------------------------------------------------

    @staticmethod
    def _build_anthropic_client():
        import anthropic  # lazy import — not installed in gemini-only envs

        # Use os.environ["KEY"] per Python security guidelines — raises KeyError
        # with a clear message if the variable is absent, cannot silently accept "".
        api_key = os.environ.get("ANTHROPIC_API_KEY") or ""
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY environment variable is not set or is empty. "
                "Set it in backend/.env or switch to LLM_PROVIDER=gemini."
            )
        return anthropic.Anthropic(api_key=api_key)

    async def _chat_anthropic(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        system: str,
    ) -> list[ContentBlock]:
        import asyncio  # noqa: PLC0415 — asyncio is stdlib, safe to import late

        loop = asyncio.get_running_loop()

        def _call():
            return self._client.messages.create(
                model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
                max_tokens=int(os.environ.get("LLM_MAX_TOKENS", "2048")),
                system=system,
                tools=tools,
                messages=messages,
            )

        # Run sync SDK call in the shared thread executor (avoids blocking the event loop)
        response = await loop.run_in_executor(_executor, _call)

        blocks: list[ContentBlock] = []
        for block in response.content:
            if block.type == "text":
                blocks.append(ContentBlock(type="text", text=block.text))
            elif block.type == "tool_use":
                blocks.append(
                    ContentBlock(
                        type="tool_use",
                        id=block.id,
                        name=block.name,
                        input=dict(block.input),
                    )
                )
        return blocks

    # ------------------------------------------------------------------
    # Gemini — fallback
    # ------------------------------------------------------------------

    @staticmethod
    def _build_gemini_client():
        try:
            from google import genai  # type: ignore[import]
        except ImportError as exc:
            raise RuntimeError(
                "google-genai package is not installed. "
                "Run: pip install google-genai"
            ) from exc

        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY environment variable is not set. "
                "Set it in backend/.env."
            )
        return genai.Client(api_key=api_key)

    async def _chat_gemini(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        system: str,
    ) -> list[ContentBlock]:
        import asyncio
        from concurrent.futures import ThreadPoolExecutor

        gemini_tools = self._convert_tools_to_gemini(tools)
        gemini_messages = self._convert_messages_to_gemini(messages)

        def _call():
            from google.genai import types as gtypes  # type: ignore[import]

            model_name = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
            return self._client.models.generate_content(
                model=model_name,
                contents=gemini_messages,
                config=gtypes.GenerateContentConfig(
                    system_instruction=system,
                    tools=gemini_tools,
                    max_output_tokens=int(os.environ.get("LLM_MAX_TOKENS", "2048")),
                ),
            )

        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(_executor, _call)

        return self._normalize_gemini_response(response)

    @staticmethod
    def _convert_tools_to_gemini(tools: list[dict]) -> list:
        """Convert Claude tool schema format → Gemini FunctionDeclaration list."""
        try:
            from google.genai import types as gtypes  # type: ignore[import]
        except ImportError:
            return []

        declarations = []
        for tool in tools:
            schema = tool.get("input_schema", {})
            props = schema.get("properties", {})
            required = schema.get("required", [])

            # Convert each property — Gemini uses slightly different type names
            gemini_props = {}
            for prop_name, prop_def in props.items():
                prop_type = prop_def.get("type", "string").upper()
                # Gemini doesn't support "enum" at property level the same way;
                # just declare as STRING and let the model infer from description
                gemini_props[prop_name] = gtypes.Schema(
                    type=prop_type,
                    description=prop_def.get("description", ""),
                )

            declarations.append(
                gtypes.Tool(
                    function_declarations=[
                        gtypes.FunctionDeclaration(
                            name=tool["name"],
                            description=tool.get("description", ""),
                            parameters=gtypes.Schema(
                                type="OBJECT",
                                properties=gemini_props,
                                required=required,
                            ),
                        )
                    ]
                )
            )
        return declarations

    @staticmethod
    def _convert_messages_to_gemini(messages: list[dict]) -> list:
        """Convert Claude-format messages to Gemini Content list."""
        try:
            from google.genai import types as gtypes  # type: ignore[import]
        except ImportError:
            return []

        contents = []
        for msg in messages:
            role = msg["role"]
            content = msg["content"]

            # Map roles: Claude uses "user"/"assistant", Gemini uses "user"/"model"
            gemini_role = "model" if role == "assistant" else "user"

            if isinstance(content, str):
                contents.append(
                    gtypes.Content(
                        role=gemini_role,
                        parts=[gtypes.Part(text=content)],
                    )
                )
            elif isinstance(content, list):
                # Handle tool_result content blocks
                parts = []
                for block in content:
                    if block.get("type") == "tool_result":
                        parts.append(
                            gtypes.Part(
                                function_response=gtypes.FunctionResponse(
                                    name=block.get("tool_use_id", "unknown"),
                                    response={"result": block.get("content", "")},
                                )
                            )
                        )
                    elif block.get("type") == "text":
                        parts.append(gtypes.Part(text=block.get("text", "")))
                if parts:
                    contents.append(gtypes.Content(role=gemini_role, parts=parts))

        return contents

    @staticmethod
    def _normalize_gemini_response(response) -> list[ContentBlock]:
        """Normalize Gemini response → list[ContentBlock]."""
        blocks: list[ContentBlock] = []
        try:
            for candidate in response.candidates:
                for part in candidate.content.parts:
                    if hasattr(part, "function_call") and part.function_call:
                        fc = part.function_call
                        blocks.append(
                            ContentBlock(
                                type="tool_use",
                                id=f"gemini_{fc.name}",
                                name=fc.name,
                                input=dict(fc.args) if fc.args else {},
                            )
                        )
                    elif hasattr(part, "text") and part.text:
                        blocks.append(ContentBlock(type="text", text=part.text))
        except Exception as exc:
            logger.error("Failed to normalize Gemini response: %s", exc)
            blocks.append(
                ContentBlock(
                    type="text",
                    text="I encountered an issue processing that request. Please try again.",
                )
            )
        return blocks
