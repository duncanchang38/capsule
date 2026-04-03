<!-- /autoplan restore point: /Users/duncan/.gstack/projects/duncanchang38-comp_claude/main-autoplan-restore-20260403-001054.md -->
# Capsule — TODOs (v2)

## Implementation Order
<!-- autoplan: revised in place — items 1-3 are revisions of existing v1 code, not greenfield builds -->

### 1. Revise Classifier (backend/app/agents/classifier.py)
**v1 exists. Revise to v2 spec.**

Changes:
- Swap `AnthropicBedrock` → `AsyncAnthropicBedrock` (keeps Bedrock auth, adds async/await)
- Make `classify_intent()` async: `async def classify_intent(...)` + `await client.messages.create(...)`
- Add per-type metadata extraction to system prompt (see metadata schema below)
- Add `query` as noop type (placeholder — routes to DB lookup, no storage)
- Add `"query": None` to COMPLETION_MAP in bucket_session.py; skip store() if completion_type is None
- Guard `json.loads` with try/except → inbox fallback on parse error

`classify_intent(text, correction_hint?) → ClassificationResult`

Returns `CaptureType` + `CompletionType` + `summary` + `metadata`. Types: `to_hit`, `to_learn`, `to_cook`, `to_know`, `calendar`, `inbox`, `query`.

Metadata per type:
- `to_hit`: `{ deadline: str | None, priority: "high"|"normal"|None }`
- `to_learn`: `{ resource_type: "article"|"video"|"book"|"course"|"other"|None, url: str | None, topic: str | None }`
- `to_cook`: `{ domain: str | None }` — e.g. "business", "product", "creative"
- `to_know`: `{ question: str, topic: str | None }`
- `calendar`: `{ event_name: str, date: str | None, time: str | None, location: str | None }`
- `inbox`: `{ raw: str }`
- `query`: `{ raw: str }` — noop, no storage

---

### 2. Revise Storage (backend/app/storage/db.py)
**v1 exists. Revise to v2 spec.**

Changes:
- Add `user_id TEXT NOT NULL DEFAULT 'default'` column to schema
- Migration: ALTER TABLE or DROP + recreate (single-user local, no prod data risk)
- Fix `get_recent()` → add `capture_type` filter param: `get_recent(capture_type=None, limit=20)`

`init()`, `save_capture()`, `get_recent(capture_type=None, limit=20)`

Schema: see CLAUDE.md. `completion_type` stored alongside `capture_type`. `deadline` as its own column.

---

### 3. Extract State Machine (backend/app/session/state_machine.py)
**v1 exists in chat.py:57-157. Extract to own module.**

New file: `backend/app/session/state_machine.py`
- `SessionState` dataclass: state, pending, original_text, retries, last_active
- `advance(session, message) → (new_session, reply_text)` — pure function, no I/O
- `chat.py` becomes thin: get session → advance → stream reply

Also fix inbox behavior: state machine should NOT call `bucket.store()` when capture_type == `inbox`. Inbox = clarification flow only, no DB write.

---

### 4. API: /items endpoints (backend/app/routes/items.py)
**New. Doesn't exist.**

```
GET /items?view=todos    → active non-calendar captures, sorted by created_at DESC
GET /items?view=calendar → active calendar captures, sorted by deadline ASC
PATCH /items/{id}/status → update status (archived/absorbed/answered)
```

---

### 5. Wire Frontend to API (frontend/)
**Pages exist as shells. Wire to real data.**

`frontend/app/todos/page.tsx` → `GET /items?view=todos`, type-differentiated affordances:
- `to_hit`: checkbox (→ PATCH status=archived), deadline badge
- `to_learn`: "mark absorbed" button (→ PATCH status=absorbed)
- `to_cook`: persistent card, no completion control
- `to_know`: "mark answered" button (→ PATCH status=answered)

`frontend/app/calendar/page.tsx` → `GET /items?view=calendar`, sorted by deadline

---

### 6. Layer 2: to_learn Enrichment Agent (backend/app/agents/to_learn_agent.py)
**New. Minimum viable Layer 2 agent.**

After a `to_learn` item is stored, async call to enrich metadata:
- Extract topic, resource_type (article/video/book), and URL if present
- Update metadata column in DB
- Uses direct anthropic SDK (structured JSON output, not Agent SDK)

Triggered from BucketSession.store() for `to_learn` type — fire and forget.

---

### 7. Query mode (deferred to after 2 weeks data)
Detect "show me my to_learn items" / "what ideas do I have?" as a query, not a capture. Route to DB lookup + formatted response. No storage write. Classifier already has `query` type as placeholder.

---

### 8. to_learn → to_cook knowledge wiring (deferred)
When a `to_learn` item is marked absorbed, feed its topic/content into `to_cook` session context. Enables: "compile what I've learned about X." Depends on query mode + 2 weeks of real data.

---

## Deferred

- Tabs UI for individual type filtering (build after 2 weeks of self-use data)
- Calendar external API actions (Google Calendar — post-validation)
- Multimodal input (audio/image)
- Auth
- Docker

---

## GSTACK REVIEW REPORT

### Phase 1 — CEO Review (auto-decided, single-reviewer mode — Codex unavailable)

**Mode:** SELECTIVE EXPANSION | **Voices:** Claude subagent only `[subagent-only]`

---

#### 0A — Premise Challenge

Stated premises:

| # | Premise | Status | Notes |
|---|---------|--------|-------|
| P1 | Single input box, AI classifies silently | VALID | Core UX is right. User never selects type = correct. |
| P2 | Confirmation is summary-only, type name hidden | VALID | "Got it: Call dentist. Sound right?" is the right pattern. |
| P3 | Items 1-3 are greenfield builds | **ASSUMED WRONG** | classifier.py, db.py, state machine in chat.py all exist. Work = revision, not greenfield. |
| P4 | Single-user, no auth for this phase | VALID | Personal tool. Fine. |
| P5 | Frontend views are not yet wired to the API | VALID | `/items` endpoint doesn't exist. Calendar + todos pages exist but have no data. |

**P3 is the load-bearing wrong assumption.** The plan's implementation order reads as if you're starting from zero. You're not. Revising existing code to v2 spec is faster but requires different thinking — you're working with constraints that greenfield doesn't have.

---

#### 0B — What Already Exists

| Sub-problem | Status | File | Notes |
|-------------|--------|------|-------|
| Classifier | EXISTS v1 | `backend/app/agents/classifier.py` | Uses AnthropicBedrock, not direct anthropic SDK |
| Storage schema | EXISTS v1 | `backend/app/storage/db.py` | init(), save_capture(), update_status(), get_recent() |
| State machine | EXISTS v1 | `backend/app/routes/chat.py` | All 3 states in route handler (extraction needed) |
| Frontend shells | EXISTS | `frontend/app/calendar/page.tsx`, `frontend/app/todos/page.tsx` | Pages exist, not wired to API |
| BucketSession | EXISTS v1 | `backend/app/agents/bucket_session.py` | COMPLETION_MAP + store() |

**What doesn't exist:**
- `GET /items?view=todos` and `GET /items?view=calendar` endpoints
- `user_id` column in schema
- `app/session/state_machine.py` (extracted from route)
- FTS5 index for mind palace queries
- `types.yaml` config layer
- Any Layer 2 per-type agents

---

#### 0C — Dream State Delta

```
CURRENT (v1 working)                THIS PLAN (v2)                 12-MONTH IDEAL
──────────────────────              ──────────────────             ─────────────────────
Working classifier (Bedrock)  →     Direct anthropic SDK     →     types.yaml driven config
State machine in route.py     →     Extracted to state_machine.py  Per-type enrichment agents
No /items API                 →     GET /items?view=...             /ask (mind palace FTS5)
Frontend shells (no data)     →     Wired to real API               Briefing agent (daily synthesis)
No user_id                    →     user_id in schema               Multi-device sync
```

Gap between "this plan" and "12-month ideal": the plan gets you to a working personal app with real data. The gap to 12 months = mind palace + per-type agents. That's intentionally deferred and correct.

---

#### 0C-bis — Implementation Alternatives

| Approach | Effort | Risk | When to use |
|----------|--------|------|-------------|
| A: Revise in place (update existing files) | Low (CC: 20 min) | Low | Correct approach — existing code is v1, not wrong |
| B: Delete + rewrite from scratch | Medium (CC: 45 min) | Medium | Only if existing code has structural blockers |
| C: Feature flag v2 alongside v1 | High | High | Don't. Unnecessary complexity for single-user tool. |

**Auto-decided: Approach A.** P5 (explicit over clever). Revise existing code to v2 spec.

---

#### 0D — Scope Decisions

| Item | Decision | Principle | Rationale |
|------|----------|-----------|-----------|
| types.yaml config layer | DEFER | P3 (pragmatic) | Valid future direction, not required for v2 launch. Add after 2 weeks of real types data. |
| Extract state machine | IN SCOPE | P5 (explicit) | chat.py:57-157 is 100 lines of logic in a route. Extract to app/session/state_machine.py before it grows. |
| user_id in schema | IN SCOPE | P2 (boil lakes) | One column, zero complexity. Migration is 2 lines. Not adding it = debt. |
| inbox as session state (not storage) | IN SCOPE | P5 (explicit) | Current code: COMPLETION_MAP["inbox"] = "inbox" AND stores to DB. Wrong. Inbox should be clarification session state, no storage write. |
| query intent placeholder | IN SCOPE | P5 (explicit) | Add `query` as a noop type in classifier now. Costs nothing. Avoids refactor later. |
| Layer 2 agents | ADD ONE | P1 (completeness) | Without at least one smart per-type agent, this is just a categorized list. Add basic to_learn enrichment (extract topic + URL) as minimum. |
| AnthropicBedrock → direct anthropic SDK | IN SCOPE | P3 (pragmatic) | classifier.py currently uses AnthropicBedrock. Plan says direct SDK. Fix now, not later. Note: TASTE DECISION — see gate. |

---

#### 0E — Temporal Interrogation

```
HOUR 1: Fix classifier SDK (Bedrock → direct anthropic). 1 file change.
HOUR 2: Extract state machine to app/session/state_machine.py. Routing to imports.
HOUR 3: Add user_id to schema + migration. Fix inbox (session state, not storage).
HOUR 4: Add GET /items?view=todos + GET /items?view=calendar endpoints.
HOUR 5: Wire frontend calendar + todos pages to API. Test data flows.
HOUR 6+: Add to_learn enrichment as first Layer 2 agent. Write tests.
```

---

#### CEO DUAL VOICES — CONSENSUS TABLE `[subagent-only]`

```
CEO DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════════════
  Dimension                              Claude     Codex   Consensus
  ─────────────────────────────────────── ─────────  ─────── ─────────
  1. Premises valid?                       Mostly     N/A    FLAG P3
  2. Right problem to solve?               YES        N/A    YES
  3. Scope calibration correct?            Needs adj  N/A    REVISE
  4. Alternatives sufficiently explored?   SDK choice N/A    FLAG
  5. Competitive/market risks covered?     N/A (solo) N/A    N/A
  6. 6-month trajectory sound?             YES        N/A    YES
═══════════════════════════════════════════════════════════════════════
Codex: unavailable (not installed). Single-reviewer mode.
```

---

#### Sections 1-10 — Issue Audit

**S1 — Correctness:** classifier.py uses `AnthropicBedrock` but plan/CLAUDE.md says direct `anthropic` SDK. Mismatched. Also, metadata field in ClassificationResult is always `{}` — metadata extraction per type (deadline, resource_type, etc.) is not implemented yet. → Flagged.

**S2 — Error & Rescue Registry:**

| Failure | Current handling | Fix |
|---------|-----------------|-----|
| Claude API down | Generic exception text | Acceptable for v2 personal tool |
| JSON parse error from classifier | Unhandled — `json.loads` will raise | Add try/except around json.loads, return inbox fallback |
| inbox stored to DB when it shouldn't be | BucketSession stores everything including inbox | Remove inbox from COMPLETION_MAP saves OR skip save_capture for inbox |
| Session not found after server restart | In-memory sessions lost | Acceptable for single-user local. Document it. |

**S3 — State coverage:** All 3 states implemented. INBOX_CLARIFICATION uses correction_hint to re-classify, which is correct. Correction retry loop (max 3) is present. → No issues.

**S4 — Schema coverage:** Missing `user_id`. `metadata` is JSON blob — correct for v2 (don't over-normalize). `deadline` as top-level column is correct (Calendar view queries it). → user_id is the one gap.

**S5 — API surface:** `GET /items` doesn't exist. Frontend pages exist as shells with no data. `/chat` works. → Missing endpoints are the main gap.

**S6 — Frontend:** `frontend/app/calendar/page.tsx` and `frontend/app/todos/page.tsx` exist. Not wired to API. This is expected — step 4 in the plan. → No issues beyond plan scope.

**S7 — Testing:** Tests listed in PROGRESS.md folder structure (test_classifier.py, test_db.py, etc.) are in git status as staged deletions (`D`). This is either a staging accident or intentional cleanup. Either way — tests need to exist. Flag.

**S8 — SDK split:** AnthropicBedrock in classifier.py contradicts the "direct anthropic SDK for capture layer" principle in CLAUDE.md. This is the most concrete technical debt to fix first.

**S9 — Inbox behavior:** Current code `COMPLETION_MAP["inbox"] = "inbox"` + `db.save_capture(...)` saves inbox items to the DB. Per design, inbox should be a clarification flow, not a storage type. Fix: in BucketSession.store(), skip the save if capture_type == "inbox" (or better, state machine should not call store for inbox at all).

**S10 — Per-type metadata extraction:** ClassificationResult.metadata is always `{}`. The classifier prompt mentions no metadata extraction. Types like `to_learn` (resource_type, url, topic) and `to_hit` (priority) need metadata. This is listed in TODOS.md as part of step 1 — confirm it's in scope.

---

#### Not in Scope (Deferred)

- types.yaml config layer (validate types data first)
- Mind palace / /ask endpoint (needs 2 weeks of real data)
- Layer 3 agents (briefing, evolution, synthesis)
- Auth, Docker, multimodal

---

#### CEO Completion Summary

| Finding | Severity | Auto-decided | Action |
|---------|----------|-------------|--------|
| P3 premise wrong: items 1-3 exist | HIGH | YES (revise in place) | Reframe plan as revision, not build |
| State machine in route handler | HIGH | YES (extract) | New: app/session/state_machine.py |
| user_id missing from schema | HIGH | YES (add) | One migration, one column |
| inbox stored to DB incorrectly | HIGH | YES (fix) | Skip save for inbox type |
| tests staged as deleted | HIGH | YES (restore/recreate) | Tests must exist |
| AnthropicBedrock vs direct SDK | MEDIUM | TASTE (see gate) | Depends on your Bedrock setup |
| metadata extraction not implemented | MEDIUM | YES (in scope for step 1) | Add to classifier prompt |
| query type missing from classifier | MEDIUM | YES (add placeholder) | Noop type now, implement later |
| No Layer 2 agent at launch | HIGH | YES (add minimum) | Basic to_learn enrichment |
| json.loads not guarded | MEDIUM | YES (fix) | try/except → inbox fallback |

---

**Phase 1 complete.** Claude subagent: 9 issues (1 CRITICAL-equivalent, 5 HIGH, 3 MEDIUM).
Consensus: Codex unavailable, single-reviewer mode.
Premise gate: PASSED — revise in place.

---

### Phase 2 — Design Review (auto-decided)

**UI scope:** 3 pages (Capture/chat, Todos, Calendar) + Nav.
**Design tool:** OpenAI key not configured — visual mockup generation unavailable. Text-based design spec used.
**DESIGN.md:** Not found. Flag for post-v2 creation.

#### 0A — Design Completeness Rating: 6/10

The UI shells are detailed and intentional (not AI slop). Notion-inspired aesthetic, color-coded type system, nav structure — all solid. The gap is **missing states**: no loading skeletons, no error states, no first-time user experience, and accessibility is underspecified.

A 10 for this plan looks like: every affordance specced with all states (empty/loading/error/success), touch targets meet 44px minimum, screen reader labels on interactive elements, and a first-time onboarding hint.

#### 0B — DESIGN.md Status

No DESIGN.md found. Proceeding with universal design principles. Post-v2 action: run `/design-consultation` to produce DESIGN.md. Defer — not blocking launch.

#### 0C — Existing Design Leverage

**Already solid (reuse, don't change):**
- Nav: white bg, zinc-900 active pill, zinc-500 inactive — clean, keep it
- Type color system: orange/blue/purple/green in TYPE_COLORS + TYPE_CONFIG — consistent across todos and calendar
- Card: rounded-xl border bg-white p-3 — use this everywhere
- Chat: full-height flex column layout — correct

**Gap: inconsistency between pages.** Todos uses `TYPE_CONFIG` with colored badge pills. Calendar uses `TYPE_COLORS` with background colors. These are parallel systems. When step 5 wires both to the API, use one shared type config object.

#### Design Scope — Step 5 Additions

For step 5 (Wire Frontend to API), add these design specs to the plan:

**Empty states:**
- Todos empty: current text ("Nothing captured yet. Go to Capture to add something.") needs a primary action button, not just text. Add: `<Link href="/">Start capturing →</Link>` as a styled pill button below the message.
- Chat page (first-time): no guidance visible. First message should be a system message: "What's on your mind? I'll remember it." Shown only before the first user message, disappears after.
- Calendar empty: "Nothing scheduled. Add an event in Capture." with link — same pattern as todos.

**Loading states:**
- Current: bare "Loading..." text. Replace with a single skeleton card (1 card, shimmer animation) for todos and calendar. Signals "there's data coming" rather than "is it broken?"

**Error states:**
- No error states defined anywhere. Add: if `GET /items` fails, show "Couldn't load. Tap to retry." Minimal — just a one-liner with a retry link. Same in chat: if SSE stream errors, show "Connection error — try again."

**Touch targets:**
- Todos checkbox: currently `w-5 h-5` = 20px. iOS minimum is 44px tap target. Fix: wrap in a `min-w-[44px] min-h-[44px]` invisible touch area, keep visual at 20px. Standard mobile pattern.

**Accessibility:**
- Checkbox button in todos needs `role="checkbox"` and `aria-checked={isDone}` on the `<button>`.
- Nav Links need `aria-current="page"` when active.

#### 7 Design Dimensions

| Dimension | Score | Verdict | Fix |
|-----------|-------|---------|-----|
| D1: Information Architecture | 8/10 | Solid: Capture→Todos→Calendar matches mental model | No change |
| D2: Interaction State Coverage | 5/10 | Missing: empty states weak, loading bare text, NO error states | Add to step 5 spec |
| D3: AI Slop Risk | 8/10 | Not slop — intentional type-color system, Notion-minimal aesthetic | No change |
| D4: User Journey | 7/10 | Flows defined; gap: first-time UX and correction flow UX | Add first-time system message |
| D5: Specificity | 7/10 | Color system exists in code; DESIGN.md missing | Defer DESIGN.md to post-launch |
| D6: Accessibility | 4/10 | No aria-labels, no keyboard roles, 20px touch targets | Fix checkbox role + touch target in step 5 |
| D7: Responsive | 6/10 | max-w-2xl works on mobile; Calendar FullCalendar has built-in mobile | Add `viewport` meta if missing; no other changes needed |

#### Design Taste Decisions (for final gate)

1. **Todos empty state style:** **DECIDED: refined text + link.** "Nothing here yet." + `<Link href="/">Start capturing →</Link>` as zinc-500 text link. No icon.

2. **Shared type config:** Create `frontend/lib/typeConfig.ts` as a single source of truth for type labels/colors/actions, imported by both todos and calendar. This is a small DRY refactor. Auto-decided: IN SCOPE (P4). Not a taste decision.

#### Design Phase Complete

No changes to plan ordering. Step 5 gains design constraints:
- Empty state specs (todos, chat, calendar)
- Loading skeleton (not bare text)
- Error state spec (`GET /items` failure + chat SSE error)
- Touch target fix for checkbox
- Accessibility: `role="checkbox" aria-checked` + nav `aria-current`
- Shared `lib/typeConfig.ts` (DRY)

---

**Phase 2 complete.** Design: 6/10 → target 8/10 with these additions. 6 issues (2 HIGH, 3 MEDIUM, 1 TASTE).
Passing to Phase 3: Eng Review.

| Review | Trigger | Runs | Status | Findings |
|--------|---------|------|--------|----------|
| CEO Review | `/plan-ceo-review` | 1 | DONE_WITH_CONCERNS | 9 issues |
| Codex Review | `/codex review` | 0 | UNAVAILABLE | — |
| Eng Review | `/plan-eng-review` | 0 | PENDING | — |
| Design Review | `/plan-design-review` | 1 | DONE_WITH_CONCERNS | 6 issues |

---

### Phase 3 — Eng Review (auto-decided)

#### Step 0: Scope Challenge

Files touched: 10 files, 3 new (`state_machine.py`, `items.py`, `to_learn_agent.py`). Complexity check triggers at 8+. Auto-decided: proceed as-is (P3 pragmatic — each file is small, changes are targeted, no new infra).

Existing code covering sub-problems: classifier (exists), db (exists), state machine in chat.py (extract, don't rewrite), BucketSession (minor update only), frontend pages (wire, don't redesign).

#### Architecture — Issues

**[P1] (confidence: 9/10) classifier.py:56 — json.loads unguarded**
If Claude returns non-JSON (markdown fence, apology text), raises unhandled exception → 500. Fix: wrap in `try/except json.JSONDecodeError` → return inbox fallback with raw text. Add to step 1.

**[P2] (confidence: 9/10) bucket_session.py:5 — COMPLETION_MAP KeyError on new types**
Adding `query` type to classifier means `COMPLETION_MAP[result.capture_type]` raises KeyError for query captures. Fix: add `"query": None` to COMPLETION_MAP and skip store() when completion_type is None. Add to step 1.

**[P2] (confidence: 8/10) to_learn enrichment fire-and-forget needs asyncio.create_task()**
BucketSession.store() is sync. FastAPI route is async. Fire-and-forget enrichment needs `asyncio.create_task()` inside an async context, not a sync call. Plan step 6 must note: make store() async or use BackgroundTasks injection from the route. Add to step 6.

**[P2] (confidence: 9/10) classifier.py uses synchronous AnthropicBedrock — switch to AsyncAnthropicBedrock**
`AnthropicBedrock` is sync; calling it inside `async def stream()` blocks the FastAPI event loop. Fix: switch to `AsyncAnthropicBedrock` + `await client.messages.create(...)`. Keeps Bedrock auth (no API key change). **DECIDED: use AsyncAnthropicBedrock.** Add to step 1.

#### Architecture Diagram

```
REQUEST FLOW (v2 target)
─────────────────────────────────────────────────────
Browser → Next.js :3000 → /api/chat proxy → FastAPI :8000
                                                 │
                         ┌───────────────────────┤
                         │  POST /chat            │
                         │  chat.py (thin)        │
                         │    → session_store     │
                         │    → state_machine.advance()
                         │         │              │
                         │    AWAITING_CAPTURE    │
                         │         ↓              │
                         │    classify_intent()   │
                         │    (anthropic SDK)     │
                         │         ↓              │
                         │    AWAITING_CONFIRM    │
                         │         ↓ affirm       │
                         │    bucket.store()      │
                         │         ↓              │
                         │    db.save_capture()   │
                         │         ↓ async        │
                         │    to_learn_agent()    │
                         │    (fire+forget)       │
                         └───────────────────────┘
                                                 │
                         GET /items?view=todos   │
                         GET /items?view=calendar│
                         PATCH /items/{id}/status│
```

#### Code Quality — Issues

**[P2] (confidence: 9/10) Two parallel type config systems in frontend**
`TYPE_CONFIG` in todos/page.tsx + `TYPE_COLORS/SOURCE_LABELS/TYPE_DISPLAY` in calendar/page.tsx cover the same 5 types. Adding a new type = update 5 places. Fix: `frontend/lib/typeConfig.ts` single source. Already in plan (design phase). Confirm it's step 5 work.

**[P2] (confidence: 9/10) classify_intent blocks event loop — fix via AsyncAnthropicBedrock**
Already covered by the AsyncAnthropicBedrock switch above. Make classify_intent async + await the API call. chat.py stream() already async so await classify_intent() works directly.

**[P3] (confidence: 7/10) db.py opens/closes a connection per operation**
Fine for SQLite single-user. Not a problem at this scale. Noted only.

#### Test Review — Coverage Diagram

```
CODE PATH COVERAGE (v2 plan)
═══════════════════════════════════════════════════════════
[+] backend/app/agents/classifier.py
    ├── [GAP] Happy path → 7 types (to_hit, to_learn, etc.)
    ├── [GAP] json.loads failure → inbox fallback
    ├── [GAP] correction_hint appended correctly
    ├── [GAP] metadata extracted per type
    └── [GAP] query type returns noop

[+] backend/app/storage/db.py
    ├── [GAP] init() creates schema with user_id column
    ├── [GAP] save_capture() persists user_id
    └── [GAP] get_recent(capture_type=None) vs get_recent(capture_type="to_hit")

[+] backend/app/session/state_machine.py  ← NEW
    ├── [GAP] AWAITING_CAPTURE → AWAITING_CONFIRMATION (5 types)
    ├── [GAP] AWAITING_CAPTURE → INBOX_CLARIFICATION (inbox + low confidence)
    ├── [GAP] AWAITING_CONFIRMATION: affirm → returns store signal
    ├── [GAP] AWAITING_CONFIRMATION: cancel → resets
    ├── [GAP] AWAITING_CONFIRMATION: correction → re-classify
    ├── [GAP] AWAITING_CONFIRMATION: max retries → resets
    └── [GAP] INBOX_CLARIFICATION → AWAITING_CONFIRMATION

[+] backend/app/routes/items.py  ← NEW
    ├── [GAP] GET /items?view=todos → non-calendar active only
    ├── [GAP] GET /items?view=calendar → calendar sorted by deadline
    └── [GAP] PATCH /items/{id}/status → updates, idempotent

[+] backend/app/agents/to_learn_agent.py  ← NEW
    ├── [GAP] Enriches metadata (topic + resource_type + url)
    └── [GAP] Handles missing url gracefully

USER FLOW COVERAGE
[+] Full capture → store → appears in todos [→E2E]
    └── [GAP] chat confirm → item in GET /items?view=todos

[+] Full capture → store → appears in calendar [→E2E]
    └── [GAP] chat confirm calendar event → item in GET /items?view=calendar

[+] Correction flow
    └── [GAP] chat → confirm → "no, make it a task" → re-classify → confirm

[+] Error states
    ├── [GAP] GET /items fails → user sees retry message
    └── [GAP] SSE stream error → user sees "try again"

──────────────────────────────────────
COVERAGE: 0/22 paths tested (0%)
All tests were deleted in v2 reset. All gaps = new tests.
Framework: pytest + pytest-asyncio. 2 E2E integration tests needed.
──────────────────────────────────────
```

#### Test Plan — Add to Plan

**Step 1 (classifier):**
- `tests/test_classifier.py`: 7 type classification tests, json failure → inbox fallback, correction_hint, metadata extraction per type, query noop

**Step 2 (storage):**
- `tests/test_db.py`: init with user_id column, save_capture round-trip, get_recent with/without capture_type filter

**Step 3 (state machine):**
- `tests/test_state_machine.py`: all 7 state transitions above, pure function (no I/O — fast unit tests)

**Step 4 (items API):**
- `tests/test_items.py`: GET /items?view=todos filters correctly, GET /items?view=calendar sorted by deadline, PATCH idempotency

**Step 6 (to_learn agent):**
- `tests/test_to_learn_agent.py`: enrichment output schema, missing url handling

**Integration (E2E):**
- `tests/test_chat.py`: capture → confirm → store → GET /items round-trip (2 flows: todo + calendar)

#### Eng Review — Completion Summary

| Finding | Severity | Auto-decided | Action |
|---------|----------|-------------|--------|
| json.loads unguarded | P1 | YES | Add try/except in step 1 |
| COMPLETION_MAP KeyError on query type | P2 | YES | Add to step 1 |
| classify_intent blocks event loop | P2 | YES | Make async in step 1 |
| to_learn fire-and-forget needs asyncio.create_task | P2 | YES | Note in step 6 |
| Duplicate frontend type configs | P2 | YES | lib/typeConfig.ts in step 5 |
| All tests deleted | HIGH | YES | Full test suite in each step |
| Sync AnthropicBedrock blocks event loop | P2 | YES | Switch to AsyncAnthropicBedrock in step 1 |

**Phase 3 complete.** 7 issues (1 P1, 4 P2, 2 procedural). Full test suite required (0% → target 80%+).

---

| Review | Trigger | Runs | Status | Findings |
|--------|---------|------|--------|----------|
| CEO Review | `/plan-ceo-review` | 1 | DONE_WITH_CONCERNS | 9 issues |
| Codex Review | `/codex review` | 0 | UNAVAILABLE | — |
| Eng Review | `/plan-eng-review` | 1 | DONE_WITH_CONCERNS | 7 issues |
| Design Review | `/plan-design-review` | 1 | DONE_WITH_CONCERNS | 6 issues |
