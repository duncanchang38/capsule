# Session Protocol

## Session End

Triggers: "done", "bye", "wrapping up", "stopping for now", "end session", or anything indicating the session is ending.

1. Append a new entry to the `## Session Log` section of `PROGRESS.md`:
   - Date (YYYY-MM-DD)
   - What was completed this session
   - What's in progress
   - What's next
   - Any gotchas or important context

2. Commit and push:
   ```bash
   git add -A
   git commit -m "session: <one-line summary>"
   git push origin main
   ```

3. Confirm saved and pushed.

---

## Manual Sync

Triggers: "update docs", "sync docs", or "update progress"

1. Read current source files to get actual state
2. Update `PROGRESS.md`:
   - Current status line
   - Folder structure snapshot
   - Architecture decisions (append new ones, don't remove old)
   - What's pending (reorder based on current state)
3. Report what changed
