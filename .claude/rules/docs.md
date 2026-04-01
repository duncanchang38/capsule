# Documentation Sync Rules

## On Any Code Change

When files are created, edited, or deleted during a session:

- If a new route is added → note it in `PROGRESS.md` architecture decisions
- If a new component or module is added → it will be captured on next manual sync
- If a decision is made (tech stack, pattern, library choice) → append to `## Architecture Decisions` in `PROGRESS.md` immediately

## What Lives Where

| Document | Purpose | When Updated |
|---|---|---|
| `PROGRESS.md` | Single source of truth for project state | Every session end + manual sync |
| `IDEA.md` | Original concept, use cases, open questions | Only if the core idea/vision shifts |
| `.claude/rules/` | Claude behavior rules | When process changes |

## Rules

- Never overwrite architecture decisions — append only
- Never modify `IDEA.md` unless the user explicitly asks
- Keep `PROGRESS.md` current status line to one sentence
