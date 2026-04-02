# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Capsule is a personal AI-powered intake layer. Users type anything — ideas, questions, events, tasks — and Claude classifies and routes it silently. The user never selects a category. See `IDEA.md` for the full concept and `PROGRESS.md` for current status.

v1 code is preserved on the `archive/v1` branch.

## Running Locally

**Backend** (from `backend/`):
```bash
CLAUDE_PLUGIN_ROOT=~/.claude/plugins/cache/everything-claude-code/everything-claude-code/1.9.0 .venv/bin/uvicorn app.main:app --reload
```

**Frontend** (from `frontend/`):
```bash
npm run dev
```

Frontend runs on `http://localhost:3000`, backend on `http://localhost:8000`. The Next.js dev server proxies `/api/*` → `localhost:8000` via `next.config.ts`.

## Architecture (v2)

**Request flow:**
```
Browser → Next.js (3000) → /api/chat proxied → FastAPI (8000) → Anthropic SDK → Claude
```

**Core model — two surfaces, five internal types:**

```
[ Calendar ]   [ To-Dos ]
                 ├── to_hit    (task with deadline)
                 ├── to_learn  (content/skill to consume)
                 ├── to_cook   (idea to incubate — persistent, no checkbox)
                 └── to_know   (question seeking an answer)
```

Calendar and To-Dos are **filtered renders** of the typed store, not separate buckets. The user never sees or selects a type — AI assigns it silently.

**Capture flow:**
1. User types anything in a single input box
2. Backend classifies silently → `CaptureType` + `CompletionType`
3. Summary-only confirmation: "Got it: [summary]. Sound right?" — type name never shown
4. On confirm → stored to SQLite, appears in Calendar or To-Dos view
5. Inbox fallback for low-confidence: asks a context question, not "which bucket?"

**`CompletionType` drives behavior (not `CaptureType`):**

| CaptureType | CompletionType | Affordance |
|-------------|---------------|------------|
| `to_hit`    | `archive`     | checkbox → archived |
| `calendar`  | `archive`     | auto-archives after event date |
| `to_learn`  | `absorb`      | "mark absorbed" |
| `to_cook`   | `persist`     | no completion — persistent card |
| `to_know`   | `answer`      | "mark answered" |
| `inbox`     | —             | disambiguation flow, no storage write |

State machine and views branch on `CompletionType`, never on `CaptureType` directly. New types can be added by extending the enums + classifier prompt without touching the state machine.

**Backend** (`backend/app/`):
- `main.py` — FastAPI app, CORS, lifespan, db.init()
- `routes/chat.py` — `POST /chat` SSE stream + state machine
- `agents/classifier.py` — `classify_intent(text, correction_hint?)` → `ClassificationResult`
- `agents/bucket_session.py` — `BucketSession.store()` → SQLite + ack string
- `storage/db.py` — `init()`, `save_capture()`, `get_recent()`

**Frontend** (`frontend/`):
- `lib/api.ts` — `streamChat()` SSE async generator
- `hooks/useChat.ts` — message state + streaming
- `components/chat/` — `InputBar`, `MessageList`, `MessageBubble`
- `app/page.tsx` — composes views (Calendar + To-Dos tabs)

**Key constraint:** `CLAUDE_PLUGIN_ROOT` env var must be set when starting the backend.

## Data Model

```python
class CaptureType(str, Enum):
    to_hit   = "to_hit"
    to_learn = "to_learn"
    to_cook  = "to_cook"
    to_know  = "to_know"
    calendar = "calendar"
    inbox    = "inbox"

class CompletionType(str, Enum):
    archive = "archive"   # to_hit, calendar
    absorb  = "absorb"    # to_learn
    persist = "persist"   # to_cook
    answer  = "answer"    # to_know

COMPLETION_MAP = {
    "to_hit":   "archive",
    "calendar": "archive",
    "to_learn": "absorb",
    "to_cook":  "persist",
    "to_know":  "answer",
}
```

```sql
CREATE TABLE captures (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    capture_type    TEXT NOT NULL,
    completion_type TEXT NOT NULL,
    content         TEXT NOT NULL,
    summary         TEXT NOT NULL,
    metadata        TEXT NOT NULL,  -- JSON, type-specific
    status          TEXT DEFAULT 'active',
    deadline        TEXT,           -- ISO date string, nullable
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Backend Dev Notes

- Backend venv: `backend/.venv/` — recreate with `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
- Classifier uses `anthropic` SDK directly (not Agent SDK — wrong tool for structured JSON)
- `AssistantMessage` has a `.content` list (not `.message.content`) — common gotcha
- Session state is in-memory (`_sessions` dict) — lost on restart, acceptable for single-user local use

## Frontend Dev Notes

- Tailwind v4 — config in `postcss.config.mjs`, not `tailwind.config.js`
- All chat state lives in `useChat.ts`; components are stateless
- `next.config.ts` rewrites handle backend proxy — don't hardcode `localhost:8000`

## gstack
Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.
Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /retro, /investigate, /document-release, /codex, /cso, /autoplan, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn.
If gstack skills aren't working, run `cd .claude/skills/gstack && ./setup` to build the binary and register skills.

## Lint

```bash
# frontend
cd frontend && npm run lint
```

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
