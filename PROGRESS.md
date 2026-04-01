# Capsule — Progress Log

## Status: In Progress

---

## What's Done

### Project Structure
```
capsule/
├── IDEA.md          — full concept, use cases, architecture notes
├── PROGRESS.md      — this file
├── agent.py         — Claude Agent SDK playground (multi-agent example)
├── server.py        — FastAPI backend with SSE streaming endpoint
├── index.html       — chat UI (ChatGPT-style, dark theme)
├── requirements.txt — claude-agent-sdk, fastapi, uvicorn
└── .venv/           — Python virtual environment
```

### Backend (`server.py`)
- FastAPI server running on `http://localhost:8000`
- `GET /` serves the frontend
- `POST /chat` accepts `{ content: string }` and streams a response via Server-Sent Events (SSE)
- Currently echoes input back as a placeholder — Claude Agent SDK not yet wired in

### Frontend (`index.html`)
- Dark theme chat UI matching ChatGPT style
- Streaming response with blinking cursor
- Auto-expanding textarea
- Enter to send, Shift+Enter for newline

### To Run
```bash
cd capsule
uvicorn server:app --reload
# open http://localhost:8000
```

---

## What's Pending

### Immediate Next Step
**Wire Claude Agent SDK into `server.py`** — replace the placeholder echo with a real `query()` call so user input actually goes to Claude.

### After That (in order)
1. **Intent classifier** — Claude classifies input into: `todo`, `to_know`, `idea`, `calendar`, `briefing`
2. **Bucket routing** — each bucket gets its own `ClaudeSDKClient` session with persistent memory
3. **Storage** — persist items per bucket (start with JSON files or SQLite)
4. **Tabs UI** — To Do / To Know / To Learn tabs in the frontend
5. **Specialist agents** — `AgentDefinition` subagents for calendar, knowledge compiler, note organizer
6. **MCP integration** — connect external apps (calendar, etc.) as MCP servers for extensible actions
7. **Authentication** — password / biometric gate for actions
8. **Multimodal input** — image and audio input support
9. **Docker** — containerize once local version is stable

---

## Architecture Decisions Made

| Decision | Choice | Reason |
|---|---|---|
| Frontend | Plain HTML/JS | No framework overhead for now |
| Backend | FastAPI + uvicorn | Lightweight, async, pairs well with Python SDK |
| Streaming | SSE (Server-Sent Events) | Simple, no WebSocket overhead needed yet |
| Agent SDK | Python (`claude-agent-sdk`) | Already in requirements, matches backend language |
| Storage | TBD | Not decided yet — leaning SQLite or JSON files to start |
| Docker | Deferred | Add when ready to deploy or share |

---

## Key Concepts Established

- **`query()`** — one-shot tasks, no memory (intent classifier)
- **`ClaudeSDKClient`** — multi-turn sessions with memory (one per bucket)
- **`AgentDefinition`** — specialist subagents spawned on demand (actions)
- **Project agents** (`.claude/agents/`) override global ECC agents for Capsule-specific behavior
- MCP servers = extensibility answer for connecting external apps

---

## Session Log

### 2026-04-01
**Completed:**
- Built FastAPI backend (`server.py`) with SSE streaming endpoint
- Built ChatGPT-style dark theme chat UI (`index.html`) — streaming, auto-expanding textarea, Enter to send
- Created `IDEA.md` with full concept, all 7 use cases, architecture notes, open questions
- Created `PROGRESS.md` and `CLAUDE.md` (session end protocol)
- Moved rules to `.claude/rules/session.md` following proper Claude Code structure
- Created GitHub repo `duncanchang38/capsule` and pushed
- Set up `gh` CLI and configured git credentials for future pushes

**In Progress:**
- Backend is placeholder echo only — Claude Agent SDK not yet wired in

**Next:**
- Wire `query()` from claude-agent-sdk into `server.py` so input goes to Claude
- Then: intent classifier → bucket routing → storage → tabs UI

**Gotchas:**
- `.venv/` is not gitignored yet — add a `.gitignore` next session
- `__pycache__/` is being committed — add to `.gitignore` too
- Server must be started manually each session: `uvicorn server:app --reload`
