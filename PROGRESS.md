# Capsule — Progress

## Current Status
Done/Delete split complete. Today tab has Scheduled/Pending sections with inline circle-done. Deleted bin with 30-day countdown. Build passes clean.

---

## How to Run

**Backend:**
```bash
cd backend
CLAUDE_PLUGIN_ROOT=~/.claude/plugins/cache/everything-claude-code/everything-claude-code/1.9.0 .venv/bin/uvicorn app.main:app --reload
# runs on http://localhost:8000
```

**Frontend:**
```bash
cd frontend
npm run dev
# runs on http://localhost:3000
```

---

## Folder Structure

```
capsule/
├── backend/
│   └── app/
│       ├── main.py              ← FastAPI entry, lifespan, CLAUDE_PLUGIN_ROOT check, db.init()
│       ├── routes/
│       │   └── chat.py          ← POST /chat SSE + state machine (AWAITING_CAPTURE/CONFIRMATION/CLASSIFICATION)
│       ├── agents/
│       │   ├── capsule.py       ← (legacy, kept for reference)
│       │   ├── responder.py     ← Claude Agent SDK streaming (renamed from capsule.py)
│       │   ├── classifier.py    ← classify_intent() via anthropic SDK → ClassificationResult
│       │   └── bucket_session.py ← BucketSession.store() → SQLite + ack string
│       └── storage/
│           └── db.py            ← init(), save_capture(), get_recent()
│   ├── data/
│   │   └── capsule.db           ← SQLite (in .gitignore)
│   ├── tests/
│   │   ├── test_classifier.py   ← 11 unit tests
│   │   ├── test_db.py           ← 7 unit tests
│   │   ├── test_bucket_session.py ← 3 unit tests
│   │   └── test_chat.py         ← 8 integration tests (state machine)
│   ├── requirements.txt         ← fastapi==0.115.12, anthropic, pytest, pytest-asyncio, httpx
│   └── pytest.ini
├── frontend/
│   ├── app/
│   │   └── page.tsx             ← Main chat page
│   ├── components/
│   │   └── chat/
│   │       ├── MessageList.tsx
│   │       ├── MessageBubble.tsx
│   │       └── InputBar.tsx
│   ├── hooks/
│   │   └── useChat.ts           ← Streaming state management
│   ├── lib/
│   │   └── api.ts               ← fetch calls to backend
│   └── next.config.ts           ← Proxies /api/* → localhost:8000
├── .claude/
│   └── rules/
│       ├── session.md           ← Session end + manual sync protocol
│       ├── docs.md              ← Documentation sync rules
│       └── refactor.md         ← Refactor protocol
├── .gitignore
├── IDEA.md                      ← Original concept and use cases (don't edit casually)
└── PROGRESS.md                  ← This file — single source of truth
```

---

## What's Pending

1. **Verify end-to-end** — start both servers, confirm Next.js chat UI talks to FastAPI + Claude
2. **Intent classifier** — Claude classifies input into: `todo`, `to_know`, `idea`, `calendar`, `briefing`
3. **Bucket routing** — each bucket gets its own `ClaudeSDKClient` session with memory
4. **Storage** — persist items per bucket (SQLite or JSON files)
5. **Tabs UI** — To Do / To Know / To Learn tabs in the frontend
6. **Specialist agents** — `AgentDefinition` subagents for calendar, knowledge compiler, note organizer
7. **MCP integration** — connect external apps as MCP servers for extensible actions
8. **Authentication** — password / biometric gate for actions
9. **Multimodal input** — image and audio support
10. **Docker** — containerize once stable

---

## Architecture Decisions

| Date | Decision | Choice | Reason |
|---|---|---|---|
| 2026-04-01 | Frontend | Plain HTML/JS | No framework overhead to start |
| 2026-04-01 | Backend | FastAPI + uvicorn | Lightweight, async, Python-native |
| 2026-04-01 | Streaming | SSE | Simple, no WebSocket overhead needed |
| 2026-04-01 | Agent SDK | Python (`claude-agent-sdk`) | Matches backend language |
| 2026-04-01 | Storage | TBD | Leaning SQLite or JSON files |
| 2026-04-01 | Docker | Deferred | Add when ready to deploy |
| 2026-04-01 | Frontend (revised) | Next.js + TypeScript + Tailwind | Scales better for tabs, auth, state |
| 2026-04-01 | Architecture | Next.js proxies to FastAPI | No CORS, clean separation, backend stays Python |
| 2026-04-01 | Agent location | Backend only | Agents need file/shell/API access — not browser |
| 2026-04-02 | Taxonomy | `to_X` type system | Action-oriented (what to DO) beats content-oriented (what IS this) |
| 2026-04-02 | Classification UX | Silent + summary-only confirmation | User never sees internal type — AI decides, user confirms summary |
| 2026-04-02 | Output views | Calendar + To-Dos as filtered renders | Views are projections of rich typed store, not separate buckets |
| 2026-04-02 | Completion | `CompletionType` enum drives behavior | State machine/views are type-agnostic — extensible without rewrites |
| 2026-04-02 | v1 code | Archived to `archive/v1` branch | Fresh start on v2 design |
| 2026-04-02 | SDK split | `anthropic` SDK for capture layer, `claude-agent-sdk` for mind palace | Capture = deterministic pipeline (structured JSON out); Mind palace = open-ended agent with SQLite tools. Rule: if the agent decides what to look at next → Agent SDK. If it processes fixed input → direct SDK. |

---

## Session Log

### 2026-04-03 (Session 11)
**Completed:**
- **Office hours design doc** — ran full `/office-hours` session for "Today" page (Todos + Timeline merge). Produced design doc at `~/.gstack/projects/duncanchang38-capsule/duncan-main-design-20260403-230638.md`. Multiple adversarial review passes (5 → 6 → 7/10). Resolved: SQL OR precedence, planToday UI gap, Library nav spec, SSR null state, SQLite UTC timezone, all-clear trigger, Done for today button placement.
- **Today page** (`/today`) — Morning/Evening auto-mode (`getHours() < 17`), manual override toggle. Morning: "Today" section (calendar events + items planned for today) + "Carry in" (max 5 floating items). Evening: "Captured today" + "Still floating" + stats line + "Done for today" button. Full streak integration.
- **Card editor** (`/captures/[id]`) — full-screen markdown editor per capture. Edit/preview toggle. Auto-save on 800ms debounce. Per-type placeholder text.
- **AI Organize** — `POST /captures/{id}/organize` calls Claude with per-type system prompts. to_learn → Key Ideas/Quotes/Questions. to_cook → Core Insight/Opportunity/Next Actions. to_hit → Sub-tasks checklist. to_know → Answer/Evidence/Follow-up. Replaces notes in DB and returns to editor.
- **Library page** (`/library`) — Ideas + Reading + Archive sections, anchor nav, `✦` indicator on captures with notes. Replaces separate /ideas, /reading, /organize pages.
- **Nav** — 7 items → 3 (Today · Calendar · Library).
- **Redirects** — `/todos` + `/timeline` → `/today`, `/ideas` + `/reading` + `/organize` → `/library`.
- **DB migration** — `notes TEXT` column added (ALTER TABLE if missing, safe on existing data).

**Build:** `npm run build` passes clean. 11 routes.

**Gotchas:**
- `metadata.author` is `unknown` type — needs `typeof x === "string"` guard before rendering in JSX, not just `as string` cast.
- `GET /captures/{capture_id}` route must be declared before `GET /captures` in FastAPI or it never matches (FastAPI routes match in order).

**Next:** User test with 2 friends for 1 week. Instrument manual toggle rate + evening review completion. Decide on Approach B (full redesign) based on data.

### 2026-04-06 (Session 13)
**Completed:**
- **Instagram-style handle system** — stable internal UUID + mutable `@handle` lookup key. `user_handle_history` table enforces 14-day lock on released handles (impersonation prevention). 14-day change cooldown. `PATCH /auth/handle`, `GET /auth/check` endpoints. Lazy purge of expired locks inside `claim_handle()`.
- **Registration form overhaul** — `noValidate` removes browser native popups. Inline `FieldState` errors with red/green border feedback. 500ms debounced uniqueness checks for email + handle (promise refs so submit can `await` them). Password validation: ≥8 chars + letter + number. Handle input auto-strips invalid chars. Fixed `@{handle}` template literal bug.
- **Nav hidden on auth pages** — `AUTH_PATHS = new Set(["/login", "/reset-password"])`, Nav returns null on those routes.
- **Recently viewed sidebar** — `useRecentViews` hook (localStorage, max 10, user-scoped by session). `RecentViewsSidebar` hover panel pinned to right edge. Mobile: tap backdrop to close. Shows type dot, topic, 60-char summary, relative time.
- **Activity streak + status bar** — replaced `useReviewStreak` (buggy localStorage, not user-scoped) with backend-driven `GET /captures/stats?today=YYYY-MM-DD`. Returns `{streak, captured_today, completed_today, deferred_today}`. Streak computed from actual `captures.created_at` per user, consecutive days ending today or yesterday. `useActivityStats` hook fetches on mount. TabBar shows streak pill + status bar row (`3 captured · 2 done · 1 deferred`). Removed "Mark daily review done" button.
- **Backend DB retry** — 10-attempt exponential backoff in `db.init()` for Railway Postgres startup timing.
- **Vercel BACKEND_URL fix** — trailing `\n` from `echo` caused all proxy calls to fail. Fixed via `printf` + redeployed.

**Files changed (key):**
- `backend/app/storage/db.py` — handle system, `get_activity_stats()`, `_compute_streak()`
- `backend/app/routes/auth.py` — register/handle/check endpoints
- `backend/app/routes/captures.py` — `GET /captures/stats`
- `frontend/app/login/page.tsx` — full form rewrite
- `frontend/components/Nav.tsx` — hide on auth pages
- `frontend/hooks/useActivityStats.ts` — new
- `frontend/hooks/useReviewStreak.ts` — deprecated (still exists, replaced in today page)
- `frontend/hooks/useRecentViews.ts` — new
- `frontend/components/RecentViewsSidebar.tsx` — new
- `frontend/app/today/page.tsx` — activity stats, no review button
- `frontend/lib/api.ts` — `ActivityStats`, `getActivityStats()`

**Gotchas:**
- Promise refs (`emailCheckPromise`, `handleCheckPromise`) resolve to `boolean` (available), not state — avoids stale closure after `await Promise.all([...])` in submit handler.
- `GET /captures/stats` must be declared before `GET /captures/{capture_id}` in FastAPI or "stats" matches as a capture ID.
- `_compute_streak` — streak is alive if last activity was today OR yesterday; breaks if 2+ days ago.

**Pending:**
- Login page tagline "your personal AI intake layer" flagged as weak/cold — replacement TBD
- `RESEND_API_KEY` and `APP_URL` needed on Railway for forgot-password emails to actually send

**Next:** UI polish pass, email flow testing, invite friends for testing

### 2026-04-05 (Session 12)
**Completed:**
- **Classifier hallucination fix** — bare URL pre-processing guard in `classifier.py`: bare URLs bypass AI entirely, always return `to_learn` with raw URL as summary. Added CRITICAL rule to SYSTEM_PROMPT: "A URL is ALWAYS to_learn, never to_know." Eliminated "What is the capital of Bhutan?" hallucination on Instagram links.
- **Jina full content extraction** — `_fetch_page_title_jina` now returns `(title, content_snippet)` tuple. Scraped content (≤2000 chars) is injected into the AI enrichment prompt as `--- Scraped page content ---` section. AI now works from real page text, not just URL domain.
- **HTML meta extraction** — `_TitleParser` now extracts `og:description` and `name="description"` alongside `og:title`. `_fetch_page_title_html` returns `(title, description)` tuple.
- **Social URL fix** — Removed Instagram (and most platforms) from `_OPAQUE_SOCIAL_DOMAINS`. Only `twitter.com` and `x.com` remain (truly JS-rendered). Instagram returns full post content via og:title/og:description to plain curl.
- **og:title length guard** — Titles >120 chars demoted to `page_content` (AI input) not `page_title` (display). Handles Instagram captions that are full post text.
- **Social attribution stripping** — `_SOCIAL_ATTRIBUTION_RE` strips "Username on Instagram: '" prefix from og:title before display.
- **URL-only fallback** — Opaque social early-return and general fallback both use raw URL instead of platform name label (e.g. "Instagram Post").
- **Frontend: bare URL H1 fix** — `buildEditorContent` now detects H1 containing only a bare URL (via `_headingText` + `_isBareUrl`) and replaces it with enriched summary. Fixes LangChain blog showing link as doc title.
- **Delayed re-fetch** — `useCaptures` re-fetches 3.5s after mount to pick up async enrichment results without manual refresh.
- **Bug fix: `db.update_summary` not called for enriched_topic-only case** — When enrichment has a concise AI topic but no fetchable page_title (404, SPA, timeout), summary column was staying as raw URL. Fixed: `elif enriched_topic and enriched_topic != url: db.update_summary(capture_id, enriched_topic)`.

**Gotchas:**
- Instagram og:title is often the full post caption (1700+ chars). Must demote to page_content, not use as display title.
- `_SOCIAL_ATTRIBUTION_RE` must strip before the 120-char length check, or cleaned titles still exceed limit.
- `db.update_summary` and `db.update_metadata` are separate calls — enrichment must call both to keep UI and structured fields in sync.
- docs.anthropic.com SPA pages (computer-use, streaming, message-batches) may return empty on concurrent requests but work fine individually — likely rate/bot protection, not a code bug.

**Next:** Monitor enrichment quality on new captures. Investigate docs.anthropic.com SPA pages if they continue returning empty.

### 2026-04-03 (Session 10)
**Completed:**
- **Calendar/todos coherence model** — calendar now shows ALL capture types with deadlines (not just calendar+to_hit); todos sorted by urgency (overdue → due soon → no date); "Overdue" section at top of todos page; done button in EventPopover
- **Bulk intake** — pasting a list (3+ items with markdown checklist, numbered, or bullet syntax) routes to `bulk_classify()` via single Haiku call (8192 tokens), enters `AWAITING_BULK_CONFIRMATION` state, saves all items on affirm with per-item enrichment tasks. Input limit raised 2K → 10K chars
- **Bedrock model ID bug** — fixed `claude-haiku-4-5-20251001` → `anthropic.claude-3-haiku-20240307-v1:0` in all 5 agents (organize, to_learn, to_know, query, book_action). Was causing 400 errors on every enrichment call
- **to_cook extensibility** — full idea lifecycle system:
  - `cook_agent.py`: fires on save, generates 3-5 development threads + refined domain, sets `stage: "seed"` in metadata
  - `idea_tasks_agent.py`: on-demand, generates 3-5 concrete to_hit tasks from idea, advances stage to "developing"
  - `PATCH /captures/{id}/stage` — validates and updates idea stage (seed/brewing/developing/ready/parked)
  - `POST /captures/{id}/tasks` — triggers idea_tasks_agent synchronously, returns count
  - `/ideas` page — dedicated ideas home, organized by stage with stage pills, thread expansion, tasks button, park action
  - todos page to_cook cards enhanced with inline threads, stage badge, "→ Tasks" button
  - Nav: Ideas link added between To-Dos and Reading

**Test count:** 71 → 85 passing (added test_cook_agent.py ×5, test_idea_tasks_agent.py ×4, test_captures.py +6, test_db.py +1 urgency sort, test_state_machine.py +12 bulk tests)

**Gotchas:**
- `AsyncAnthropicBedrock` requires Bedrock model IDs (`anthropic.claude-3-haiku-20240307-v1:0`), not Anthropic API IDs (`claude-haiku-4-5-20251001`) — easy to introduce when copying from API docs
- Bulk confirmation has no correction path by design — all-or-nothing; partial save deferred
- `merge_metadata()` needed for cook/stage updates because `update_metadata()` replaces entire JSON

**Next:** Revisit scheduling (weekly "what's simmering?" digest), related captures surfacing, ideas page search/filter

### 2026-04-03 (Session 9)
**Completed:**
- Ran `/autoplan` on `TODOS.md` — full CEO + Design + Eng review pipeline
- Phase 1 CEO: 9 issues. Premise gate passed: revise-in-place (items 1-3 already exist as v1). Key changes: state machine extraction, user_id in schema, inbox = session state only (no DB write), query type as classifier placeholder, minimum Layer 2 agent added
- Phase 2 Design: 6 issues. Decided: refined text empty state, skeleton loading, error state spec, 44px touch target wrapper, aria roles on checkbox, shared lib/typeConfig.ts
- Phase 3 Eng: 7 issues. Decided: AsyncAnthropicBedrock (fixes event loop blocking, keeps Bedrock auth), json.loads guarded with try/except, full test suite (0% → 80%+ target)

**TODOS.md v2 fully reviewed. Implementation order locked:**
1. Revise classifier (AsyncAnthropicBedrock + async + metadata extraction + query noop + json guard)
2. Revise storage (user_id column)
3. Extract state machine → app/session/state_machine.py
4. Add /items API endpoints (GET todos/calendar + PATCH status)
5. Wire frontend (empty states, loading, error, touch targets, shared typeConfig.ts)
6. to_learn enrichment agent (asyncio.create_task fire-and-forget)

**Next:** Step 1 — revise classifier.py

**Gotchas:**
- Use `AsyncAnthropicBedrock` not `AnthropicBedrock` — async version, same Bedrock auth
- COMPLETION_MAP must handle `query` type with None → skip store()

### 2026-04-03 (Session 8)
**Completed:**
- Redesigned Calendar page to match actual Notion Calendar app aesthetic
  - Three-column layout: 220px left sidebar + full-width week grid (was narrow centered box)
  - Left sidebar: interactive mini month calendar (prev/next nav, today highlighted in blue) + color-dot capture type toggles (click to show/hide each type's events)
  - Week grid: near-invisible borders (`#f0f0ef`), today column subtle blue tint, now-indicator switched to red (`#ef4444`) matching Notion
  - Day headers: smaller, uppercase, gray — today in blue
  - Removed `max-w-2xl` from global layout so calendar gets full viewport width; added it back inline to chat and todos pages
- Installed `emilkowalski/skill` (emil-design-eng) via `npx skills add` — installed to `.agents/skills/`, symlinked to `.claude/skills/`

**Gotchas:**
- `max-w-2xl` was on the layout wrapper — removing it for full-bleed calendar required adding it back directly to the chat (`page.tsx`) and todos wrappers

**Next:** Google Calendar sync, event click detail panel, drag-to-create events

### 2026-04-02 (Session 5)
**Completed:**
- Ran `/office-hours` — full startup diagnostic (gstack onboarding: telemetry, proactive, routing rules)
- Added gstack skill routing rules to `capsule/CLAUDE.md`
- Produced approved design doc: intent classifier (Approach B+C) at `~/.gstack/projects/duncanchang38-capsule/duncan-main-design-20260402-000331.md`
- Ran `/plan-eng-review` — full architecture + code quality + test + performance review
- Saved 4 captured items to `backend/data/captures-seed.json` (YC application + 3 resources to read)
- Created `TODOS.md` with bucket query and tabs UI deferred items

**Key design decisions:**
- Classifier uses `anthropic` SDK directly (not Agent SDK — wrong tool for structured JSON)
- `capsule.py` → `responder.py`
- Typed metadata with `model_validator` using `bucket` as discriminator
- `classify_intent(text, correction_hint=None)` — retries pass correction context
- 2000-char input limit at route level
- Session TTL: `_sessions` pruned after 1 hour idle
- Tests ship with feature: pytest + pytest-asyncio + 2 Playwright E2E

**Real insight this session:**
User experienced the core product pain live — captured 4 items (YC app + 3 resources) with no good place to store them that connects to actual schedule/calendar. The product's true value is the **staging layer** between "I want to do this" and "this is on my schedule." Not just classification into buckets — routing to real time.

**Gotchas:**
- `bun` not in PATH during shell execution — `gstack-review-log` validator fails silently; wrote to review log directly
- Retry loop must pass `correction_hint` to classifier — same text re-sent produces same result

**Taxonomy revision (Session 6 /plan-ceo-review):**
- Revised to **5 buckets + inbox fallback**: `todo`, `calendar`, `to_know`, `to_learn`, `idea`, `inbox`
- `to_learn` added: content/skill to consume — distinct from `todo` (completion output = absorbed knowledge, not just "done")
- `inbox` added: classifier fallback when confidence < 0.4 — holds item for manual re-classification, no permanent storage write
- `idea` confirmed as personal KB foundation — persists, feeds v2 briefing/compile feature
- CEO plan written to `~/.gstack/projects/duncanchang38-capsule/ceo-plans/2026-04-02-taxonomy.md`
- Design doc updated at `~/.gstack/projects/duncanchang38-capsule/duncan-main-design-20260402-000331.md`

**Next:** Build the classifier. Implementation order: Storage → Classifier (parallel) → Bucket session → State machine → Tests

### 2026-04-05 (Session 9)
**Completed:**
- Fixed `DELETE /captures/archive` returning 422 — FastAPI route ordering conflict; static `/captures/deleted` now registered before parameterized `/{id}` in chat.py
- Fixed button-in-button hydration error in CaptureListRow — inner circle checkbox changed from `<button>` to `<div>`
- Removed overscroll "advance to next tab" feature (too buggy) — stripped wheel/touch handlers and NextHint component
- Renamed Archive → Deleted bin with 30-day TTL model: `status = 'deleted'` + `deleted_at` metadata; hard delete only in Deleted bin or after 30 days
- `deleteCapture` in useCaptures optimistically stamps `deleted_at` for immediate countdown display
- Today tab split into "Scheduled today" (circle tap-to-done, green+strikethrough, stays visible) and "Pending" sections
- Inline circle tap on Scheduled today: `onCheckDone` toggles done/active without removing item; green row treatment via `scheduledHandlers`
- Deleted tab: countdown always shows in red with bin icon, fallback to 30d for items without timestamp
- Later tab: explanatory text at top ("Items you've pushed to a future date...")
- Selection toolbar updated: Archive → Done + Delete with separate buttons
- All pages (Library, Topics, Todos, Retro) updated to use `onDone`/`onDelete` instead of `onLetGo`
- Fixed stale `plannedToday`/`donePlannedToday` references in today/page.tsx

**Gotchas:**
- FastAPI router ordering matters: `DELETE /captures/deleted` must be registered (or imported) BEFORE `DELETE /captures/{id}` — otherwise FastAPI matches "deleted" as an integer ID and returns 422
- `setCaptures` must be exposed from `useCaptures` for parent state sync in `onRestoreActive` without a full refresh

**Next:** QA the circle tap flow end-to-end; consider adding restore-from-deleted (undo) in the Deleted bin

### 2026-04-02 (Session 7)
**Completed:**
- v2 redesign via `/office-hours` — rethought taxonomy and UX from scratch
- New `to_X` type system: `to_hit`, `to_learn`, `to_cook`, `to_know`, `calendar`, `inbox`
- Key insight: separate input model (one text box, no classification) from storage model (rich typed store)
- `CompletionType` enum decouples behavior from type — extensible by design
- v1 implementation archived to `archive/v1` branch on GitHub
- CLAUDE.md, TODOS.md, PROGRESS.md updated with v2 architecture
- Design doc: `~/.gstack/projects/duncanchang38-capsule/duncan-main-design-20260402-114916.md`

**Next:** Build v2 — start with classifier (`capture_type` + `completion_type`), then storage schema, then state machine, then frontend views

### 2026-04-01 (Session 4)
**Completed:**
- Incorporated gstack (Garry Tan / YC sprint workflow toolkit) into the project
- Installed bun (required runtime for gstack)
- Global install: `~/.claude/skills/gstack` with all 34 skills linked
- Vendored gstack into project repo: `capsule/.claude/skills/gstack`
- Created `~/.claude/CLAUDE.md` with gstack skill registration
- Updated `capsule/CLAUDE.md` with gstack section
- Updated `setup-log.md` with full gstack setup instructions

**Gotchas:**
- bun must be in PATH (`export PATH="$HOME/.bun/bin:$PATH"`) when running `./setup`
- Restart Claude Code after setup — skills are discovered at startup only

**Next:** Restart Claude Code, then run `/office-hours` before building intent classifier

### 2026-04-01 (Session 1)
**Completed:** FastAPI server + SSE streaming, ChatGPT-style HTML/JS chat UI, IDEA.md, GitHub repo created and pushed, gh CLI set up, `.gitignore` added.
**Gotchas:** `.venv/` and `__pycache__/` were being committed before `.gitignore` was added.

### 2026-04-01 (Session 3)
**Completed:**
- Verified end-to-end: Next.js → FastAPI → Claude Agent SDK working
- Recreated backend venv at `backend/.venv/` (broken after folder move)
- Fixed `msg.message.content` → `msg.content` bug in `capsule.py`
- Added inline comments to `capsule.py` explaining message type filtering and block structure
- Created `CLAUDE.md` at project root via `/init`
- Split `.claude/rules/` into `session.md`, `docs.md`, `refactor.md`
- Restructured `PROGRESS.md` as single source of truth

**Gotchas:**
- Backend venv breaks if moved — always recreate with `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
- `CLAUDE_PLUGIN_ROOT` must be set when starting backend or ECC hooks error on every Claude session start
- `claude-sonnet-4-6` model ID is invalid on Bedrock — use default (omit model) or `claude-sonnet-4-5`

**Next:** Intent classifier — Claude classifies input into `todo`, `to_know`, `idea`, `calendar`, `briefing`

### 2026-04-01 (Session 2)
**Completed:** Wired Claude Agent SDK into backend. Fixed `msg.message.content` → `msg.content` bug. Identified model mismatch (`claude-sonnet-4-6` invalid on Bedrock — uses default). Identified `CLAUDE_PLUGIN_ROOT` hook errors when SDK spawns Claude process. Migrated to Next.js + TypeScript + Tailwind frontend. Restructured backend into `backend/app/routes/` + `backend/app/agents/`. Removed `index.html` (replaced by Next.js). Split rules into `session.md`, `docs.md`, `refactor.md`. Restructured `PROGRESS.md` as single source of truth.
**In progress:** End-to-end not yet verified with new structure.
**Next:** Start both servers and verify chat works end-to-end.
**Gotchas:** Backend must be started from `backend/` with `CLAUDE_PLUGIN_ROOT` set. Frontend proxies `/api/*` to `localhost:8000` via `next.config.ts`.
