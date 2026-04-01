# Capsule — TODOs

## Pending

### Bucket Query (query mode vs. capture mode)
**What:** Detect when a message is a query ("show me my todos", "what ideas do I have?") and return a formatted list from SQLite instead of running the classifier and storing it as a new capture.

**Why:** Without this, "what's in my todo list?" gets classified as a `to_know` item and stored. The app needs to distinguish capture intent from query intent.

**Context:** This is a new intent type — query mode sits alongside capture mode in the state machine. The classifier prompt will need a fifth intent class (`query`) with examples. `chat.py` routes `query` results to a DB lookup + formatted response instead of the confirmation flow. No storage write on a query.

**Depends on:** classifier + SQLite storage from the intent classifier PR.

---

### Tabs UI (visual bucket browser)
**What:** To Do / To Know / To Learn / Ideas / Calendar tabs in the Next.js frontend. Each tab shows items from that bucket. New `GET /items?bucket=todo` endpoint. Items can be marked done/dismissed.

**Why:** Right now the only way to see stored items is to open the SQLite DB file directly. After 2 weeks of capturing, you need a UI.

**Context:** Build this after 2 weeks of real self-use. Look at the SQLite data — which bucket has the highest `status='done'` rate? Build that tab first. The data tells you where the product actually works. Start with a read-only list. Add mark-as-done second.

**Depends on:** intent classifier PR + 2 weeks of captured data.

---

### to_learn → idea knowledge graph wiring (v2)
**What:** When a `to_learn` item is marked `status: learned`, it should feed into the `idea` bucket session context. Future query: "what have I learned about X?" or "compile what I've read about LLMs."

**Why:** The `to_learn` bucket generates knowledge outputs — not just "done" checkmarks. Without this wiring, learned items die in the archive. With it, Capsule builds a personal knowledge graph over time.

**Context:** The `status: learned` field is already in the schema. The wiring is a v2 feature that requires: (1) a query mode in the state machine, (2) the idea bucket session to load recent `to_learn` items as context on init. The `to_learn` session should store the topic and resource_type to enable topical grouping.

**Depends on:** classifier + storage + 2 weeks of to_learn data to validate the use case.

---

### Inbox review flow
**What:** When a capture lands in `inbox` (classifier confidence < 0.4), present a disambiguation response: "I couldn't figure out where this belongs — is it a task, a question, or an idea?" User picks bucket, item gets classified and stored normally.

**Why:** Without this, low-confidence items either get mis-filed silently or rejected with an error. Both break the capture experience.

**Context:** The `inbox` bucket is a holding state, not a permanent bucket. No SQLite write until the user resolves it. State machine: `AWAITING_CAPTURE` → `inbox` result → send disambiguation → `AWAITING_CLASSIFICATION` (new state) → user picks → `AWAITING_CONFIRMATION` (normal flow resumes). The disambiguation message should show the classifier's top 2 guesses as hints.

**Depends on:** classifier + state machine from the intent classifier PR.
