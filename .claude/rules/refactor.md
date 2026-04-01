# Refactor Protocol

## Triggers

- User says "refactor", "restructure", "reorganize", "move files", "rename"
- Any change that affects folder structure, file locations, or module boundaries

## Before Refactoring

1. Confirm the new structure with the user before moving files
2. Note what is changing and why

## After Refactoring

1. Update `PROGRESS.md` → `## Folder Structure` snapshot to reflect new layout
2. Update `PROGRESS.md` → `## Architecture Decisions` with a note explaining the change and reason
3. Check that run instructions in `PROGRESS.md` still work with the new structure
4. If import paths or module names changed, verify no broken references remain
5. Commit with message: `refactor: <one-line description>`

## What NOT to Touch

- `IDEA.md` — refactors don't change the idea
- Session log — only session end writes to that
