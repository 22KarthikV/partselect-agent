# PartSelect AI Chat Agent

An intelligent chat agent for the PartSelect.com e-commerce platform, scoped to **Refrigerator and Dishwasher parts only**. It handles product discovery, compatibility checking, installation guidance, symptom-based troubleshooting, and order lookup — all through a polished streaming chat UI that matches PartSelect's teal branding.

## What makes it impressive

- **3-layer data architecture** — SQLite seed database (instant, zero-latency) → live PartSelect scraper (real-time enrichment for unknown parts) → ChromaDB semantic search (symptom matching via local embeddings)
- **True agentic loop** — Claude `tool_use` API with up to 5 tool rounds per turn, not a simple RAG chatbot
- **SSE streaming** — tokens stream to the UI in real-time as Claude reasons
- **Rich inline cards** — ProductCard, CompatibilityBadge, InstallSteps, TroubleshootCard rendered inside the chat thread
- **Extensible by design** — adding a new appliance type = adding rows to the DB; adding a new tool = one function + one entry in `TOOL_SCHEMAS`; switching LLM provider = one env var

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- An **Anthropic API key** from [console.anthropic.com](https://console.anthropic.com) (primary)
- OR a **Google AI Studio key** from [ai.google.dev](https://ai.google.dev) as Gemini fallback

---

## Setup

### 1. Backend

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY (or GEMINI_API_KEY + LLM_PROVIDER=gemini)

# Seed the database and vector store (~60 parts, 17 models, 84 ChromaDB docs)
python data/seed.py

# Start the API server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Verify it's running:
```bash
curl http://localhost:8000/api/health
# {"status":"ok","db":"connected","vector_store":"ready"}
```

### 2. Frontend

```bash
cd frontend

npm install

# Optional: override the API URL (defaults to http://localhost:8000)
# cp .env.example .env.local

npm run dev
```

Open **http://localhost:3000**

---

## Demo Queries

Use the **"Try a Demo"** button in the header to auto-send any of these, or type them manually:

| # | Query | Expected response |
|---|-------|-------------------|
| 1 | `The ice maker on my Whirlpool fridge is not working. How can I fix it?` | Symptom diagnosis → ranked parts with likelihood ratings |
| 2 | `Is part PS11752778 compatible with my WDT780SAEM1?` | Compatibility badge (✅/❌) with explanation |
| 3 | `How can I install part number PS11752778?` | Step-by-step installation card with estimated time |

---

## Architecture

```
User message
     │
     ▼
Next.js Chat UI (SSE streaming)
     │  POST /api/chat
     ▼
FastAPI endpoint
     │
     ▼
Agent Orchestrator (Claude tool_use loop, max 5 rounds)
     │
     ├── get_part_details ──────► Layer 1: SQLite (seed + scraper cache)
     │                            Layer 2: Live scraper (httpx + BS4, on DB miss)
     │
     ├── search_parts_by_symptom ► Layer 3: ChromaDB semantic search
     │                             (84 docs, all-MiniLM-L6-v2, local embeddings)
     │
     ├── check_compatibility ───► SQLite compatibility table
     ├── get_installation_guide ► SQLite install_steps JSON
     ├── get_parts_for_model ───► SQLite + compatibility join
     ├── search_parts ──────────► SQLite keyword search
     └── get_order_status ──────► SQLite orders table
```

### SSE event contract

```
tool_call:    { type, tool, label, status }    → TypingIndicator label
rich_content: { type, content_type, data }     → renders a card below the text
token:        { type, content }                → appended to streaming bubble
error:        { type, message }                → shown as error in bubble
done:         { type }                         → finalises stream
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.2.6 (App Router, TypeScript), Tailwind CSS v4 |
| Backend | FastAPI (Python 3.11), Uvicorn |
| Primary LLM | Claude Sonnet via Anthropic `tool_use` API |
| Fallback LLM | Gemini 2.5 Flash via `google-genai` SDK |
| Data layer 1 | SQLite (seed data — 60 parts, 17 models, 12 symptoms) |
| Data layer 2 | httpx + BeautifulSoup4 (live PartSelect scraper) |
| Data layer 3 | ChromaDB + sentence-transformers `all-MiniLM-L6-v2` |
| Validation | Pydantic v2 |

---

## Environment Variables

### `backend/.env`

```
ANTHROPIC_API_KEY=sk-ant-...          # Primary LLM
LLM_PROVIDER=anthropic                # "anthropic" | "gemini"
GEMINI_API_KEY=                       # Only needed if LLM_PROVIDER=gemini
DATABASE_URL=./partselect.db
CHROMA_PERSIST_PATH=./chroma_db
ALLOWED_ORIGINS=http://localhost:3000
```

### `frontend/.env.local`

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Extensibility

1. **New appliance type** (e.g. washing machines) — add rows to `parts`, `models`, `compatibility`, `symptoms` tables + update the scope guard in `prompts.py`. Zero code changes to the agent loop.
2. **New tool** (e.g. `get_video_tutorial`) — add one entry to `TOOL_SCHEMAS` in `tools.py` + implement the handler. Claude learns to use it automatically.
3. **Switch LLM provider** — change `LLM_PROVIDER` env var. The `LLMClient` abstraction handles the rest.
4. **Scale data** — the scraper layer means the agent isn't limited to seed data. Any PartSelect part number is queryable.

---

## Project Structure

```
PartSelect Agent/
├── backend/
│   ├── main.py                  # FastAPI: /api/chat (SSE), /api/health, /api/part/{id}
│   ├── agent/
│   │   ├── orchestrator.py      # Claude tool_use loop → SSE events
│   │   ├── llm_client.py        # Provider abstraction (Anthropic / Gemini)
│   │   ├── tools.py             # 7 tool handlers + TOOL_SCHEMAS
│   │   ├── scraper.py           # httpx + BS4 live scraper → SQLite cache
│   │   └── prompts.py           # System prompt (scope guard, tool directives)
│   ├── data/
│   │   ├── database.py          # SQLite queries (partselect.db)
│   │   ├── vector_store.py      # ChromaDB semantic search (84 docs)
│   │   └── seed_data.json       # 60 parts, 17 models, 12 symptoms
│   └── models/schemas.py        # Pydantic models + input validation
│
└── frontend/
    ├── app/
    │   ├── globals.css           # Tailwind v4 @theme inline teal tokens
    │   ├── page.tsx              # Header + Demo dropdown + ChatWidget
    │   └── api/chat/route.ts    # Next.js proxy → FastAPI SSE
    └── components/
        ├── ChatWidget.tsx        # SSE state machine, demo trigger, health check
        ├── MessageBubble.tsx     # Text + rich card renderer
        ├── ProductCard.tsx       # Part image / price / stock / CTA
        ├── CompatibilityBadge.tsx
        ├── InstallSteps.tsx
        ├── TroubleshootCard.tsx
        ├── ProductListCard.tsx
        └── OrderStatusCard.tsx
```
