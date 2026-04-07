# Capsule — Progress

## Current Status
Production-ready personal AI intake layer. Auth, capture pipeline, per-type AI agents, full editor, calendar, library, activity streaks, and recently-viewed sidebar all shipped. Deployed on Railway (backend) + Vercel (frontend).

---

## How to Run

**Backend** (from `backend/`):
```bash
ANTHROPIC_API_KEY=<your-key> .venv/bin/uvicorn app.main:app --reload
# runs on http://localhost:8000
```

**Frontend** (from `frontend/`):
```bash
npm run dev
# runs on http://localhost:3000
```

**Health checks:**
```bash
cd frontend && npx tsc --noEmit   # typecheck
cd frontend && npm run lint        # lint
cd backend  && pytest              # backend tests
```

---

## What Capsule Does

Capsule is a personal AI intake layer. You type anything — an idea, a task, a question, a URL, an event — and Claude silently classifies it, enriches it, and routes it to the right place. You never pick a category.

### Capture types (internal, never shown to user)

| Type | What it is | Completion |
|------|-----------|-----------|
| `to_hit` | Task with optional deadline | Check off → archived |
| `to_learn` | Content/resource to absorb (URLs auto-enriched) | Mark absorbed |
| `to_cook` | Idea to incubate — gets AI development threads | Persists, no checkbox |
| `to_know` | Question seeking an answer | Mark answered |
| `calendar` | Scheduled event with date/time | Auto-archives after event date |
| `inbox` | Low-confidence fallback | Disambiguation flow |

### AI agents (per capture, fire on save)

| Agent | Trigger | What it does |
|-------|---------|-------------|
| `classifier.py` | Every capture | Routes to type + extracts metadata |
| `to_learn_agent.py` | `to_learn` | Fetches page title + content via Jina/HTML meta |
| `to_know_agent.py` | `to_know` | Researches answer |
| `cook_agent.py` | `to_cook` | Generates 3–5 development threads + refines domain |
| `idea_tasks_agent.py` | On demand | Generates concrete to_hit tasks from an idea |
| `organize_agent.py` | On demand | Restructures notes per capture type |
| `sprint_agent.py` | On demand | Breaks a task into sprint steps |
| `query_agent.py` | Query intent | Searches existing captures |
| `entity_agent.py` | Background | Extracts named entities for graph |
| `similarity_agent.py` | Background | Finds related captures (merge suggestions) |
| `book_action_agent.py` | `to_learn` book type | Suggests reading actions |

---

## Pages & Routes

### Frontend pages

| Route | Purpose |
|-------|---------|
| `/` | Capture input (Apple Notes-style Tiptap editor, direct save) |
| `/today` | Morning/evening mode — Scheduled today + Pending + activity bar |
| `/calendar` | FullCalendar week view with mini-month sidebar, type toggles |
| `/library` | Ideas / Reading / Archive sections with anchor nav, graph view |
| `/captures/[id]` | Full-screen Tiptap editor, AI Organize, AI title suggest, sprints, backlinks |
| `/topics/[name]` | All captures for a topic |
| `/profile` | Settings — name, handle, password change |
| `/login` | Sign in / Create account with inline validation |
| `/reset-password` | Token-based password reset |
| `/ideas` | Ideas by stage (seed/brewing/developing/ready/parked) — redirected from old route |
| `/reading` | Reading list — redirected from old route |
| `/todos` | To-dos — redirected to `/today` |
| `/timeline` | Timeline — redirected to `/today` |

### Backend API

**Auth** (`/auth/*`)
- `POST /auth/register` — create account (name + email + handle + password)
- `POST /auth/login` — credentials login → JWT session
- `PATCH /auth/handle` — change @handle (14-day cooldown)
- `GET /auth/check` — check email/handle availability
- `POST /auth/forgot-password` — send reset email (requires RESEND_API_KEY)
- `POST /auth/reset-password` — consume token, set new password
- `GET /auth/profile` — get current user profile
- `PATCH /auth/profile` — update name
- `PATCH /auth/password` — change password

**Captures** (`/captures/*`)
- `POST /captures/save` — save a new capture (triggers classifier + async agents)
- `GET /captures` — list captures (filterable by status, type, topic, limit)
- `GET /captures/stats` — activity stats (streak, captured/completed/deferred today)
- `GET /captures/topics` — all topics for current user
- `GET /captures/graph` — entity graph for library graph view
- `GET /captures/tags` — all tags
- `PATCH /captures/topics/rename` — rename a topic across all captures
- `GET /captures/{id}` — single capture
- `PATCH /captures/{id}/status` — active / done / deleted
- `PATCH /captures/{id}/stage` — idea stage (seed → brewing → developing → ready → parked)
- `PATCH /captures/{id}/schedule` — set scheduled date
- `PATCH /captures/{id}/defer` — defer to a future date
- `PATCH /captures/{id}/type` — change capture type
- `PATCH /captures/{id}/topic` — change topic
- `PATCH /captures/{id}/tags` — update tags array
- `PATCH /captures/{id}/notes` — save rich text notes (auto-syncs H1 → summary)
- `PATCH /captures/{id}/summary` — update display title
- `POST /captures/{id}/suggest-title` — AI title suggestion
- `POST /captures/{id}/sprint-preview` — preview sprint breakdown
- `POST /captures/{id}/sprints` — save sprint steps
- `DELETE /captures/{id}` — soft-delete (sets status = deleted)
- `DELETE /captures/deleted` — hard-delete all in deleted bin

**Chat / intake**
- `POST /chat` — SSE stream, runs state machine (AWAITING_CAPTURE → CONFIRMATION → CLASSIFICATION)

**Organize**
- `POST /organize` — legacy organize endpoint

---

## Folder Structure

```
capsule/
├── backend/
│   └── app/
│       ├── main.py                   ← FastAPI entry, lifespan, db.init()
│       ├── routes/
│       │   ├── auth.py               ← Auth endpoints (register, login, handle, profile, password reset)
│       │   ├── captures.py           ← All capture CRUD + AI action endpoints
│       │   ├── chat.py               ← POST /chat SSE + delete routes
│       │   └── organize.py           ← Legacy organize endpoint
│       ├── agents/
│       │   ├── classifier.py         ← classify_intent() → CaptureType + metadata
│       │   ├── bucket_session.py     ← BucketSession.store() → SQLite + ack string
│       │   ├── to_learn_agent.py     ← URL enrichment (Jina + HTML meta + og:title)
│       │   ├── to_know_agent.py      ← Question research
│       │   ├── cook_agent.py         ← Idea development threads
│       │   ├── idea_tasks_agent.py   ← Generate tasks from idea
│       │   ├── organize_agent.py     ← Per-type note restructuring
│       │   ├── sprint_agent.py       ← Break task into sprint steps
│       │   ├── query_agent.py        ← Search existing captures
│       │   ├── entity_agent.py       ← Named entity extraction for graph
│       │   ├── similarity_agent.py   ← Related captures / merge suggestions
│       │   ├── book_action_agent.py  ← Book reading actions
│       │   └── client.py             ← Shared Anthropic client
│       └── storage/
│           └── db.py                 ← All DB operations (PostgreSQL via psycopg2)
│   ├── tests/                        ← pytest suite (85+ tests)
│   ├── requirements.txt
│   └── railway.toml                  ← Railway deploy config
├── frontend/
│   ├── app/
│   │   ├── page.tsx                  ← Capture input (Tiptap editor)
│   │   ├── today/page.tsx            ← Today view (morning/evening, sections, streak)
│   │   ├── calendar/page.tsx         ← FullCalendar week view
│   │   ├── library/page.tsx          ← Library (Ideas/Reading/Archive + graph)
│   │   ├── captures/[id]/page.tsx    ← Full capture editor
│   │   ├── topics/[name]/page.tsx    ← Topic captures list
│   │   ├── profile/page.tsx          ← Settings page
│   │   └── login/page.tsx            ← Auth (sign in / create account)
│   ├── components/
│   │   ├── Nav.tsx                   ← Top nav (Capsule · Today · Library · Calendar + profile menu)
│   │   ├── CapturePreviewDrawer.tsx  ← Slide-in capture editor (used from Today)
│   │   ├── CaptureListRow.tsx        ← Single capture row with circle-tap done
│   │   ├── RecentViewsSidebar.tsx    ← Hover panel, last 10 viewed captures
│   │   ├── GraphView.tsx             ← Force-directed entity graph (Library)
│   │   ├── SelectionToolbar.tsx      ← Multi-select bulk actions
│   │   ├── RetroDrawer.tsx           ← Weekly retro drawer
│   │   └── Toast.tsx / ToastProvider.tsx
│   ├── hooks/
│   │   ├── useCaptures.ts            ← Capture list state + all mutations
│   │   ├── useActivityStats.ts       ← Streak + today's stats from backend
│   │   └── useRecentViews.ts         ← localStorage recent views (user-scoped)
│   ├── lib/
│   │   ├── api.ts                    ← All fetch calls to backend
│   │   └── typeConfig.ts             ← Shared type → color/label/icon config
│   ├── auth.ts                       ← NextAuth config (credentials provider + JWT)
│   └── middleware.ts                 ← Auth guard (all routes except /login, /reset-password)
├── IDEA.md                           ← Original concept (don't edit casually)
└── PROGRESS.md                       ← This file
```

---

## Architecture Decisions

| Date | Decision | Choice | Reason |
|------|----------|--------|--------|
| 2026-04-01 | Backend | FastAPI + uvicorn | Lightweight, async, Python-native |
| 2026-04-01 | Streaming | SSE | Simple, no WebSocket overhead |
| 2026-04-01 | Frontend | Next.js + TypeScript + Tailwind | Scales for tabs, auth, state |
| 2026-04-01 | Architecture | Next.js proxies to FastAPI | No CORS, clean separation |
| 2026-04-02 | Taxonomy | `to_X` type system | Action-oriented over content-oriented |
| 2026-04-02 | Classification UX | Silent + summary-only confirm | User never sees internal type |
| 2026-04-02 | Views | Calendar + Todos as filtered renders | Projections of typed store, not buckets |
| 2026-04-02 | Completion | `CompletionType` drives behavior | State machine is type-agnostic, extensible |
| 2026-04-02 | SDK split | `anthropic` SDK for capture layer, Agent SDK for mind palace | Structured JSON → direct SDK; tool-driven exploration → Agent SDK |
| 2026-04-03 | AI agents | Per-type async fire-and-forget | Non-blocking enrichment after save |
| 2026-04-05 | URL enrichment | Jina + HTML meta + og:title guards | Real content, not just domain name |
| 2026-04-06 | Auth | NextAuth credentials + JWT + PostgreSQL users table | Single-user → multi-user without rewrite |
| 2026-04-06 | Handles | Instagram-style stable UUID + mutable handle | Impersonation prevention via 14-day lock |
| 2026-04-06 | DB | PostgreSQL (Railway) | Production-grade, away from SQLite |

---

## What's Pending

### Bugs / loose ends
- Graph in Library has no links (entity relationships not being built or not wired to graph data)
- Forgot-password emails don't send — `RESEND_API_KEY` + `APP_URL` not set on Railway
- Login page tagline "your personal AI intake layer" — flagged as cold, no replacement yet

### Features to build next
- Restore-from-deleted (undo) in the Deleted bin
- Related captures surfacing in the capture editor
- Weekly "what's simmering?" digest for to_cook ideas
- Google Calendar sync
- Ideas page search/filter
- Invite friends / multi-user sharing

### Longer horizon
- Multimodal input (image, audio)
- MCP integrations (connect external apps)

---

## Session Log

### 2026-04-07
**Completed:**
- **AI suggest title bug fix** — `handleAcceptTitle` in `CapturePreviewDrawer` was calling `setCapture({ ...prev, summary: title })` without updating `notes`. This triggered the `useEffect([capture])` which called `buildEditorContent(staleNotes, newTitle)` — since the old notes had a real H1, it returned the old HTML and reverted the editor, then the 800ms debounce saved the old title back to DB. Fix: also pass `notes: newHtml` in `setCapture` so the effect gets consistent state.
- **Profile menu** — replaced separate Sign out button in nav with a click-to-expand dropdown on the profile avatar. Shows Sign out + Settings (→ /profile). Uses fixed positioning to escape nav's `overflow-x-auto` clipping.
- **Profile avatar shape** — changed from `rounded-full` (circle) to `rounded-[8px]` (app-icon squircle) for visual coherence with the rest of the UI.

**Next:** Fix graph links in Library, then related captures surfacing.

### 2026-04-06 (Session 13)
**Completed:**
- Instagram-style handle system — stable UUID + mutable `@handle`, 14-day release lock, cooldown enforcement
- Registration form — `noValidate`, inline `FieldState` errors, 500ms debounced uniqueness checks, password rules
- Nav hidden on auth pages
- Recently viewed sidebar — `useRecentViews` hook (localStorage, max 10, user-scoped), hover panel pinned to right edge
- Activity streak + status bar — backend-driven `GET /captures/stats`, `useActivityStats` hook, streak from actual DB data
- Backend DB retry — 10-attempt exponential backoff in `db.init()` for Railway startup
- Vercel BACKEND_URL fix — trailing `\n` from `echo` was breaking all proxied calls

**Pending from this session:**
- RESEND_API_KEY + APP_URL needed on Railway for forgot-password emails

### 2026-04-05 (Session 12)
**Completed:**
- Classifier hallucination fix — bare URL pre-processing bypasses AI entirely, always `to_learn`
- Jina full content extraction — scraped content injected into AI enrichment prompt
- HTML meta extraction — `og:description` + `name="description"` extracted
- Social URL fix — most platforms removed from opaque list; only Twitter/X remain
- og:title length guard — titles >120 chars demoted to page_content not display title
- Social attribution stripping — removes "Username on Instagram: '" prefix
- Frontend bare URL H1 fix — `buildEditorContent` detects bare URL H1 and replaces with enriched summary
- Delayed re-fetch — `useCaptures` re-fetches 3.5s after mount to pick up async enrichment

### 2026-04-05 (Session 9 cont.)
**Completed:**
- Fixed `DELETE /captures/archive` 422 — FastAPI route ordering fix
- Removed overscroll advance-to-next-tab (too buggy)
- Done/Delete split — Deleted bin with 30-day TTL, `status = 'deleted'` + `deleted_at`
- Today tab: Scheduled today (circle tap-to-done) + Pending sections
- Selection toolbar updated to Done + Delete

### 2026-04-03 (Session 11)
**Completed:**
- Today page — morning/evening auto-mode, manual override, sections, streak
- Card editor (`/captures/[id]`) — full-screen Tiptap, edit/preview, 800ms autosave
- AI Organize — per-type Claude restructuring of notes
- Library page — Ideas + Reading + Archive, anchor nav, `✦` indicator
- Nav reduced to 3 items: Today · Calendar · Library
- Redirects: /todos → /today, /ideas + /reading + /organize → /library

### 2026-04-03 (Session 10)
**Completed:**
- Calendar/todos coherence — all types with deadlines show on calendar
- Bulk intake — paste list → `bulk_classify()` via single Haiku call
- to_cook extensibility — `cook_agent`, `idea_tasks_agent`, stage system, `/ideas` page
- Bedrock model ID bug fix — `claude-haiku-4-5` → correct Bedrock ID

### 2026-04-02 (Session 7–8)
**Completed:**
- v2 redesign — new `to_X` taxonomy, `CompletionType` enum, v1 archived
- Calendar redesign — 3-column layout matching Notion Calendar aesthetic

### 2026-04-01 (Sessions 1–6)
**Completed:**
- FastAPI + SSE streaming + Next.js frontend
- Claude Agent SDK integration
- Intent classifier (v1 → v2 with AsyncAnthropicBedrock)
- SQLite storage → PostgreSQL migration
- State machine: AWAITING_CAPTURE → CONFIRMATION → CLASSIFICATION
- Full test suite (85+ tests)
