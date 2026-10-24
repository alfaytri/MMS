## What & why
<!-- What does this PR change, and why? Link the task/issue it addresses. -->

## How to test
<!-- Steps for the reviewer to verify it works (pages, actions, expected result). -->

## Checklist
- [ ] Branched off `full-build/admin-misc` and this PR targets it
- [ ] `npx tsc --noEmit` passes (no type errors)
- [ ] `npx vitest run` passes for the affected areas
- [ ] No secrets committed (no `.env*`, keys, tokens, DB dumps, data files)
- [ ] Any destructive action (delete/remove/archive) goes through a confirmation dialog
- [ ] I self-reviewed the diff and removed debug/console leftovers
