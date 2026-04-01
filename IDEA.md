# Capsule — Idea Log

A personal intake layer. Everything you encounter — ideas, questions, events, content — gets captured, classified, and routed. It connects your captured knowledge to your actions.

---

## Core Concept

Not a Google Doc, not quite Notion. It's where you get started with stuff. It connects the dots for you.

```
INPUT                    BRAIN                    OUTPUT
─────                    ─────                    ──────
Text                     Intent classifier        Todo
Audio          ──────►   Route to session    ──►  To Know
Image                    Match metadata           To Learn
                         Take action              Calendar / Apps
```

Each category/topic is a different LLM session. Each session has metadata that gets updated. Once intention is identified, it is paired with the closest metadata.

---

## Output Format

```
Action:   [what to do]
On:       [app / software / program]
Details:  [specifics]
```

---

## Tabs

- **To Do** — actionable items
- **To Know** — questions and compiled knowledge
- **To Learn** — longer-term learning goals

---

## Use Cases

### UC1 — Calendar / Scheduling
Given an event detail or message invite (text or image):
- Check availability
- Flag conflicts, confirm if overlap is okay
- Suggest available time slots if needed
- Consider timezones
- Add to calendar once confirmed

### UC2 — To Know List
Given a question, add to a daily "to know" list.
- Compile knowledge at end of day (auto or on command)
- Output as a list — user can archive once read/learned or delete
- Unactioned items roll over to next day
- *Ex: How does the auto insurance industry work and how is Geico succeeding with its low cost?*

### UC3 — Ideas & Capture (Modern Dictaphone)
Auto-categorize captured ideas:
- Undeveloped business ideas
- Advice / summaries from books → actionable todos (e.g. open Roth IRA, plan savings)
- Quotes from books (with metadata: title, author, page)
- Interesting articles or content
- Previously captured ideas serve as a knowledge base when building something new

### UC4 — AI Note Organizer
One-click AI organization of current note.
- Easily reversible
- User can select AI-modified changes and develop or regenerate from there

### UC5 — Daily Briefing
"What's today like?" — combines:
- Weather
- Time
- Schedule of the day

### UC6 — Book Notes
Given book-related inputs:
- Compile to saved todo list
- Include summary/abstract for each book

### UC7 — System Updates / Knowledge Evolution
Look back at previously noted ideas, knowledge, or technologies and see how they have progressed over time.

---

## Authentication

- Password
- Biometric
- Required for actions (e.g. adding to calendar, sending messages)

---

## Open Architecture Questions

- **GraphQL?** — Connections feel important; could be like a Wikipedia for YOU, taking you back through your messy chaotic thoughts
- **Categorization** — How does intent routing scale?
- **Extensibility** — MCP for connecting to external apps/software?
- **Prompt injection** — How to prevent malicious input from hijacking actions?

---

## Tech Stack (Under Consideration)

- Claude Agent SDK — intent classification + routing
- MCP — extensible actions on external apps
- GraphQL — for relationship-heavy data queries
- Biometric auth — for sensitive actions

---

## Build Strategy

**Start with the core loop — text only:**

```
Text input → Intent classifier → Route to bucket → Store with metadata
```

Three buckets first: **Todo / To Know / Ideas**. No calendar actions, no audio, no briefing yet.

**First milestone:**
> User types or pastes anything. App classifies it, puts it in the right bucket, confirms. User can view each bucket.

This validates intent routing before building anything else on top of it.

---

## Development Log

| Date | Update |
|---|---|
| 2026-04-01 | Initial idea captured and organized |
