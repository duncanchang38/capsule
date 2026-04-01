# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Capsule is a personal AI-powered intake layer. Users type anything — ideas, questions, events, tasks — and Claude classifies, routes, and acts on it. See `IDEA.md` for the full concept and `PROGRESS.md` for current status and what's next.

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

## Architecture

**Request flow:**
```
Browser → Next.js (3000) → /api/chat proxied → FastAPI (8000) → Claude Agent SDK → Claude
```

**Backend** (`backend/app/`):
- `main.py` — FastAPI app, CORS restricted to `localhost:3000`, mounts routers
- `routes/chat.py` — `POST /chat` accepts `{content: string}`, returns SSE stream
- `agents/capsule.py` — `stream_response()` async generator; wraps `ClaudeSDKClient`, yields words from `AssistantMessage.content` blocks

**Frontend** (`frontend/`):
- `lib/api.ts` — `streamChat()` async generator; handles SSE parsing, yields text chunks
- `hooks/useChat.ts` — manages `messages[]` state, calls `streamChat()`, streams assistant reply into the last message
- `components/chat/` — `InputBar`, `MessageList`, `MessageBubble` are pure presentational components
- `app/page.tsx` — composes the three components with `useChat`

**Key constraint:** Agent SDK spawns a Claude subprocess. The `CLAUDE_PLUGIN_ROOT` env var must be set when starting the backend or ECC hooks will error on every session start.

## Backend Dev Notes

- Backend venv is at `backend/.venv/` — recreate with `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` if paths break
- `ClaudeAgentOptions(allowed_tools=[])` — no tools given to Claude yet; intent classification and bucket routing are the next additions
- `AssistantMessage` has a `.content` list (not `.message.content`) — common gotcha

## Frontend Dev Notes

- Tailwind v4 is used — config is in `postcss.config.mjs`, not `tailwind.config.js`
- All chat state lives in `useChat.ts`; components are stateless
- `next.config.ts` rewrites handle the backend proxy — don't hardcode `localhost:8000` in frontend code

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
