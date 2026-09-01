# Phase 7 continuation — Sub-task 7.1 done, Sub-task 7.2 next

> **Handoff for a fresh Claude session after `/clear`.**
> When Mohamed hands you this file, follow the instructions at the bottom exactly.

## Context you need before doing anything

**Project:** MMS — modular monolith on Supabase (Postgres 15) + Next.js App Router.
**Branch:** `deploy/warehouse-shipping`
**Environment target:** staging only (`wkmvjxxmzstsvahuiwsz`). Dev DB push is deferred (memory note `project_dev_db_pending_migrations.md`).

**Current phase:** Phase 7 — Dual-Ledger for Damaged Units. Splits the Phase 6 `return_line_resolutions` single ledger into two independent ledgers (customer resolutions + inventory dispositions) so damaged returns under seller-fault reasons can compensate the customer AND book the physical unit's disposition on the same return line.

**Phase 6 (predecessor):** fully complete. All 10 sub-tasks shipped + security audit filed. See `PROGRESS.md` `## ✅ Completed` for the trail.

**Phase 7 status:**
- ✅ **Plan drafted** — `docs/superpowers/plans/2026-07-29-phase-7-dual-ledger-damaged-units.md` (local only — `docs/superpowers/` is gitignored, but the file exists on disk).
- ✅ **Sub-task 7.1 DB scaffolding COMPLETE** — three commits already landed:
  - `c75ee856` — docs: PROGRESS.md start
  - `7b41b9f8` — feat(db): Phase 7.1 (tables) — dual-ledger tables
  - `23b339a5` — feat(db): Phase 7.1 (views + backfill) — dual-ledger views with backward-compat aliases
  - `ffbd2e72` — docs: PROGRESS.md 7.1 complete
- ⏳ **Sub-task 7.2 NEXT** — rewritten action RPCs + dual-ledger `_maybe_close_return`.

## Key decisions already locked (do not re-ask)

1. **Two separate tables** — `return_line_customer_resolutions` + `return_line_inventory_dispositions`. NOT one table with a `dimension` column.
2. **Historical fix: auto-migrate + "Compensation not recorded" chip** for existing write-off-only returns (SR-00007/00008/00009 already flagged `compensation_missing = true` in the view).
3. **Dialog shape: extend `ReplacementDeliveryDialog`** with per-row Disposition dropdown for damaged rows. Blanket write-off checkbox retires.
4. **Transition strategy: backward-compat aliases in the new views** — Phase 6 UI keeps working untouched between 7.1 and 7.4. Old field names (`resolved_qty` / `remaining_qty` / `resolutions_by_type` / `total_resolved` / `total_remaining` / `coverage_status`) preserved in original view positions and semantically map to the customer dimension. Drop aliases in a Phase 8 cleanup after all callers are migrated.
5. **`restock_as_damaged` and `send_for_repair` disposition types** are schema-supported in the new inventory table but the action RPC will raise "not yet implemented" — Phase 8/9 work. Only `write_off` is fully implemented in Phase 7.
6. **Legacy `return_line_resolutions` table stays alive** during Phase 7 for rollback safety. Drop in a follow-up Phase 8 migration.

## What Mohamed needs to test on staging BEFORE you start 7.2

Sub-task 7.1 replaced the two progress views. Backward-compat aliases mean Phase 6 UI should be identical to before. Test on staging (`https://…` — Mohamed has the URL):

1. **Open any existing return** via SO detail → Returns tab. Try SO-00016 (has SR-00008, SR-00009), SO-00015 (has SR-00007), SO-00014 (has SR-00003, SR-00004).
2. **Ledger summary line** — should render exactly like before, e.g. `5 returned · 3 store credit · 2 remaining` on SR-00007.
3. **Status pill** — SR-00007 should still show green `Resolved · Mixed` or amber `Restocked` (whichever it was before). SR-00003 should still show `Resolved · Replacement`. SR-00004 same.
4. **Replacement chip(s)** — SR-00003 shows `Replacement: DEL-XXXXX`, SR-00008 same, etc.
5. **ReplacementDeliveryDialog** — click "Send Replacement" or "Resolve Remaining" on any restocked return. Confirm the dialog opens with correct pre-filled qtys per line, damaged rows locked at 0, write-off checkbox still shows when damaged qty remains, source warehouse pre-filled.
6. **CN Refund/Store Credit picker** — open any CN's Refund or Store Credit action, confirm the picker table shows correct Already-resolved column, remaining qty caps, subtotal.
7. **`/sales/returns` list page** — every row still shows ledger summary + replacement chip + resolved pill.

**Expected result:** NO regressions visible anywhere. Everything looks identical to before Phase 7 started. If anything renders wrong (empty summary, `undefined`, wrong count), the backward-compat aliases have a bug and 7.2 should NOT proceed until fixed.

## What Sub-task 7.2 does (start after Mohamed confirms 7.1 is clean)

Rewritten action RPCs + dual-ledger `_maybe_close_return`.

**Two migrations, in this order:**

1. **`supabase/migrations/20260730000200_rpc_dual_ledger_recorders.sql`** — new internal recorders + rewritten close helper:
   - `public._record_customer_resolution(p_return_line_id, p_resolution_type, p_qty, p_sale_delivery_id, p_credit_note_id, p_notes)` — inserts one row in `return_line_customer_resolutions` after validating `qty ≤ customer_remaining_qty`. `security definer`, `search_path = public`, revoke from public/anon/authenticated, grant to service_role.
   - `public._record_inventory_disposition(p_return_line_id, p_disposition_type, p_qty, p_inventory_stock_movement_id, p_warehouse_transfer_id, p_notes)` — same shape, validates `qty ≤ inventory_remaining_qty` AND `return_lines.condition = 'damaged'` (else raises).
   - Rewritten `public._maybe_close_return(p_return_id)` — closes only when BOTH `customer_remaining = 0` AND `inventory_remaining = 0`. Stamps `credit_notes.resolution_type` in lockstep.
   - Rewritten `public._return_resolution_status(p_return_id)` — reads only the customer ledger mix (inventory dimension doesn't affect customer-facing status).

2. **`supabase/migrations/20260730000300_rpc_dual_ledger_actions.sql`** — rewritten public action wrappers:
   - `rpc_create_partial_replacement(p_return_id, p_warehouse_id, p_lines, p_gift_items, p_dispositions default '[]'::jsonb)` — same signature as Phase 6 PLUS new `p_dispositions jsonb` parameter for per-damaged-line disposition decisions. Element shape: `{return_line_id, type: 'write_off'|'restock_as_damaged'|'send_for_repair', qty, transfer_id?}`. After creating sale_delivery + delivery_lines + customer_resolutions, iterate p_dispositions and call `_record_inventory_disposition` for each. All atomic — if disposition step raises, the whole delivery rolls back.
   - `rpc_record_return_refund(p_return_id, p_lines, p_refund_method, p_refund_reference)` — same external signature as Phase 6, internally calls `_record_customer_resolution` instead of the old `rpc_record_return_line_resolution`.
   - `rpc_record_return_store_credit(p_return_id, p_lines)` — same treatment.
   - NEW `rpc_record_inventory_disposition(p_return_id, p_warehouse_id, p_dispositions)` — dedicated action for after-the-fact inventory disposition. For each disposition:
     - `'write_off'` → insert `inventory_stock_movements(movement_type='sale_return_damaged', reference_type='return', reference_id=p_return_id)`, then `_record_inventory_disposition` linking that movement.
     - `'restock_as_damaged'` → RAISE 'not yet implemented' — Phase 8 work.
     - `'send_for_repair'` → RAISE 'not yet implemented' — Phase 9 work.
   - `rpc_write_off_return_damaged(p_return_id, p_warehouse_id)` — kept as thin backwards-compat wrapper: fetches remaining damaged qty per line, builds a `p_dispositions` array with `type='write_off'` for each, delegates to `rpc_record_inventory_disposition`. Preserves Phase 6 hook `useWriteOffDamagedReturn` unchanged externally.

**Full file specs are in the plan** at `docs/superpowers/plans/2026-07-29-phase-7-dual-ledger-damaged-units.md` under Task 2 — copy the structure from the Phase 6 predecessor migration `supabase/migrations/20260729040400_rpc_resolution_actions.sql` for the guard pattern, error messages, and grant surface.

**Verification after 7.2 lands:**
- `select proname from pg_proc where proname in ('_record_customer_resolution','_record_inventory_disposition','_maybe_close_return','_return_resolution_status')` → 4 rows.
- `select proname from pg_proc where proname in ('rpc_create_partial_replacement','rpc_record_return_refund','rpc_record_return_store_credit','rpc_record_inventory_disposition','rpc_write_off_return_damaged')` → 5 rows.
- Existing Phase 6 app hooks should keep working — they call the same RPC names with the same signatures, just internally rewired.
- Mohamed opens a fresh return, sends a partial replacement, confirms ledger rows land in `return_line_customer_resolutions`.

## After 7.2 verification, remaining sub-tasks

- **7.3 — Historical backfill** — ALREADY DONE inline in 7.1 (see migration `20260730000100`). Skip this task; note in PROGRESS.md that it was folded into 7.1 for atomicity.
- **7.4** — Hook rewire (`useCreateReplacementDelivery` accepts `dispositions`, new `useRecordInventoryDisposition` hook, update `ReturnLineProgress` / `ReturnProgress` types to expose the new dual-dimension fields).
- **7.5** — `ReplacementDeliveryDialog` per-row Disposition dropdown for damaged lines. Blanket write-off checkbox retires.
- **7.6** — "Compensation not recorded" chip on `SoReturnsTab` + `/sales/returns` list. Also extend `ReturnLedgerSummary` to render both dimensions when they differ.
- **7.7** — End-to-end verification + regression sweep (mirrors Phase 6.9).
- **7.8** — Security audit close-out (mirrors Phase 6.10).

## Reference files (open in order when picking up)

1. `PROGRESS.md` — In Progress + Completed sections for the immediate state.
2. `docs/superpowers/plans/2026-07-29-phase-7-dual-ledger-damaged-units.md` — full plan.
3. `supabase/migrations/20260730000000_dual_ledger_tables.sql` — new tables (already applied).
4. `supabase/migrations/20260730000100_dual_ledger_views_and_backfill.sql` — new views + backfill (already applied).
5. `supabase/migrations/20260729040400_rpc_resolution_actions.sql` — Phase 6 predecessor for the RPCs you're rewriting.
6. `supabase/migrations/20260729040300_rpc_resolution_recording.sql` — Phase 6 predecessor for the recorder.
7. `src/hooks/useSaleDeliveries.ts` (`useCreateReplacementDelivery` / `useWriteOffDamagedReturn`) — callers you must NOT break in 7.2.
8. `src/hooks/useCreditNotes.ts` (`useResolveCreditNoteRefund` / `useResolveCreditNoteStoreCredit`) — same.
9. `docs/phase-7-dual-ledger-damaged-units.md` — original backlog doc, gives the "why".

## Project-specific rules you must follow

- **Never `git clean -fd`** (memory `feedback_no_git_clean.md`).
- **Never run `next build`** unless Mohamed asks (`feedback_no_build.md`).
- **Never use browser/preview tools to test UI** — ask Mohamed to check manually (`feedback_no_preview_eval.md`).
- **Never commit until Mohamed confirms the change works** (`feedback_commit_policy.md`).
- **Every commit includes both Co-Authored-By trailers** via HEREDOC:
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
- **PROGRESS.md must update ON START and ON COMPLETION** of every task with an isolated commit each (`feedback_progress_update.md` + the AGENTS.md PROGRESS.md rule).
- **EOD/EOD-YYYY-MM-DD.md must append after each task completion** (`feedback_eod_report.md`).
- **Apply migrations via `npx supabase db push`** — never ask the user to run SQL manually. Project ref `wkmvjxxmzstsvahuiwsz`.
- **After `npx supabase gen types typescript --linked`**, re-append the DBTable / DBInsert / DBUpdate / AllTables helper aliases (`feedback_supabase_gen_types.md`).

## Instructions for you (fresh Claude session)

When Mohamed hands you this file:

1. **Read this file end-to-end.**
2. **Read the referenced files** (at minimum: PROGRESS.md, the plan file, and the two Phase 6 predecessor migrations for the RPC patterns).
3. **Do NOT start writing code yet.** First, ask Mohamed:
   > *"Sub-task 7.1 is done on staging. Before I start 7.2 (rewritten action RPCs), please test the seven checkpoints from the handoff doc — open SR-00003/00007/00008/00009 in the app and confirm the ledger summaries, status pills, replacement chips, ReplacementDeliveryDialog, and CN pickers all render exactly like before Phase 7 started. If everything looks identical, say ✅ and I'll start 7.2. If anything regressed, tell me what surface and what looks wrong."*
4. **Wait for Mohamed's confirmation.** Do not proceed if any regression is reported — dig into the backward-compat aliases first.
5. **On ✅**, start Sub-task 7.2 following the plan: update PROGRESS.md → commit → write the recorders migration → apply → write the actions migration → apply → verify. See "What Sub-task 7.2 does" section above for the exact interface spec.
