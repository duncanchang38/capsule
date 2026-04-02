<!-- /autoplan restore point: /Users/duncan/.gstack/projects/duncanchang38-comp_claude/main-autoplan-restore-20260403-001054.md -->
# Capsule — TODOs (v2)

## Implementation Order

### 1. Classifier (backend/app/agents/classifier.py)
`classify_intent(text, correction_hint?) → ClassificationResult`

Returns `CaptureType` + `CompletionType` + `summary` + `metadata`. Uses Anthropic SDK directly (not Agent SDK). Types: `to_hit`, `to_learn`, `to_cook`, `to_know`, `calendar`, `inbox`.

Metadata per type:
- `to_hit`: `{ deadline: str | None, priority: "high"|"normal"|None }`
- `to_learn`: `{ resource_type: "article"|"video"|"book"|"course"|"other"|None, url: str | None, topic: str | None }`
- `to_cook`: `{ domain: str | None }` — e.g. "business", "product", "creative"
- `to_know`: `{ question: str, topic: str | None }`
- `calendar`: `{ event_name: str, date: str | None, time: str | None, location: str | None }`
- `inbox`: `{ raw: str }`

---

### 2. Storage (backend/app/storage/db.py)
`init()`, `save_capture()`, `get_recent(capture_type, limit=20)`

Schema: see CLAUDE.md. `completion_type` stored alongside `capture_type`. `deadline` as its own column (not buried in metadata JSON) so the Calendar view can query it directly.

---

### 3. State machine (backend/app/routes/chat.py)
States: `AWAITING_CAPTURE` → `AWAITING_CONFIRMATION` → store → reset.
Inbox path: `AWAITING_CAPTURE` → `INBOX_CLARIFICATION` → re-classify → `AWAITING_CONFIRMATION`.

Key change from v1: confirmation message is summary-only — type name never shown.
- v1: "Got it — adding to **To Do**. Call dentist before Friday. Sound right?"
- v2: "Got it: Call dentist before Friday. Sound right?"

Inbox clarification asks context questions, not bucket names:
- "Is this something you need to do, or something you want to sit with?"
- Presents numbered options, user picks 1/2/3.

---

### 4. Frontend: Calendar + To-Dos views (frontend/)
Two tabs. Both are filtered renders of the `captures` table:
- **Calendar** — `capture_type = 'calendar'`, ordered by `deadline ASC`
- **To-Dos** — all other active types, grouped or sorted within the view

Type-differentiated affordances:
- `to_hit`: checkbox (→ archived), deadline badge
- `to_learn`: "mark absorbed" button
- `to_cook`: no completion control — persistent card, subtle visual distinction
- `to_know`: "mark answered" button

New endpoint: `GET /items?view=todos` and `GET /items?view=calendar`

---

### 5. Query mode (v2)
Detect "show me my to_learn items" / "what ideas do I have?" as a query, not a capture. Route to DB lookup + formatted response. No storage write. Requires a `query` intent class in the classifier.

---

### 6. to_learn → to_cook knowledge wiring (v2)
When a `to_learn` item is marked absorbed, feed its topic/content into `to_cook` session context. Enables: "compile what I've learned about X." Depends on query mode + 2 weeks of real data.

---

## Deferred

- Tabs UI for individual type filtering (build after 2 weeks of self-use data)
- Calendar external API actions (Google Calendar — post-validation)
- Multimodal input (audio/image)
- Auth
- Docker
