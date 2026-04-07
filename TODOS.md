# Capsule — Pending Work

Last updated: 2026-04-07

> Implementation details and full feature history live in PROGRESS.md.
> This file tracks only what is not yet done.

---

## Bugs

- [ ] **Graph has no links** — Library graph view renders nodes but no edges. Entity relationships are not being built or not wired into the graph endpoint response.
- [ ] **Forgot-password emails don't send** — `RESEND_API_KEY` and `APP_URL` env vars not set on Railway. Auth is unblocked (reset token is generated) but the email never arrives.

## Loose ends

- [ ] **Login tagline** — "your personal AI intake layer" flagged as weak/cold. No replacement decided.
- [ ] **Restore-from-deleted** — Deleted bin has 30-day countdown but no undo/restore button.

---

## Features

### Near-term
- [ ] **Related captures in editor** — Show 2–3 similar captures in the `/captures/[id]` sidebar based on `similarity_agent` output (data exists, not surfaced in UI).
- [ ] **Ideas page search/filter** — `/library` ideas section has no filter by stage, domain, or keyword.
- [ ] **Weekly digest** — "What's simmering?" email or in-app card surfacing to_cook ideas that haven't been touched in 7+ days.

### Medium-term
- [ ] **Google Calendar sync** — Two-way: pull events into calendar view, push Capsule calendar captures to Google Calendar.
- [ ] **Multi-user / invite friends** — Currently single-user by design. Sharing or invite flow not started.

### Longer horizon
- [ ] **Multimodal input** — Image and audio capture (classify from voice note or photo).
- [ ] **MCP integrations** — Connect external apps as action targets (e.g. send to Notion, Linear, Gmail).
