# Handover — Category Attributes + 3-state Permission Split

**Date:** 2026-08-04
**Branch:** `feature/category-attributes`
**Plan:** [docs/plans/2026-08-04-category-attributes-plan.md](docs/plans/2026-08-04-category-attributes-plan.md)
**Audit table:** [docs/plans/2026-08-04-permission-audit.md](docs/plans/2026-08-04-permission-audit.md)

## Current position

Phase 0 (permission foundation) shipped. Next step: **Phase 1 Task 1.1** — first DB migration for Category Attributes.

## What shipped this session

### Phase 0 — 3-state view/create/edit permission model

The plan was originally 2-state (view + edit) but was reworked mid-session to 3-state on user request. Everything below is in place:

| Task | File(s) | Status |
|---|---|---|
| 0.1: three helpers | `src/hooks/usePermissions.ts` | ✅ commit `95b5b205` |
| 0.2: PermissionTree save-time orphan validator | `src/components/master-data/PermissionTree.tsx` + `RoleFormDialog.tsx` | ✅ commit `a2919734` |
| 0.3: audit + add missing view/create/edit trios | `src/lib/permissions.ts`, `PermissionTree.tsx`, `docs/plans/2026-08-04-permission-audit.md` | ✅ commit `1d1db8ff` |
| 0.4: backfill migration | `supabase/migrations/20260804115800_perm_create_backfill.sql` | ✅ commit `773d7464` — applied to linked DB |
| 0.5: callsite sweep (**minimal only**) | Custody + Damaged Stock pages | ✅ commit `01fcd0d2` |
| — | Consumption granularity (bonus scope) | ✅ commit `bfdaf2a3` |

**Total permission keys 92 → 121.**

### Consumption granularity (added mid-session)

Beyond the plan spec. Three narrower keys added:
- `consumption.create.team`
- `consumption.create.place`
- `consumption.create.internal`
- `consumption.create` retained as umbrella (grants all three) for backwards compat

`NewConsumptionDialog` now accepts `restrictConsumerTypes?: ConsumerType[]` — Custody Team card passes `['team']`, Place card passes `['place']`, `/consumption` header passes nothing. Segmented control hides itself when only one type is allowed. Consumer sub auto-picked to match source when opened from a Custody card.

**UI-only gate** — `rpc_post_consumption` does NOT check the narrower keys. Server-side enforcement is a TBD follow-up migration if hard enforcement is needed.

## Scope decisions to respect

1. **Full app-wide `.create`/`.edit` sweep deferred** — the plan spec's Task 0.5 called for gating every mutating button in the app on the new helpers (Purchase, Sales, Master Data, Orders, Contracts, Invoices & Payments, Teams, Contact Centre). Only Custody + Damaged Stock were done because:
   - The backfill migration (Task 0.4) means all existing roles behave exactly as before — nothing is broken
   - The full sweep is polish work that unlocks the "junior can create but not edit" pattern app-wide
   - Trading immediate polish for time-to-Category-Attributes was the explicit user decision
   - **Follow-up branch: `feature/perm-sweep-app-wide` — 6 sub-tasks by module. Estimate: 1-2 focused sessions.**

2. **Legacy `.manage` keys retained everywhere** — no rename of role data. `useHasEditPermission(area)` treats `.manage` and `.edit` as synonymous. Labels rewritten from "Create, edit, and delete X" to "Edit X" now that create is a separate key, but the key strings stayed the same.

3. **PermissionTree visual polish deferred** — the auto-toggle-on view when create/edit is checked (and the visual view→create→edit indent hierarchy) is not implemented. The save-time validator (Task 0.2) is the enforcement layer. Visual convention is a follow-up UI polish task.

## What's next — Phase 1 (Category Attributes DB)

Five migrations to write, apply, and type-regen for. See the plan §Phase 1 for full SQL specs.

| Task | File | Notes |
|---|---|---|
| 1.1 | `YYYYMMDD_attribute_definitions_table.sql` | Table + branch-uniqueness trigger (walks ancestors + descendants, depth cap 10). Verify `public.touch_updated_at()` exists first via `grep -rn "touch_updated_at" supabase/migrations` — if not, inline `updated_at = now()` |
| 1.2 | `YYYYMMDD_attribute_options_table.sql` | Options + `is_archived` soft-hide + case-insensitive unique on (definition_id, lower(value_en)) |
| 1.3 | `YYYYMMDD_item_attributes_table.sql` | Per-item picked value; `ON DELETE RESTRICT` on option_id so archived options with users can't be hard-deleted |
| 1.4 | `YYYYMMDD_effective_attributes_function.sql` | `get_effective_attributes(category_id)` RPC — recursive walk with `is_inherited` flag |
| 1.5 | `YYYYMMDD_picker_step_rpc.sql` | `rpc_attribute_picker_step` — one round-trip candidate/next-attribute/next-options. Complex — expect a perf follow-up after real data lands |

**After each migration:**
```bash
npx supabase db push
npx supabase gen types typescript --linked --schema public > src/types/database.types.ts
# Re-append DBTable / DBInsert / DBUpdate / AllTables helper aliases (CLI strips them)
npx tsc --noEmit 2>&1 | head -5
```

## Working conventions used this session

- **PROGRESS.md protocol:** update `## 🔄 In Progress` when starting a task, commit alone; update `## ✅ Completed` when done, commit alone. Never batch with code commits.
- **EOD:** append numbered line to `EOD/EOD-YYYY-MM-DD.md` after every task (folder is gitignored — no `git add` needed).
- **Commits:** every commit has both trailers (`Co-Authored-By: Mohamed Ismail` + `Co-Authored-By: Claude Opus 4.7`). Use HEREDOC.
- **Inline execution mode:** user prefers moving through tasks without pausing for smoke on pure-code changes (helpers, validators). Smoke only when there's actual UI to click. On confirmation "worked" commit and move.
- **tsc gate:** `npx tsc --noEmit 2>&1 | grep -E "<file-pattern>" | head -5` should return empty before committing.

## Migrations applied to linked DB this session

- `20260804115800_perm_create_backfill.sql` — 6 non-admin roles got matching `.create` keys added for every `.manage`/`.edit` they held

Nothing pending in the migrations folder — everything's up to date on the linked (dev) DB.

## Follow-ups queued (not for this branch)

1. **App-wide callsite sweep** — `feature/perm-sweep-app-wide`. Gate New/Edit buttons on `useHasCreatePermission` / `useHasEditPermission` for Master Data, Purchase, Sales, Orders, Contracts, Invoices & Payments, Teams, Contact Centre modules.
2. **Server-side enforcement of narrower `consumption.create.*` keys** — RPC-level check in `rpc_post_consumption`. UI-only gate today.
3. **PermissionTree visual polish** — view/create/edit indent hierarchy + auto-toggle-on-view when a create/edit key is checked.
4. **Staging catch-up** — the linked DB is dev only; staging (`mwvblpgbgxipvrevkeff`) hasn't received these migrations yet.

## Resume checklist

Next session should:
1. Read this handover
2. Read `docs/plans/2026-08-04-category-attributes-plan.md` §Phase 1
3. Check `graphify-out/graph.json` for `inventory_categories`, `touch_updated_at`, `set_updated_at` — confirm the trigger helpers exist before writing migration 1.1
4. Start Task 1.1 following the PROGRESS.md / EOD protocol
