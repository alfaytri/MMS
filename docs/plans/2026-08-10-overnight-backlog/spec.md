# Overnight Backlog — Spec

**Date:** 2026-08-10
**Folder:** `docs/plans/2026-08-10-overnight-backlog/` (spec.md + plan.md)
**Source docs:** `docs/inventory-attribute-chip-n1-followup.md`, `docs/future-plans.md`
**Author:** Claude (autonomous overnight run, operator pre-authorized scope)
**Related plan:** `docs/security/2026-08-09-division-scope-rls-audit-remediation.md`

---

## 1. Purpose & scope

Work through the tracked backlog items in the two source docs in a single
overnight run. The operator authorized autonomous completion of the
**code-only** items (implement + verify + local commit) and a full
**spec + plan + draft migrations** for the Security P1 write-guards, which
must NOT be pushed to the staging DB or committed until an attended
operator-smoke pass the next morning.

### In scope

| WS | Item | Disposition tonight |
|----|------|---------------------|
| **WS1** | N+1 batch on inventory attribute chips (`docs/inventory-attribute-chip-n1-followup.md`) | **Implement + verify + commit** (own branch) |
| **WS2** | Delete 3 dead inventory components (`future-plans.md` §"Dead inventory component deletion") | **Implement + verify + commit** (own branch) |
| **WS3** | Inventory-tree low-priority nits, code-only subset (`future-plans.md` §"Inventory-tree low-priority nits") | **Implement + verify + commit** (own branch) |
| **WS4** | Security P1 per-table write-guards (`future-plans.md` §"Security P1", plan §5 P1) | **Spec + plan + draft migrations only** — staged, not pushed, not committed |

### Explicitly out of scope (and why)

- **`fifo_cost_layers.receival_id` text→uuid FK** — its own note flags it
  "high-blast-radius, never fold into a feature branch." Needs a dedicated
  attended branch. Excluded from all overnight work.
- **Brand-dedup migration cross-table hardening** — moot on staging (the
  cascade-dependent tables don't exist there, verified 2026-08-08); only
  matters "before a prod/dev replay." No action tonight.
- **WS3 nit: stale FK / RLS-policy names from the `inventory_brand_variants`
  → `inventory_item_brand_variants` rename** — renaming DB constraints/policies
  is a migration touching the live DB; not code-only and not verifiable
  without an attended DB session. **Deferred**, noted in plan.
- **Pushing WS4 guard migrations to staging + committing them** — each guard is
  a BEFORE trigger that *blocks* writes; a mis-audited guard silently breaks a
  legitimate RPC/UI save. The item's own process (plan §6) mandates an operator
  smoke of every legit write flow before the change is "done," which cannot run
  unattended. Draft migrations are written and staged for the morning.

---

## 2. WS1 — Batch the inventory attribute-chip fetches (N+1)

### Problem (re-verified against current code, 2026-08-10)

The followup doc predates the current code. Today:

- `AttributeChipStrip` (`src/components/shared/AttributeChipStrip.tsx`) imports
  from `@/hooks/useAttributes` and already batches **options** via
  `useAttributeOptionsBatch`. The remaining N+1 is `useItemAttributes(itemId)`
  (`useAttributes.ts:295`) — **one query per rendered item row**.
- Render path: `ItemsListView → CategoryRow → ItemRow → AttributeChipStrip`.
  Expanding a category with N direct items fires N `inventory_item_attributes`
  queries just for the chips.
- The batch primitive **already exists**: `useItemAttributesByCategory(categoryId)`
  (`useAttributes.ts:240`) fetches every item→attribute row for a category in
  **one** `.in`/`.eq` query and returns `Map<itemId, Map<definitionId, optionId>>`
  — exactly the shape a chip strip needs. `CategoryRow` already calls it, but only
  when an attribute filter is active (`CategoryRow.tsx:107`).

### Approach (Option A from the followup, adapted to existing primitives)

Feed the already-batched category map to the chip strips via an **optional React
context**, with the per-item query as a fallback so non-list callers keep working.

1. **New context** `src/components/shared/ItemAttributesContext.tsx`:
   `{ byItem: Map<string, Map<string,string>>; ready: boolean } | null`
   (default `null`). A `useItemAttributesContext()` reader hook.
2. **`CategoryRow`**: change the `useItemAttributesByCategory` gate from
   `expanded && attrFilterActive` to `expanded` (load whenever the category is
   open — it is now needed for both filtering *and* chips). Wrap the mapped
   `ItemRow`s in `<ItemAttributesContext.Provider value={{ byItem, ready }}>`.
   `ready` = query has resolved (data !== undefined).
3. **`AttributeChipStrip`**: read the context. If a provider is present and
   `ready`, build chips from `ctx.byItem.get(itemId)` (empty map ⇒ no chips,
   renders `null`, **no query fired**). If no provider (e.g. `ItemAttributesSection`),
   fall back to `useItemAttributes(itemId)`.
4. **`useItemAttributes`**: add an optional `{ enabled }` arg so the chip strip
   can disable the per-item query when the context supplies the data. This keeps
   the Rules of Hooks satisfied (the hook is always called; only `enabled` varies).

`buildChips` is refactored to take a `Map<definitionId, optionId>` (pickMap)
directly; both the context map and the fallback-rows-to-map conversion feed it.

### Non-goals

- No server-side view/RPC (Option B) — Option A is localized and low-risk.
- No change to chip appearance, labels, values, order, or `maxChips`.
- Provider scope is **per expanded category** (each `CategoryRow` owns its own
  batch), matching the followup's "one query per expanded category, not per item."

### Acceptance criteria

- [ ] Expanding a category with N items fires **one** `inventory_item_attributes`
      query for chips, not N (verify in the browser Network panel).
- [ ] Chips render identically (same labels/values/order/overflow).
- [ ] `.limit()` present on every attribute query touched (already true:
      `useItemAttributesByCategory` has `.limit(5000)`).
- [ ] `ItemAttributesSection` (non-list caller) still renders chips via the
      fallback — no provider required.
- [ ] `tsc --noEmit` clean.

---

## 3. WS2 — Delete dead inventory components

### Targets (from `future-plans.md`)

- `src/components/services/inventory/InventoryColumnPicker.tsx` — standalone.
- `src/components/master-data/BrandVariantFormDialog.tsx`
- `src/components/master-data/InventoryItemFormDialog.tsx`

The two form dialogs were historically the only writers of `brand_id`; the
brands/origin feature (merged 2026-08-08) shipped the live brand picker, so they
are superseded. Deletion was gated on "after the live picker exists" — that
gate is now satisfied.

### Approach

1. Grep `src/` for real `import` statements of each component (not doc/comment
   references). Confirm **zero** imports for all three.
2. Delete the three files.
3. `tsc --noEmit` must stay clean.

### Guard / risk

- If any file turns out to still be imported, **do not delete it** — leave a note
  in the plan and skip that file. (Evidence so far: only doc/comment references;
  `BrandCombobox.tsx:23` mentions `BrandVariantFormDialog` in a *comment* only.)

### Acceptance criteria

- [ ] `grep` shows zero live imports of each deleted file.
- [ ] Files deleted; `tsc --noEmit` clean.
- [ ] No runtime route/component references the deleted files.

---

## 4. WS3 — Inventory-tree low-priority nits (code-only subset)

A single polish pass over the items surfaced in the inventory-tree audit.
Each is small, additive, and verifiable by `tsc` + reading the diff.

| # | Nit | Fix |
|---|-----|-----|
| 3a | `staleTime: 0` on variant-stock hooks → refetch noise on every hover/mount | Set a sane `staleTime` (align with sibling hooks, e.g. `30_000`) |
| 3b | Icon-only buttons use `title=` not `aria-label` (`CategoryRow`, `ItemRow`, `BrandVariantRow`) | Add `aria-label` to icon-only buttons (keep `title` where it doubles as a tooltip) |
| 3c | Duplicated `filterTree` helper in `ItemsListView.tsx` and `ToolsAssetsView.tsx` | Extract to a shared util (`src/lib/inventory/filterTree.ts`), import in both |
| 3d | `FifoLayersTable` skeleton widths don't match data columns → visible shift on load | Match skeleton cell widths/count to the real columns |
| 3e | Inconsistent sort-arrow placement (`CategoryRow` right vs `ToolCategoryRow` left) | Standardize placement across both rows |
| 3f | `.limit()` gaps on inventory list hooks not touched by brands/origin | Add `.limit(N)` per the Supabase-budget rule |

**Deferred (not code-only):** stale FK / RLS-policy names from the table rename —
requires a DB migration + live verify; tracked in `future-plans.md`, not done tonight.

### Approach

- Read each target file, apply the minimal fix, keep the existing style/idiom.
- Each nit is independently revertible; group them into one commit ("chore:
  inventory-tree polish") with a body enumerating 3a–3f.
- Where a nit's target is ambiguous (e.g. exactly which hooks lack `.limit()`),
  grep to enumerate before editing; record the concrete list in the plan.

### Acceptance criteria

- [ ] Each applicable nit fixed; `tsc --noEmit` clean.
- [ ] No behavior change beyond the stated intent (chips, sorting, filtering
      results identical; only a11y/perf/consistency improve).
- [ ] Every list query touched has an explicit `.limit()`.

---

## 5. WS4 — Security P1 per-table write-guards (spec + draft only)

### Problem

The app-wide `division_scope_*` RLS gates writes only on
`is_division_visible(division_id)`, not on *which column/state* is written. P0
revoked writes on the 7 RPC-only tables. P1 adds BEFORE-trigger guards to the
tables that still need some direct client writes but must protect specific
money/workflow columns. Template shipped and to be mirrored:
`guard_so_privileged_status` (`20260819110000`), `guard_po_locked_columns`
(`20260819130000`).

### Guard pattern (invariant for every table)

```sql
CREATE OR REPLACE FUNCTION public.guard_<table>_<what>()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'          -- SECURITY INVOKER (default)
AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN
    RETURN NEW;                       -- DEFINER RPCs + service role pass
  END IF;
  -- block privileged column/status writes here (RAISE 42501)
  RETURN NEW;
END; $$;
```

- `SECURITY INVOKER` so `current_user` is the real caller.
- `current_user IN ('authenticated','anon')` gate ⇒ only direct PostgREST client
  writes are blocked; every SECURITY DEFINER workflow RPC passes.
- `SET search_path TO 'public'`.
- STAGING-only migration **plus** a byte-identical mirror in
  `supabase/migrations-staging/` (project rule).

### Tables to guard (protected fields from plan §4; **final column lists
confirmed in plan.md via the write-path audit**)

- **`payments`** — block direct client edits to `amount` / `amount_qar` /
  `exchange_rate` / `direction` and re-linking `invoice_id` / `bill_id` /
  `credit_note_id`; allow `qb_synced` etc. Legit edits go through
  `rpc_edit_*_payment` / `rpc_delete_*_payment`.
- **`so_invoices`** — block client writes to `total_amount` / `subtotal` /
  `paid_amount` / `payment_status`; allow `needs_refresh` / `qb_synced` /
  `status:'void'`.
- **`so_po_returns`** — block forging workflow-only statuses; allow the
  creation/cancel states (exact allow-list confirmed in plan.md).
- **`sale_deliveries`** — block direct writes to workflow-only delivery
  statuses; only `complete_delivery_inventory` / delivery RPCs set them.
- **`credit_notes` / `debit_notes`** — lock amount + status against direct
  client writes; issuance/redemption/void flow through their DEFINER RPCs.

Lower-confidence (guard **only** if the write-path audit confirms a direct
client write to a privileged column AND direct grants): `po_line_items`,
`payment_plans`, `receivals`, `shipments`.

### Required per-table work (deferred to the attended morning session)

1. Confirm the table still has direct `authenticated` write grants (prefer a full
   P0-style revoke if every writer is DEFINER).
2. Audit `src/` for any legit direct client write to the protected
   columns/statuses before adding the guard.
3. Add the guard trigger (INVOKER, `current_user` gate, `search_path`),
   STAGING-only + byte-identical mirror.
4. Live-verify (`prosecdef=false`, trigger enabled, grants) + operator-smoke
   every legit write flow **before** commit.

### Tonight's WS4 deliverable

- Per-table write-path audit written into plan.md (backed by the audit agent's
  file:line findings).
- **Draft** migration files authored under
  `docs/plans/2026-08-10-overnight-backlog/draft-migrations/` — deliberately
  **outside** the `supabase/migrations/` tree so `supabase db push` can never
  pick them up. The attended morning session reviews them, then copies each into
  `supabase/migrations/YYYYMMDDHHMMSS_*.sql` + the byte-identical mirror in
  `supabase/migrations-staging/` after audit sign-off.
- Explicit morning checklist (verify + smoke steps per table).

### Acceptance criteria (tonight)

- [ ] plan.md contains a per-table audit with concrete protected column lists
      and the legit client write-paths that must still pass.
- [ ] Draft guard migrations authored for each confirmed table under
      `draft-migrations/`, following the template exactly.
- [ ] Nothing under `supabase/migrations/` is added; nothing pushed; no migration
      is applied. The morning checklist is written.
- **Committal note (deviation from the initial "uncommitted" wording):** the WS4
      artifacts — audit, morning checklist, and the seven draft `.sql` files — are
      committed as **docs** under `docs/plans/2026-08-10-overnight-backlog/` with
      loud `DRAFT — NOT APPLIED` headers, deliberately **outside**
      `supabase/migrations/`. This preserves the work (untracked files risk loss)
      and keeps it reviewable, while `supabase db push` still cannot see it. No
      migration and no application code is committed for WS4.

---

## 6. Git & verification strategy

- **Branches (per module, off current HEAD `feature/security-p1-po-column-lock`):**
  - `perf/inventory-attribute-chip-n1` — WS1
  - `chore/inventory-tree-cleanup` — WS2 + WS3
  - WS4 drafts live as **uncommitted / untracked** files (holding dir); no branch commit.
- **Commit discipline:** one focused commit per item, dual co-author trailer
  (Mohamed Ismail + Claude), PROGRESS.md updated on start + completion (separate
  docs commit), EOD file appended. **No push, no PR** — operator reviews and
  pushes in the morning.
- **Verification (silent, agent-runnable):** `npx tsc --noEmit` after each WS;
  grep for zero imports (WS2); grep to confirm one query path (WS1); enumerate
  `.limit()` gaps (WS3f).
- **Verification (operator, morning):** Network-panel query-count check (WS1),
  visual chip parity, and the full WS4 per-table smoke before any guard push.

## 7. Risks & rollback

- **WS1** — context wiring bug could drop chips or double-fire queries. Mitigation:
  fallback path preserved for non-list callers; verify query count in Network panel.
  Rollback: revert the branch (isolated).
- **WS2** — deleting a still-referenced file. Mitigation: grep gate before delete;
  `tsc` catches any missed import. Rollback: `git revert`.
- **WS3** — a nit changes behavior unintentionally (e.g. `.limit()` too low hides
  rows). Mitigation: pick limits ≥ existing implicit caps; read each diff.
- **WS4** — not applied tonight, so zero live risk. The morning session carries the
  smoke-before-commit discipline from plan §6.
