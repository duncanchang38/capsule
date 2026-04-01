# Capsule — Progress

## Current Status
Migrating to Next.js + FastAPI architecture. Frontend scaffolded, backend restructured, not yet running end-to-end.

---

## How to Run

**Backend:**
```bash
cd backend
source .venv/bin/activate
CLAUDE_PLUGIN_ROOT=~/.claude/plugins/cache/everything-claude-code/everything-claude-code/1.9.0 uvicorn app.main:app --reload
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
│       ├── main.py              ← FastAPI entry, CORS, router registration
│       ├── routes/
│       │   └── chat.py          ← POST /chat SSE endpoint
│       └── agents/
│           └── capsule.py       ← Claude Agent SDK streaming logic
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

---

## Session Log

### 2026-04-01 (Session 1)
**Completed:** FastAPI server + SSE streaming, ChatGPT-style HTML/JS chat UI, IDEA.md, GitHub repo created and pushed, gh CLI set up, `.gitignore` added.
**Gotchas:** `.venv/` and `__pycache__/` were being committed before `.gitignore` was added.

### 2026-04-01 (Session 2)
**Completed:** Wired Claude Agent SDK into backend. Fixed `msg.message.content` → `msg.content` bug. Identified model mismatch (`claude-sonnet-4-6` invalid on Bedrock — uses default). Identified `CLAUDE_PLUGIN_ROOT` hook errors when SDK spawns Claude process. Migrated to Next.js + TypeScript + Tailwind frontend. Restructured backend into `backend/app/routes/` + `backend/app/agents/`. Removed `index.html` (replaced by Next.js). Split rules into `session.md`, `docs.md`, `refactor.md`. Restructured `PROGRESS.md` as single source of truth.
**In progress:** End-to-end not yet verified with new structure.
**Next:** Start both servers and verify chat works end-to-end.
**Gotchas:** Backend must be started from `backend/` with `CLAUDE_PLUGIN_ROOT` set. Frontend proxies `/api/*` to `localhost:8000` via `next.config.ts`.
