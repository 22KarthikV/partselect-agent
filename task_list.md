# PartSelect AI Agent — Task List
**Last updated:** 2026-05-13
**Deadline:** Thursday 2026-05-14 at 2:22 PM EDT

---

## ✅ COMPLETED — Phases 1–5

### Phase 1 — Backend Foundation
- [x] SQLite schema (`parts`, `models`, `compatibility`, `symptoms`)
- [x] `seed_data.json` — 60+ parts (30 refrigerator, 30 dishwasher), 17 models, compatibility mappings, symptoms
- [x] `backend/data/database.py` — all query functions
- [x] `backend/data/seed.py` — populates DB from JSON
- [x] `backend/agent/tools.py` — 7 tool handlers (`get_part_details`, `check_compatibility`, `get_installation_guide`, `search_parts_by_symptom`, `get_parts_for_model`, `get_order_status`, `search_parts`)
- [x] `backend/models/schemas.py` — Pydantic models + validation (`max_length`, `pattern`, `min_length`)
- [x] `backend/main.py` — FastAPI app with `/api/health`, `/api/part/{id}`, `/api/parts/search`

### Phase 2 — Semantic Search (ChromaDB)
- [x] `backend/data/vector_store.py` — ChromaDB init, embed, semantic query
- [x] 84 documents indexed (parts + symptoms) using `all-MiniLM-L6-v2` locally
- [x] `search_parts_by_symptom` tool wired to vector store

### Phase 3 — Live Scraper
- [x] `backend/agent/scraper.py` — httpx + BeautifulSoup4 scraper for PartSelect.com
- [x] DB-miss fallthrough in `get_part_details` → scraper → cache to SQLite

### Phase 4 — Agent Orchestrator
- [x] `backend/agent/prompts.py` — best-practice system prompt (persona + scope guard + tool directives + chain-of-thought + memory + style)
- [x] `backend/agent/llm_client.py` — provider abstraction (Anthropic primary, Gemini fallback), shared `ThreadPoolExecutor(max_workers=4)` singleton
- [x] `backend/agent/orchestrator.py` — async SSE generator, max 5 tool rounds, `_RICH_CONTENT_MAP`, dedup for repeated text blocks
- [x] `backend/main.py` — `POST /api/chat` StreamingResponse, `load_dotenv(override=True)`, `ApplianceType` enum on search endpoint
- [x] All 4 acceptance tests passing (install, compatibility, ice maker, scope guard)

### Phase 5 — Next.js Chat UI
- [x] `frontend/app/globals.css` — Tailwind v4 `@theme inline`, full teal token system, typing-dot keyframes
- [x] `frontend/app/layout.tsx` — PartSelect teal header, brand logo mark, online indicator
- [x] `frontend/app/page.tsx` — full-height chat layout
- [x] `frontend/app/api/chat/route.ts` — Next.js proxy to FastAPI SSE, `isValidChatBody()` type guard, 400/422 on bad input
- [x] `frontend/lib/types.ts` — complete discriminated union type system (`SSEEvent`, `UIMessage`, `RichCard`, all card data types)
- [x] `frontend/lib/api.ts` — `streamChat()` async generator, `generateId()` using `crypto.randomUUID()`
- [x] `frontend/components/ChatWidget.tsx` — `messagesRef` stale-closure fix, full SSE event handling, streaming state machine
- [x] `frontend/components/MessageBubble.tsx` — exhaustive switch renderer, composite keys, all types imported at file level
- [x] `frontend/components/InputBar.tsx` — React state focus ring, auto-resize textarea, Enter/Shift+Enter
- [x] `frontend/components/TypingIndicator.tsx` — aria-hidden dots, `aria-live="polite"` sr-only span
- [x] `frontend/components/ProductCard.tsx` — state-driven hover (no DOM mutations), image, price, stock, CTA
- [x] `frontend/components/CompatibilityBadge.tsx` — ✅/❌ with explanation
- [x] `frontend/components/InstallSteps.tsx` — numbered steps, estimated time, tools needed
- [x] `frontend/components/TroubleshootCard.tsx` — ranked parts with likelihood
- [x] `frontend/components/OrderStatusCard.tsx` — order ID, status, items
- [x] `frontend/components/ProductListCard.tsx` — list of parts from search
- [x] `npm run build` — zero TypeScript errors ✅

---

## ✅ COMPLETED — Phase 6: Polish + Demo Mode + README

### 6A. Demo Button in Header ✅
- `frontend/app/page.tsx` — converted to `"use client"`, Demo dropdown with 3 scenarios
- Clicking clears chat, clears `messagesRef`, and auto-sends the query via `sendMessage(textOverride)`
- Race-condition guard: demo effect is a no-op if `isStreaming` is true

### 6B. UX Polish ✅
- **Smooth scroll** — already implemented in `MessageList.tsx` (bottomRef + scrollIntoView)
- **Auto-focus** — `focusTrigger` state increments in `sendMessage` finally block → `InputBar` re-focuses
- **Offline banner** — health check on mount in `ChatWidget.tsx`, catches both network failures and non-2xx
- **Welcome screen** — already implemented in `MessageList.tsx` (4 suggestion chips when messages = [])

### 6C. README.md ✅
- Created `README.md` in project root — full evaluator guide, copy-paste setup, 3 demo queries, architecture diagram, tech stack table

### 6D. Scraper Hardened ✅
- `backend/agent/scraper.py` — 3 rotating User-Agents, `Referer` header, 3-attempt retry with backoff
- **Known limitation:** PartSelect uses Cloudflare JS rendering → HTTP 500 on live scrape. All demo parts are in SQLite seed so demos work perfectly. Scraper falls back gracefully.

---

## 🔜 NEXT SESSION — Phase 7: Deployment + End-to-End Validation

**Session goal:** Deploy to production and do a full end-to-end test of all 3 demo queries.

**Deadline:** 2026-05-14 at 2:22 PM EDT

### 7A. Deploy Backend → Railway.app
1. Push project to GitHub (init repo, commit all files, push)
2. Connect Railway to GitHub repo, set root directory to `backend/`
3. Set env vars in Railway dashboard: `ANTHROPIC_API_KEY`, `LLM_PROVIDER=anthropic`, `ALLOWED_ORIGINS=https://<vercel-url>.vercel.app`
4. Deploy and verify: `curl https://<railway-url>/api/health`

### 7B. Deploy Frontend → Vercel
1. Connect Vercel to GitHub repo, set root directory to `frontend/`
2. Set env var: `NEXT_PUBLIC_API_URL=https://<railway-url>.railway.app`
3. Deploy and verify the 3 demo queries work end-to-end in the browser

### 7C. Update ALLOWED_ORIGINS
- In Railway dashboard, update `ALLOWED_ORIGINS` to include the Vercel URL
- Redeploy backend if needed

### 7D. End-to-End Validation Checklist
- [ ] Ice maker diagnosis → TroubleshootCard renders with ranked parts
- [ ] Compatibility check → CompatibilityBadge renders ✅/❌
- [ ] Installation guide → InstallSteps card renders with numbered steps
- [ ] Scope guard works (try "what's the weather?")
- [ ] Demo button clears chat and auto-sends
- [ ] Offline banner shows when backend is down
- [ ] TypeScript build: `npm run build` passes with zero errors

---

## Architecture Quick Reference (for next session)

```
PartSelect Agent/
├── backend/                     # FastAPI + Python 3.11
│   ├── main.py                  # FastAPI entry: /api/chat (SSE), /api/health, /api/part/{id}
│   ├── agent/
│   │   ├── orchestrator.py      # Claude tool_use loop → SSE events
│   │   ├── llm_client.py        # Provider abstraction (Anthropic primary, Gemini fallback)
│   │   ├── tools.py             # 7 tool handlers + TOOL_SCHEMAS
│   │   ├── scraper.py           # httpx + BS4 scraper → SQLite cache
│   │   └── prompts.py           # System prompt (best-practice engineered)
│   ├── data/
│   │   ├── database.py          # SQLite queries (partselect.db)
│   │   ├── vector_store.py      # ChromaDB semantic search (84 docs, all-MiniLM-L6-v2)
│   │   └── seed_data.json       # 60 parts, 17 models, symptoms
│   └── models/schemas.py        # Pydantic models + input validation
│
└── frontend/                    # Next.js 16.2.6 (App Router, TypeScript, Tailwind v4)
    ├── app/
    │   ├── globals.css           # @theme inline teal tokens, typing-dot keyframes
    │   ├── page.tsx              # Full-height layout + teal header
    │   └── api/chat/route.ts     # Proxy → FastAPI SSE, isValidChatBody() guard
    ├── components/
    │   ├── ChatWidget.tsx        # State machine: messages, streaming, SSE events
    │   ├── MessageBubble.tsx     # Text + rich card renderer
    │   ├── InputBar.tsx          # Textarea + send button
    │   ├── TypingIndicator.tsx   # Animated dots + tool label
    │   ├── ProductCard.tsx       # Part image/price/stock/CTA
    │   ├── CompatibilityBadge.tsx
    │   ├── InstallSteps.tsx
    │   ├── TroubleshootCard.tsx
    │   ├── ProductListCard.tsx
    │   └── OrderStatusCard.tsx
    └── lib/
        ├── types.ts              # SSEEvent, UIMessage, RichCard, all data types
        └── api.ts                # streamChat() + generateId()
```

### SSE Event Contract
```
tool_call:    { type, tool, label, status }    — triggers TypingIndicator
rich_content: { type, content_type, data }     — renders a card below the text bubble
token:        { type, content }                — appended to current assistant bubble text
error:        { type, message }                — shown as error text in the bubble
done:         { type }                         — finalises the stream, stops TypingIndicator
```

### Key env vars
```
backend/.env:      ANTHROPIC_API_KEY, LLM_PROVIDER (default: anthropic), ALLOWED_ORIGINS
frontend/.env.local: NEXT_PUBLIC_API_URL (default: http://localhost:8000)
```

### Running locally
```bash
# Backend (from /backend, with venv activated)
uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend (from /frontend)
npm run dev
```
