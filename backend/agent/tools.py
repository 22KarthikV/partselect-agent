"""Tool handlers for the PartSelect agent.

Each handler is an async function that queries the database and returns a plain dict
matching the corresponding Pydantic schema in models/schemas.py.

Also exports:
  TOOL_SCHEMAS  — Claude tool_use format (used by orchestrator in Phase 4)
  execute_tool  — dispatcher function (used by orchestrator in Phase 4)
"""

from __future__ import annotations

import json
import logging
from typing import Any

from agent import vector_store

logger = logging.getLogger(__name__)
from agent.scraper import (
    resolve_part_url,
    resolve_parts_urls,
    scrape_model_page,
    scrape_part,
    search_parts_on_partselect,
)
from data.database import (
    cache_scraped_part,
    get_compatibility,
    get_model_info,
    get_order_by_id,
    get_part_by_number,
    get_parts_by_ps_numbers,
    get_parts_for_model,
    get_symptoms_by_keywords,
    search_parts_by_keywords,
)

# ---------------------------------------------------------------------------
# Likelihood tiers — first listed_part in symptom = most_likely, etc.
# ---------------------------------------------------------------------------
_LIKELIHOOD_MAP = {0: "most_likely", 1: "possible", 2: "less_likely"}


def _likelihood(index: int) -> str:
    return _LIKELIHOOD_MAP.get(index, "less_likely")


# ---------------------------------------------------------------------------
# Tool handlers
# ---------------------------------------------------------------------------


_ALLOWED_APPLIANCE_TYPES = {"refrigerator", "dishwasher"}


def _appliance_scope_error(part_number: str, appliance_type: str, part_name: str = "") -> dict:
    label = part_name or part_number
    type_display = appliance_type.replace("-", " ").title() if appliance_type != "unknown" else "an unsupported appliance"
    return {
        "error": "out_of_scope",
        "detail": (
            f"'{label}' is a {type_display} part. "
            f"We only support refrigerator and dishwasher parts on PartSelect. "
            f"Please visit PartSelect.com directly for other appliance types."
        ),
        "part_number": part_number,
    }


async def get_part_details(part_number: str) -> dict:
    """Look up a part by PS number or manufacturer number."""
    # Layer 1: SQLite seed/cache
    part = get_part_by_number(part_number)
    if part is not None:
        appliance_type = part.get("appliance_type", "unknown")
        if appliance_type not in _ALLOWED_APPLIANCE_TYPES and appliance_type != "unknown":
            return _appliance_scope_error(part_number, appliance_type, part.get("name", ""))
        # Ensure the stored URL is a valid canonical slug, not a short-form that 404s
        part = await resolve_part_url(part)
        return part

    # Layer 2: live scraper (PS-style numbers only)
    ps_candidate = (
        part_number if part_number.upper().startswith("PS") else f"PS{part_number}"
    )
    try:
        scraped = await scrape_part(ps_candidate)
        if scraped.get("error") != "scrape_failed":
            appliance_type = scraped.get("appliance_type", "unknown")
            if appliance_type not in _ALLOWED_APPLIANCE_TYPES and appliance_type != "unknown":
                # Don't cache out-of-scope parts
                return _appliance_scope_error(part_number, appliance_type, scraped.get("name", ""))
            cache_scraped_part(scraped)
            vector_store.upsert_part(scraped)
            return scraped
    except Exception as exc:
        logger.warning("Scraper call failed for %s: %s", part_number, exc)

    return {
        "error": "not_found",
        "detail": (
            f"Part '{part_number}' was not found in our catalog and could not be "
            f"retrieved from PartSelect.com. Please verify the part number is correct."
        ),
        "part_number": part_number,
    }


async def check_compatibility(part_number: str, model_number: str) -> dict:
    """Check whether a part is compatible with a given appliance model."""
    part = get_part_by_number(part_number)
    if part is None:
        return {
            "part_number": part_number,
            "model_number": model_number,
            "is_compatible": False,
            "explanation": f"Part '{part_number}' was not found in our database.",
            "part_name": "",
            "model_description": "",
            "alternative_parts": [],
        }

    model = get_model_info(model_number)
    model_description = model["description"] if model else ""

    is_compatible, explanation = get_compatibility(part["ps_number"], model_number)

    alternative_parts: list[dict] = []
    if not is_compatible and model:
        # Suggest alternatives from same category and correct appliance type
        alternatives = get_parts_for_model(model_number, category=None)
        same_cat = [
            p for p in alternatives
            if p["category"] == part["category"] and p["ps_number"] != part["ps_number"]
        ][:3]
        alternative_parts = same_cat

    return {
        "part_number": part["ps_number"],
        "model_number": model_number,
        "is_compatible": is_compatible,
        "explanation": explanation,
        "part_name": part["name"],
        "model_description": model_description,
        "alternative_parts": alternative_parts,
    }


async def get_installation_guide(part_number: str) -> dict:
    """Return step-by-step installation instructions for a part."""
    part = get_part_by_number(part_number)
    if part is None:
        return {
            "part_number": part_number,
            "part_name": "Unknown Part",
            "steps": [
                "Part not found in our database.",
                "Please verify the part number and try again.",
                "You can also contact PartSelect customer support for assistance.",
            ],
            "estimated_time": "Unknown",
            "tools_needed": [],
        }

    steps: list[str] = part.get("install_steps", [])
    if not steps:
        steps = [
            f"Unplug the appliance before beginning any repair.",
            f"Locate the {part['name']} in your appliance.",
            f"Disconnect any wire harnesses or mounting hardware from the old part.",
            f"Install the new {part['name']} ({part['mfr_number']}) by reversing the removal steps.",
            f"Restore power and test to confirm the repair is successful.",
        ]

    # Infer estimated time and tools from step content
    step_text = " ".join(steps).lower()
    if "30 min" in step_text or "30 minutes" in step_text:
        estimated_time = "~30 minutes"
    elif "15 min" in step_text:
        estimated_time = "~15 minutes"
    elif "5 min" in step_text:
        estimated_time = "~5 minutes"
    elif len(steps) <= 4:
        estimated_time = "~5–10 minutes"
    elif len(steps) <= 7:
        estimated_time = "~15–30 minutes"
    else:
        estimated_time = "~30–60 minutes"

    tools_needed: list[str] = []
    if "screwdriver" in step_text:
        tools_needed.append("Screwdriver (Phillips or Torx)")
    if "pliers" in step_text:
        tools_needed.append("Pliers")
    if "wrench" in step_text:
        tools_needed.append("Adjustable wrench")
    if "multimeter" in step_text:
        tools_needed.append("Multimeter")
    if not tools_needed and "no tools" in step_text:
        tools_needed = []

    return {
        "part_number": part["ps_number"],
        "part_name": part["name"],
        "steps": steps,
        "estimated_time": estimated_time,
        "tools_needed": tools_needed,
    }


async def search_parts_by_symptom(appliance_type: str, symptom: str) -> dict:
    """Find likely parts based on a symptom description."""
    appliance_type = appliance_type.lower().strip()
    if appliance_type not in ("refrigerator", "dishwasher"):
        appliance_type = "refrigerator"

    # Layer 1: ChromaDB semantic search
    if vector_store.is_ready():
        semantic_hits = vector_store.query_vector_store(
            query_text=symptom,
            appliance_type=appliance_type,
            n_results=3,
            doc_type="symptom",
        )
        if semantic_hits:
            best = semantic_hits[0]
            meta = best["metadata"]
            try:
                likely_ps_numbers: list[str] = json.loads(meta.get("likely_parts", "[]"))
            except (json.JSONDecodeError, TypeError):
                likely_ps_numbers = []
            repair_guidance: str = meta.get("repair_guidance", "")

            # Fill repair_guidance from DB if missing in vector metadata
            if not repair_guidance:
                db_symptoms = get_symptoms_by_keywords(symptom, appliance_type)
                if db_symptoms:
                    repair_guidance = db_symptoms[0].get("repair_guidance", "")

            parts = get_parts_by_ps_numbers(likely_ps_numbers)
            if parts:
                parts = await resolve_parts_urls(parts)
                return {
                    "appliance_type": appliance_type,
                    "symptom": symptom,
                    "diagnosed_parts": [
                        {
                            "part": p,
                            "likelihood": _likelihood(i),
                            "reason": _part_reason(p, i, {"symptom_description": symptom}),
                        }
                        for i, p in enumerate(parts)
                    ],
                    "repair_guidance": repair_guidance,
                    "safety_note": "Always unplug your appliance before beginning any repair.",
                }

    # Layer 2: keyword search on symptoms table
    matched_symptoms = get_symptoms_by_keywords(symptom, appliance_type)

    if not matched_symptoms:
        # Layer 3: keyword search on parts table
        parts = search_parts_by_keywords(symptom, appliance_type)[:5]
        parts = await resolve_parts_urls(parts)
        return {
            "appliance_type": appliance_type,
            "symptom": symptom,
            "diagnosed_parts": [
                {
                    "part": p,
                    "likelihood": _likelihood(i),
                    "reason": f"This part matches your description of '{symptom}'.",
                }
                for i, p in enumerate(parts)
            ],
            "repair_guidance": (
                "We found related parts based on your description. "
                "If the problem persists after replacement, consult a certified technician."
            ),
            "safety_note": "Always unplug your appliance before beginning any repair.",
        }

    top_symptom = matched_symptoms[0]
    likely_ps_numbers = top_symptom.get("likely_parts", [])
    parts = get_parts_by_ps_numbers(likely_ps_numbers)
    parts = await resolve_parts_urls(parts)

    return {
        "appliance_type": appliance_type,
        "symptom": symptom,
        "diagnosed_parts": [
            {
                "part": p,
                "likelihood": _likelihood(i),
                "reason": _part_reason(p, i, top_symptom),
            }
            for i, p in enumerate(parts)
        ],
        "repair_guidance": top_symptom.get("repair_guidance", ""),
        "safety_note": "Always unplug your appliance before beginning any repair.",
    }


def _part_reason(part: dict, index: int, symptom: dict) -> str:
    descriptions = {
        0: f"{part['name']} is the most common cause of this problem and should be checked first.",
        1: f"{part['name']} is another possible cause — check this if replacing the first part does not solve the issue.",
        2: f"{part['name']} is a less common but possible cause worth checking if other repairs haven't helped.",
    }
    return descriptions.get(index, f"{part['name']} may be related to this problem.")


async def get_parts_for_model_tool(model_number: str, category: str | None = None) -> dict:
    """Return compatible parts for a given model, optionally filtered by category."""
    model = get_model_info(model_number)
    parts = get_parts_for_model(model_number, category)

    # Scraping fallback: model not in local DB — scrape the model page to find
    # compatible PS numbers, then look up / scrape each one.
    if not parts:
        try:
            scraped_model = await scrape_model_page(model_number)
            if scraped_model.get("error") != "scrape_failed":
                if not model:
                    model = scraped_model
                ps_numbers = scraped_model.get("compatible_ps_numbers", [])[:5]
                for ps_num in ps_numbers:
                    part = get_part_by_number(ps_num)
                    if part is None:
                        part = await scrape_part(ps_num)
                        if part.get("error") != "scrape_failed":
                            cache_scraped_part(part)
                            vector_store.upsert_part(part)
                    if part and part.get("error") != "scrape_failed":
                        if not category or part.get("category") == category:
                            parts.append(part)
        except Exception as exc:
            logger.warning("Model scrape fallback failed for %s: %s", model_number, exc)

    return {
        "model_number": model_number,
        "brand": model["brand"] if model else "",
        "appliance_type": model["appliance_type"] if model else "",
        "description": model["description"] if model else "",
        "parts": parts,
        "total_count": len(parts),
    }


async def get_order_status(order_id: str) -> dict:
    """Look up an order by ID and return its status."""
    order = get_order_by_id(order_id.strip())
    if order is None:
        return {
            "order_id": order_id,
            "status": "not_found",
            "estimated_delivery": "",
            "tracking_number": "",
            "items": [],
            "message": (
                f"Order #{order_id} was not found. "
                f"Please check the order number and try again, or contact PartSelect "
                f"support at 1-888-738-4871."
            ),
        }
    return order


async def search_parts(query: str, appliance_type: str | None = None) -> dict:
    """Search for parts by keyword, optionally filtered by appliance type."""
    parts = search_parts_by_keywords(query, appliance_type)

    # Live scraping fallback: no local results — search PartSelect directly via Firecrawl.
    if not parts:
        try:
            search_query = f"{appliance_type} {query}" if appliance_type else query
            scraped = await search_parts_on_partselect(search_query, limit=4)
            for part in scraped:
                cache_scraped_part(part)
                vector_store.upsert_part(part)
            parts = scraped
        except Exception as exc:
            logger.warning("search_parts Firecrawl fallback failed for '%s': %s", query, exc)

    # Ensure all parts have valid canonical URLs (fixes short-form .htm URLs in DB)
    parts = await resolve_parts_urls(parts)

    return {
        "query": query,
        "parts": parts,
        "total_count": len(parts),
    }


# ---------------------------------------------------------------------------
# Claude tool_use schemas (used by Phase 4 orchestrator)
# ---------------------------------------------------------------------------

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "get_part_details",
        "description": (
            "Look up a specific part by its PartSelect number (PSxxxxxxx) or manufacturer "
            "part number. Returns name, price, stock status, description, and install steps. "
            "Use this when the user provides any kind of part number."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "part_number": {
                    "type": "string",
                    "description": "The PS number (e.g. PS11752778) or manufacturer number (e.g. WPW10321304)",
                }
            },
            "required": ["part_number"],
        },
    },
    {
        "name": "check_compatibility",
        "description": (
            "Check whether a specific part is compatible with a given appliance model number. "
            "Returns a yes/no result with explanation. When not compatible, returns alternative "
            "parts that do fit the model. Use when the user asks if a part fits their appliance."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "part_number": {
                    "type": "string",
                    "description": "The PS number or manufacturer number of the part",
                },
                "model_number": {
                    "type": "string",
                    "description": "The appliance model number (e.g. WDT780SAEM1)",
                },
            },
            "required": ["part_number", "model_number"],
        },
    },
    {
        "name": "get_installation_guide",
        "description": (
            "Get step-by-step installation instructions for a specific part. "
            "Returns numbered steps, estimated time, and required tools. "
            "Use when the user asks how to install a part."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "part_number": {
                    "type": "string",
                    "description": "The PS number or manufacturer number of the part",
                }
            },
            "required": ["part_number"],
        },
    },
    {
        "name": "search_parts_by_symptom",
        "description": (
            "Find likely replacement parts based on an appliance problem description. "
            "Returns ranked parts with likelihood (most_likely / possible / less_likely) "
            "and repair guidance. Use when the user describes a symptom like "
            "'ice maker not working', 'dishwasher not draining', or 'fridge making noise'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "appliance_type": {
                    "type": "string",
                    "enum": ["refrigerator", "dishwasher"],
                    "description": "The type of appliance",
                },
                "symptom": {
                    "type": "string",
                    "description": "Natural language description of the problem",
                },
            },
            "required": ["appliance_type", "symptom"],
        },
    },
    {
        "name": "get_parts_for_model",
        "description": (
            "Get a list of compatible replacement parts for a specific appliance model number. "
            "Optionally filter by category (e.g. 'ice-maker', 'pump', 'door-bins'). "
            "Use when the user says 'what parts does my [model] need' or provides their model number."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "model_number": {
                    "type": "string",
                    "description": "The appliance model number",
                },
                "category": {
                    "type": "string",
                    "description": "Optional category filter (e.g. 'ice-maker', 'door-bins', 'pump', 'filter')",
                },
            },
            "required": ["model_number"],
        },
    },
    {
        "name": "get_order_status",
        "description": (
            "Look up the status of a customer order by order ID. "
            "Returns order status, estimated delivery date, tracking number, and items ordered."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "The order number (e.g. 12345)",
                }
            },
            "required": ["order_id"],
        },
    },
    {
        "name": "search_parts",
        "description": (
            "Search for parts using natural language keywords or part type descriptions. "
            "Use when the user asks for a part type without providing a specific number "
            "(e.g. 'water filter for my Whirlpool fridge', 'dishwasher spray arm')."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search keywords or part description",
                },
                "appliance_type": {
                    "type": "string",
                    "enum": ["refrigerator", "dishwasher"],
                    "description": "Optional appliance type filter",
                },
            },
            "required": ["query"],
        },
    },
]


# ---------------------------------------------------------------------------
# Dispatcher (used by Phase 4 orchestrator)
# ---------------------------------------------------------------------------

async def execute_tool(name: str, inputs: dict) -> dict:
    """Dispatch a tool call by name and return the result as a plain dict."""
    match name:
        case "get_part_details":
            return await get_part_details(inputs["part_number"])
        case "check_compatibility":
            return await check_compatibility(inputs["part_number"], inputs["model_number"])
        case "get_installation_guide":
            return await get_installation_guide(inputs["part_number"])
        case "search_parts_by_symptom":
            return await search_parts_by_symptom(inputs["appliance_type"], inputs["symptom"])
        case "get_parts_for_model":
            return await get_parts_for_model_tool(
                inputs["model_number"], inputs.get("category")
            )
        case "get_order_status":
            return await get_order_status(inputs["order_id"])
        case "search_parts":
            return await search_parts(inputs["query"], inputs.get("appliance_type"))
        case _:
            return {"error": "unknown_tool", "tool": name}
