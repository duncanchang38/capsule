# Capsule — TODOs

## Pending

### Bucket Query (query mode vs. capture mode)
**What:** Detect when a message is a query ("show me my todos", "what ideas do I have?") and return a formatted list from SQLite instead of running the classifier and storing it as a new capture.

**Why:** Without this, "what's in my todo list?" gets classified as a `to_know` item and stored. The app needs to distinguish capture intent from query intent.

**Context:** This is a new intent type — query mode sits alongside capture mode in the state machine. The classifier prompt will need a fifth intent class (`query`) with examples. `chat.py` routes `query` results to a DB lookup + formatted response instead of the confirmation flow. No storage write on a query.

**Depends on:** classifier + SQLite storage from the intent classifier PR.

---

### Tabs UI (visual bucket browser)
**What:** To Do / To Know / Ideas / Calendar tabs in the Next.js frontend. Each tab shows items from that bucket. New `GET /items?bucket=todo` endpoint. Items can be marked done/dismissed.

**Why:** Right now the only way to see stored items is to open the SQLite DB file directly. After 2 weeks of capturing, you need a UI.

**Context:** Build this after 2 weeks of real self-use. Look at the SQLite data — which bucket has the highest `status='done'` rate? Build that tab first. The data tells you where the product actually works. Start with a read-only list. Add mark-as-done second.

**Depends on:** intent classifier PR + 2 weeks of captured data.
