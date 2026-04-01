# Capsule — Project Rules

## Session End Protocol

When I say "done", "bye", "wrapping up", "stopping for now", or anything indicating I'm ending the session:

1. Update `PROGRESS.md` with:
   - Date/time
   - What was completed this session
   - What's in progress
   - What's next
   - Any important context or gotchas

2. Stage and commit all changes:
   ```bash
   git add -A
   git commit -m "session: <one-line summary of what was done>"
   ```

3. Push to GitHub:
   ```bash
   git push origin main
   ```

4. Confirm everything is saved and pushed.

---

## Project Status

See `PROGRESS.md` for full details.

**Current focus:** Wire Claude Agent SDK into `server.py` to replace the echo placeholder.

**Stack:** Python · FastAPI · claude-agent-sdk · plain HTML/JS frontend

**Run locally:**
```bash
uvicorn server:app --reload
# open http://localhost:8000
```
