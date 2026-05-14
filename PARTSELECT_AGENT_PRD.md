# PartSelect AI Chat Agent — Product Requirements Document
**For: Claude Code (plan mode first, then implement)**
**Deadline: Thursday May 14, 2026 at 2:22 PM EDT**
**Candidate: Karthik**

---

## 0. How to use this PRD with Claude Code

Read this entire document before generating any code. Work **phase by phase** — complete and verify each phase before starting the next. Each phase maps to a single Claude Code session to keep the context window clean. Never mix phases in one session.

When starting each phase, say: *"I am starting Phase [N]: [name]. Please read the relevant sections of the PRD and begin."*

---

## 1. Project Overview

Build an intelligent chat agent embedded on the **PartSelect.com** e-commerce site, scoped to **Refrigerator and Dishwasher parts only**. The agent must handle product discovery, compatibility checking, installation guidance, troubleshooting, and order support — all within a polished chat UI that matches PartSelect's teal branding.

### Evaluation criteria (from the brief)
1. **Interface design** — looks and feels native to PartSelect
2. **Agentic architecture** — multi-tool orchestration, not a simple RAG chatbot
3. **Extensibility and scalability** — the architecture must grow beyond the demo data
4. **Accuracy and efficiency** — the three example queries must be answered perfectly

### The three acceptance-test queries
| # | Query | Expected behaviour |
|---|---|---|
| 1 | "How can I install part number PS11752778?" | Step-by-step install guide for the door shelf bin (WPW10321304) |
| 2 | "Is this part compatible with my WDT780SAEM1 model?" | Compatibility check against the Whirlpool dishwasher model |
| 3 | "The ice maker on my Whirlpool fridge is not working. How can I fix it?" | Symptom → part diagnosis → recommended parts with links |

---

## 2. Technical Stack

### Frontend
- **Framework:** Next.js 16.2.6 (App Router, TypeScript)
- **Styling:** Tailwind CSS v4 + PartSelect brand tokens
- **Base:** Fresh `create-next-app` (NOT the CRA Instalily template — too outdated)
- **State:** React `useState` / `useReducer` for chat state, no external state library
- **Streaming:** `ReadableStream` / `fetch` with streaming response from backend

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **AI Orchestration:** `anthropic` Python SDK — Claude `tool_use` API (primary)
- **Primary model:** `claude-sonnet-4-5` (tool_use / function calling)
- **Fallback model:** `gemini-2.5-flash` via `google-genai` SDK — used if `ANTHROPIC_API_KEY` is not set
- **LLM abstraction:** A thin `LLMClient` wrapper in `agent/llm_client.py` so switching providers is one env-var change
- **Data layer 1:** SQLite via `sqlite3` (seed data — always available)
- **Data layer 2:** `httpx` + `BeautifulSoup4` (live PartSelect scraper — fallback enrichment)
- **Data layer 3:** ChromaDB (in-process vector store for semantic search)
- **Structured output:** `pydantic` models for all tool responses

### Dev & Deploy
- **Backend:** `uvicorn` locally, Railway.app for submission deploy
- **Frontend:** `npm run dev` locally, Vercel for submission deploy
- **Env vars:** `.env.local` (frontend), `.env` (backend) — never committed

---

## 3. Repository Structure

```
partselect-agent/
├── frontend/                          # Next.js 16.2.6 app
│   ├── app/
│   │   ├── layout.tsx                 # Root layout with PartSelect brand
│   │   ├── page.tsx                   # Main page (embeds chat widget)
│   │   ├── globals.css                # Tailwind + brand tokens
│   │   └── api/
│   │       └── chat/
│   │           └── route.ts           # Next.js route handler → proxies to FastAPI
│   ├── components/
│   │   ├── ChatWidget.tsx             # Main chat container
│   │   ├── MessageList.tsx            # Scrollable message thread
│   │   ├── MessageBubble.tsx          # Individual message (text + rich cards)
│   │   ├── InputBar.tsx               # Text input + send button
│   │   ├── ProductCard.tsx            # Part card (image, name, price, stock, CTA)
│   │   ├── CompatibilityBadge.tsx     # Yes/No compatibility result
│   │   ├── InstallSteps.tsx           # Numbered installation steps
│   │   ├── TroubleshootCard.tsx       # Symptom → parts diagnosis card
│   │   ├── OrderStatusCard.tsx        # Order lookup result
│   │   └── TypingIndicator.tsx        # "Agent is thinking..." with tool name
│   ├── lib/
│   │   ├── types.ts                   # Shared TypeScript types
│   │   └── api.ts                     # fetch wrapper for backend calls
│   ├── public/
│   │   └── partselect-logo.svg        # PartSelect logo (teal)
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   └── package.json
│
├── backend/
│   ├── main.py                        # FastAPI app entry point
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── orchestrator.py            # Core agent loop (Claude tool_use)
│   │   ├── llm_client.py              # Provider abstraction (Claude primary, Gemini fallback)
│   │   ├── tools.py                   # All tool definitions (schemas + handlers)
│   │   ├── scraper.py                 # Live PartSelect scraper (httpx + BS4)
│   │   └── prompts.py                 # System prompt + few-shot examples
│   ├── data/
│   │   ├── __init__.py
│   │   ├── database.py                # SQLite setup + queries
│   │   ├── vector_store.py            # ChromaDB setup + semantic search
│   │   ├── seed.py                    # Script to populate DB + vector store
│   │   └── seed_data.json             # The curated 60-part dataset
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py                 # Pydantic models for all responses
│   ├── requirements.txt
│   ├── .env.example
│   └── setup.sh                       # One-command setup script
│
├── README.md                          # Setup instructions for evaluators
└── .gitignore
```

---

## 4. Data Architecture (Three Layers)

This is the core differentiator. Explain this clearly in the Loom.

### Layer 1 — SQLite Seed Database (instant, zero-latency, demo-safe)

Pre-populated with curated data covering all demo scenarios:

**Tables:**
```sql
parts (
  ps_number TEXT PRIMARY KEY,   -- e.g. "PS11752778"
  mfr_number TEXT,              -- e.g. "WPW10321304"
  name TEXT,
  appliance_type TEXT,          -- "refrigerator" | "dishwasher"
  category TEXT,                -- "door-bins", "ice-maker", "pump", etc.
  price REAL,
  in_stock BOOLEAN,
  description TEXT,
  install_steps TEXT,           -- JSON array of step strings
  image_url TEXT,
  partselect_url TEXT
)

models (
  model_number TEXT PRIMARY KEY,  -- e.g. "WDT780SAEM1"
  brand TEXT,
  appliance_type TEXT,
  description TEXT
)

compatibility (
  ps_number TEXT,
  model_number TEXT,
  PRIMARY KEY (ps_number, model_number)
)

symptoms (
  id INTEGER PRIMARY KEY,
  appliance_type TEXT,
  symptom_keywords TEXT,        -- comma-separated for full-text search
  symptom_description TEXT,
  likely_parts TEXT,            -- JSON array of ps_numbers
  repair_guidance TEXT
)
```

**Seed data must include (minimum):**
- PS11752778 (door shelf bin) with full install steps and compatibility for 10+ models
- WDT780SAEM1 model record with 15+ compatible parts
- 5+ ice maker parts (Whirlpool refrigerators) with symptoms
- 30 refrigerator parts covering: door bins, ice makers, water filters, shelves, door gaskets, thermostats, compressors
- 30 dishwasher parts covering: drain pumps, spray arms, door latches, rack wheels, filters, heating elements, soap dispensers

### Layer 2 — Live PartSelect Scraper (real-time enrichment)

When a part number or model is not found in Layer 1, the scraper fires:

```python
# Target URLs:
# https://www.partselect.com/PS{number}-*.htm  (part detail)
# https://www.partselect.com/Models/{model}/   (model page)
```

**Scraper extracts:** name, price, in_stock, description, compatible_models, install_steps (from page content), image_url.

**After scraping:** result is cached into SQLite so subsequent queries are instant.

**Error handling:** If scraping fails (blocked, timeout, 404), the agent gracefully says "I found limited information about this part — here's what I know" and returns partial data. Never crash.

### Layer 3 — ChromaDB Semantic Search (symptom + natural language matching)

Embed all `symptom_description` and `part description` fields into ChromaDB at startup. Use `sentence-transformers` (`all-MiniLM-L6-v2`) for embeddings — this runs locally with no API cost and no rate limits, making it ideal for the seed process.

**Purpose:** When a user says "my fridge is making a loud humming noise and not cooling" — semantic search finds the right symptom cluster even when no exact keywords match.

**Collection:** `partselect_knowledge` — combined parts + symptoms

---

## 5. Agent Architecture

### System prompt (stored in `backend/agent/prompts.py`)

```
You are the PartSelect AI Assistant, a helpful expert for appliance parts.
You ONLY help with Refrigerator and Dishwasher parts available on PartSelect.com.
For any other topic, politely redirect: "I specialise in refrigerator and dishwasher 
parts — I'd be happy to help you with those!"

You have access to tools. ALWAYS use a tool before giving a final answer about:
- Part numbers, names, prices, or availability
- Model compatibility  
- Installation instructions
- Troubleshooting symptoms
- Order status

Be conversational, concise, and helpful. When showing parts, always include the 
price, stock status, and a direct link. Never make up part numbers or prices.

When a user provides a model number, remember it for the rest of the conversation.
```

### Tool definitions (in `backend/agent/tools.py`)

All tools return Pydantic-validated JSON. All tools must have clear descriptions — Gemini uses these to decide which tool to call.

```python
TOOLS = [
    {
        "name": "get_part_details",
        "description": "Look up a specific part by its PartSelect number (PSxxxxxxx) or manufacturer number. Returns name, price, stock status, description, and compatibility info.",
        "parameters": {
            "part_number": "string — the PS number (e.g. PS11752778) or manufacturer number"
        }
    },
    {
        "name": "check_compatibility",
        "description": "Check if a specific part is compatible with a given appliance model number. Returns yes/no with explanation.",
        "parameters": {
            "part_number": "string — PS number of the part",
            "model_number": "string — appliance model number (e.g. WDT780SAEM1)"
        }
    },
    {
        "name": "get_installation_guide",
        "description": "Get step-by-step installation instructions for a part. Returns numbered steps.",
        "parameters": {
            "part_number": "string — PS number of the part"
        }
    },
    {
        "name": "search_parts_by_symptom",
        "description": "Find likely replacement parts based on an appliance problem description. Use this when the user describes a symptom like 'ice maker not working' or 'dishwasher not draining'.",
        "parameters": {
            "appliance_type": "string — 'refrigerator' or 'dishwasher'",
            "symptom": "string — natural language description of the problem"
        }
    },
    {
        "name": "get_parts_for_model",
        "description": "Get a list of popular replacement parts for a specific appliance model number.",
        "parameters": {
            "model_number": "string — the appliance model number",
            "category": "string (optional) — filter by category like 'ice-maker', 'door', 'pump'"
        }
    },
    {
        "name": "get_order_status",
        "description": "Look up the status of a customer order by order ID.",
        "parameters": {
            "order_id": "string — the order number"
        }
    },
    {
        "name": "search_parts",
        "description": "Search for parts using natural language or keywords. Use when user asks for a part type without a specific number.",
        "parameters": {
            "query": "string — search query",
            "appliance_type": "string (optional) — 'refrigerator' or 'dishwasher'"
        }
    }
]
```

### LLM abstraction layer (`backend/agent/llm_client.py`)

This is the key architectural decision that makes the system provider-agnostic. It reads `LLM_PROVIDER` from env (defaults to `"anthropic"`) and exposes a single `async def chat(messages, tools, system) -> response` interface that both providers implement identically.

```python
# Usage is identical regardless of provider:
from agent.llm_client import LLMClient
client = LLMClient()  # reads LLM_PROVIDER from env
response = await client.chat(messages=messages, tools=TOOLS, system=SYSTEM_PROMPT)
```

### Orchestrator loop (`backend/agent/orchestrator.py`)

```python
async def run_agent(messages: list[dict], session_id: str) -> AsyncGenerator[str, None]:
    """
    Main agent loop using Claude tool_use (primary) or Gemini (fallback).
    Streams SSE events back to the FastAPI endpoint.
    
    Flow:
    1. Send conversation history + system prompt to Claude
    2. If response contains tool_use blocks: execute tools, append results, loop
    3. If response is text: stream tokens to frontend
    4. Max 5 tool call rounds per turn to prevent runaway loops
    """
```

### Claude tool_use implementation

```python
import anthropic

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# Claude tool_use — clean, reliable, well-documented
response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    system=SYSTEM_PROMPT,
    tools=TOOL_SCHEMAS,       # list of tool dicts with name/description/input_schema
    messages=conversation_history,
)

# Check response for tool use
for block in response.content:
    if block.type == "tool_use":
        # Execute the tool
        tool_result = await execute_tool(block.name, block.input)
        # Append tool result and loop
    elif block.type == "text":
        # Stream text to frontend
        yield f'data: {{"type": "token", "content": {json.dumps(block.text)}}}\n\n'
```

### Claude tool schema format

```python
TOOL_SCHEMAS = [
    {
        "name": "get_part_details",
        "description": "Look up a specific part by its PartSelect number (PSxxxxxxx) or manufacturer number. Returns name, price, stock status, description, and compatibility info.",
        "input_schema": {
            "type": "object",
            "properties": {
                "part_number": {
                    "type": "string",
                    "description": "The PS number (e.g. PS11752778) or manufacturer number"
                }
            },
            "required": ["part_number"]
        }
    },
    # ... all 7 tools in this format
]
```

---

## 6. API Endpoints

### `POST /api/chat`
Main streaming endpoint.

**Request:**
```json
{
  "messages": [
    {"role": "user", "content": "How do I install PS11752778?"},
  ],
  "session_id": "uuid-string"
}
```

**Response:** Server-Sent Events stream
```
data: {"type": "tool_call", "tool": "get_installation_guide", "status": "running"}
data: {"type": "token", "content": "Here are the installation steps"}
data: {"type": "token", "content": " for the door shelf bin:"}
data: {"type": "rich_content", "content_type": "install_steps", "data": {...}}
data: {"type": "done"}
```

### `GET /api/part/{ps_number}`
Direct part lookup (used by frontend for product cards).

### `GET /api/health`
Returns `{"status": "ok", "db": "connected", "vector_store": "ready"}` — used to verify the backend is running before the demo.

---

## 7. Frontend UX — What the Chat Must Do

### Visual design requirements
- **Brand colours:** PartSelect teal `#337778` as primary, white background, grey `#f5f5f5` for user bubbles
- **Font:** System font stack — no Google Fonts (faster load)
- **Logo:** PartSelect logo in the chat header
- **Widget style:** Full-page chat (not a floating bubble) — fills the viewport cleanly

### Rich message types (rendered inside the chat thread)

**ProductCard** — shown when a specific part is found:
```
┌─────────────────────────────────────┐
│ [Part Image]  WPW10321304           │
│               Door Shelf Bin        │
│               $47.40  ✓ In Stock   │
│               PS11752778            │
│  [View on PartSelect]  [Add to Cart]│
└─────────────────────────────────────┘
```

**CompatibilityBadge** — shown for compatibility checks:
```
┌─────────────────────────────────────┐
│ ✅ Compatible                        │
│ PS11752778 fits your WDT780SAEM1    │
│ Whirlpool Dishwasher                │
└─────────────────────────────────────┘
```

**InstallSteps** — numbered accordion:
```
Installation Guide: Door Shelf Bin
1. Remove the old bin by lifting upward...
2. Align the new bin with the door slots...
3. Press down firmly until it clicks...
⏱ Estimated time: 5 minutes  🔧 No tools needed
```

**TroubleshootCard** — symptom to parts:
```
Ice Maker Not Working — Possible Causes:
├── Ice Maker Assembly (PS11752778) — Most likely
├── Water Inlet Valve (PS11724432) — Check if no water
└── Ice Level Control Board (PS11742379) — If no signals
```

**TypingIndicator** — shown while agent is thinking:
```
● PartSelect Assistant
  Checking parts catalog...    ← shows current tool name
```

### Multi-turn memory behaviour
- If user says "my model is WDT780SAEM1" at any point, every subsequent answer should contextualise to that model without the user repeating it
- Frontend passes full conversation history to backend on every message

---

## 8. Scope Guard (Critical)

The agent must politely refuse off-topic queries. Examples to test:

| Query | Expected |
|---|---|
| "What's the weather?" | "I specialise in refrigerator and dishwasher parts — I can't help with that, but I'd be happy to help you find appliance parts!" |
| "Help me fix my washing machine" | "I currently specialise in refrigerators and dishwashers — for washing machine parts, please visit PartSelect.com directly!" |
| "What's the best refrigerator to buy?" | "I'm best at helping with parts and repairs rather than purchasing advice — is there a specific fridge you're trying to fix?" |

---

## 9. Phase-by-Phase Build Plan

### Phase 1 — Backend foundation (3–4 hours)
**Goal:** Working FastAPI server with database, seed data, and all tool handlers returning correct data.

Files to create:
- `backend/requirements.txt`
- `backend/.env.example`
- `backend/models/schemas.py` — all Pydantic models
- `backend/data/seed_data.json` — full curated dataset
- `backend/data/database.py` — SQLite setup + all query functions
- `backend/data/seed.py` — populates DB from JSON
- `backend/main.py` — FastAPI app with `/api/health` endpoint
- `backend/agent/tools.py` — all 7 tool handler functions (no AI yet, pure DB calls)

**Verify before moving on:**
```bash
cd backend && python data/seed.py  # should print "Seeded X parts, Y models, Z symptoms"
curl http://localhost:8000/api/health  # should return {"status": "ok"}
```

---

### Phase 2 — Semantic search layer (1–2 hours)
**Goal:** ChromaDB populated and returning relevant results for symptom queries.

Files to create/update:
- `backend/data/vector_store.py` — ChromaDB init, embed, query functions
- Update `backend/data/seed.py` — also populate ChromaDB after SQLite
- Update `backend/agent/tools.py` — `search_parts_by_symptom` now uses vector store

**Verify:**
```bash
# In Python REPL:
from data.vector_store import semantic_search
results = semantic_search("ice maker not working", appliance_type="refrigerator")
print(results)  # Should return relevant parts
```

---

### Phase 3 — Live scraper (1–2 hours)
**Goal:** When a part isn't in the DB, scrape PartSelect and cache it.

Files to create/update:
- `backend/agent/scraper.py` — full scraper implementation
- Update `backend/agent/tools.py` — `get_part_details` falls through to scraper on DB miss

**Verify:**
```bash
# Test with a part NOT in seed data:
curl "http://localhost:8000/api/part/PS11742379"
# Should return scraped data (or graceful fallback)
```

---

### Phase 4 — Agent orchestrator (2–3 hours)
**Goal:** Full Claude tool_use loop working, streaming to a test client.

Files to create/update:
- `backend/agent/prompts.py`
- `backend/agent/llm_client.py` — provider abstraction (Claude primary, Gemini fallback)
- `backend/agent/orchestrator.py` — full async streaming loop
- Update `backend/main.py` — add `POST /api/chat` streaming endpoint

**Claude tool_use syntax (use this exact pattern):**
```python
import anthropic

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    system=SYSTEM_PROMPT,
    tools=TOOL_SCHEMAS,
    messages=conversation_history,
)
```

**Gemini fallback syntax (when `LLM_PROVIDER=gemini`):**
```python
from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=messages,
    config=types.GenerateContentConfig(
        tools=tool_definitions,
        system_instruction=SYSTEM_PROMPT,
    )
)
```

**Verify — run all 3 acceptance test queries via curl:**
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "How can I install part number PS11752778?"}], "session_id": "test"}'
```
All 3 must return correct, tool-grounded answers before moving to Phase 5.

---

### Phase 5 — Frontend (3–4 hours)
**Goal:** Full Next.js chat UI, PartSelect branded, all rich card types rendering.

Files to create:
- All frontend files per structure in Section 3
- Brand tokens in `tailwind.config.ts`: `primary: "#337778"`, `primary-dark: "#285a5a"`

**Component build order:**
1. `ChatWidget.tsx` + `InputBar.tsx` + basic `MessageBubble.tsx` — get text chat working first
2. `TypingIndicator.tsx` — shows tool name while agent is thinking
3. `ProductCard.tsx` — most important rich card
4. `CompatibilityBadge.tsx`
5. `InstallSteps.tsx`
6. `TroubleshootCard.tsx`
7. `OrderStatusCard.tsx`

**Verify:** All 3 acceptance test queries work end-to-end in the browser with rich cards rendering.

---

### Phase 6 — Polish + demo mode (1 hour)
**Goal:** Make the Loom recording easy and impressive.

Add a "Demo" button in the chat header that pre-fills one of three demo scenarios and runs it automatically. This gives you a clean, rehearsable recording.

Demo scenarios:
1. Ice maker diagnosis → part recommendation → add to cart
2. Compatibility check for WDT780SAEM1
3. Installation guide for PS11752778

Also add:
- Smooth scroll to latest message
- Auto-focus on input after sending
- Error toast if backend is unreachable
- `README.md` with clear setup instructions for evaluators

---

## 10. Environment Variables

### Backend `.env`
```
# Primary LLM — Anthropic Claude
ANTHROPIC_API_KEY=your_key_from_console.anthropic.com
LLM_PROVIDER=anthropic           # Switch to "gemini" to use Gemini fallback

# Gemini fallback (only needed if LLM_PROVIDER=gemini)
GEMINI_API_KEY=your_key_from_ai.google.dev

# Data
DATABASE_URL=./partselect.db
CHROMA_PERSIST_PATH=./chroma_db
ALLOWED_ORIGINS=http://localhost:3000,https://your-vercel-url.vercel.app
```

### Frontend `.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 11. `requirements.txt`

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
# Primary LLM
anthropic>=0.40.0
# Fallback LLM
google-genai>=1.0.0
# Scraper
httpx==0.27.0
beautifulsoup4==4.12.3
# Vector store + local embeddings (no API cost)
chromadb==0.5.0
sentence-transformers==3.0.0
# Data + utils
pydantic==2.7.0
python-dotenv==1.0.1
aiofiles==23.2.1
```

---

## 12. Seed Data Spec (`seed_data.json`)

Must cover these parts at minimum (Claude Code generates realistic data for all):

### Refrigerator parts (30 total)
| PS Number | Mfr Number | Name | Category |
|---|---|---|---|
| PS11752778 | WPW10321304 | Door Shelf Bin | door-bins |
| PS11752309 | WPW10321302 | Upper Door Bin | door-bins |
| PS11724432 | WPW10498990 | Water Inlet Valve | water-system |
| PS11742379 | W10190965 | Ice Level Control Board | ice-maker |
| PS11752899 | W10873791 | Ice Maker Assembly | ice-maker |
| PS11756248 | W10295370 | Water Filter (EveryDrop 1) | water-filter |
| PS11722128 | EDR3RXD1 | Water Filter (EveryDrop 3) | water-filter |
| PS11744531 | W11396033 | Door Gasket | door-seal |
| PS11741776 | W10321304 | Crisper Drawer | crisper |
| PS11753382 | WPW10388414 | Defrost Thermostat | defrost |
| ... 20 more covering: compressors, fans, thermistors, shelves, drawers |

### Dishwasher parts (30 total)
| PS Number | Mfr Number | Name | Category |
|---|---|---|---|
| PS11750035 | WPW10195091 | Thermostat | thermostat |
| PS11744150 | WPW10348269 | Drain Pump | pump |
| PS11757106 | W11177741 | Door Seal/Gasket | door-seal |
| PS11756590 | W10712395 | Upper Rack Adjuster Kit | rack |
| PS11741512 | W10195416 | Lower Rack Wheel Assembly | rack |
| PS11745299 | WPW10491331 | Lower Spray Arm | spray-arm |
| PS11731570 | W10169313 | Detergent Dispenser | dispenser |
| PS11749051 | WP8194001 | Door Balance Link Kit | door |
| PS11745034 | WPW10498900 | Upper Spray Arm | spray-arm |
| PS11743462 | W10872845 | Filter Assembly | filter |
| ... 20 more covering: heating elements, float switches, control boards, door latches |

### Models (15 minimum)
Must include: WDT780SAEM1, WDF520PADM7, WDTA50SAHZ0 (dishwashers), WRS325SDHZ01, WRF535SWHZ00, WRS321SDHZ01, KRMF706ESS01 (refrigerators), plus 8 more across Maytag and KitchenAid.

### Compatibility mappings
- PS11752778 must be compatible with at least 15 refrigerator models
- WDT780SAEM1 must have at least 15 compatible parts seeded

### Symptoms (12 minimum)
| Appliance | Symptom | Likely Parts |
|---|---|---|
| refrigerator | ice maker not working | PS11752899, PS11724432, PS11742379 |
| refrigerator | not cooling | compressor, thermostat, evaporator fan |
| refrigerator | leaking water | water inlet valve, ice maker, door gasket |
| refrigerator | ice maker leaking | water inlet valve, ice maker |
| refrigerator | loud noise | evaporator fan, compressor |
| refrigerator | door not sealing | door gasket |
| dishwasher | not draining | drain pump, filter |
| dishwasher | not cleaning | spray arms, filter, pump |
| dishwasher | leaking | door seal, dispenser |
| dishwasher | door not latching | door latch, door balance |
| dishwasher | not drying | heating element, thermostat |
| dishwasher | error E1 | water inlet, float switch |

---

## 13. README for Evaluators

The `README.md` must allow an evaluator to run the project from scratch in under 5 minutes:

```markdown
# PartSelect AI Chat Agent

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- An Anthropic API key (console.anthropic.com) — OR a Google AI Studio key (ai.google.dev) as fallback

### Backend
cd backend
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY (or GEMINI_API_KEY + LLM_PROVIDER=gemini)
pip install -r requirements.txt
python data/seed.py
uvicorn main:app --reload --port 8000

### Frontend
cd frontend
cp .env.example .env.local
npm install
npm run dev

### Open http://localhost:3000
```

---

## 14. What "Extensible and Scalable" Means in Practice

The evaluators will ask: could this scale to all appliance types? Your architecture must make this obvious:

1. **Adding a new appliance type** (e.g. washing machines) = add rows to `parts`, `models`, `compatibility`, `symptoms` tables + update the scope guard. Zero code changes to the agent loop.

2. **Adding a new tool** (e.g. `get_video_tutorial`) = add one entry to `TOOLS` list in `tools.py` + implement the handler. The agent automatically learns to use it.

3. **Switching LLM providers** (e.g. Claude → Gemini → GPT-4) = change one env var `LLM_PROVIDER`. The `LLMClient` abstraction layer handles the rest. The tool schemas are provider-agnostic.

4. **Scaling the data** = the scraper layer means the agent is not limited to seed data. Any PartSelect part is queryable.

**State this explicitly in your Loom and slide deck.**

---

## 15. Claude Code Context Window Rules

To keep each Claude Code session focused and the context window clean:

1. **One phase per session.** Never ask Claude Code to do Phase 1 and Phase 2 in the same session.
2. **Start each session by pasting** only the relevant phase section from this PRD + the file structure from Section 3.
3. **After each file is generated**, ask Claude Code to verify it compiles/runs before moving to the next file.
4. **For the seed data** (Phase 1), ask Claude Code to generate `seed_data.json` in one dedicated step — it's large and needs full attention.
5. **Never ask Claude Code to "fix everything"** — isolate bugs to specific files and fix one at a time.
6. **Checkpoint command after each phase:**
   ```
   "Summarise what was built in this phase, what files were created, 
   and what the verify command output was."
   ```
   Save this summary. Use it as context when starting the next phase.

---

## 16. Loom Video Script (5 minutes)

Structure your Loom recording around this narrative:

**0:00–0:30 — The problem** 
"PartSelect has millions of parts. Finding the right one, checking if it fits your specific model, and knowing how to install it — that's what trips customers up. I built an AI agent that handles all of this conversationally."

**0:30–1:30 — Demo query 1: Installation**
Type: *"How can I install part number PS11752778?"*
Show: The typing indicator showing "Looking up part..." then "Getting installation guide...", then the step-by-step install card rendering.

**1:30–2:30 — Demo query 2: Compatibility**
Type: *"My dishwasher model is WDT780SAEM1 — is this part compatible?"*
Show: The compatibility badge appearing, the model being remembered for subsequent turns.

**2:30–3:30 — Demo query 3: Symptom diagnosis**
Type: *"The ice maker on my Whirlpool fridge is not working"*
Show: The troubleshoot card appearing with ranked likely causes and product cards.

**3:30–4:30 — Architecture walkthrough**
Show: The code briefly — 3-layer data architecture, tool definitions, orchestrator loop.
Say: "The agent isn't limited to these parts — if you ask about a part not in my seed data, it scrapes PartSelect live and caches it. And adding new appliance types is a data change, not a code change."

**4:30–5:00 — Wrap**
"The three things I optimised for: accuracy through real data and tool grounding, UX through rich inline cards, and extensibility through a clean layered architecture."
