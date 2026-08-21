# Warranty Completion (Phase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the stranded warranty Phase 1 into a working, usable feature — verified issuance, a division-scoped warranty registry under Sales, origin snapshot on the certificate, and a full **sale-warranty claims/void lifecycle** wired into the existing Returns machinery.

**Architecture:** Three independently-shippable stages. Stage 1 makes issuance real and un-regressable. Stage 2 adds the registry + origin snapshot (read surfaces). Stage 3 adds `warranty_claims` as a bounded unit that *drives* the existing Returns flows (a warranty claim = "a return under warranty") rather than re-implementing them.

**Tech stack:** Next.js 15 (App Router) + TypeScript, Supabase (Postgres, RLS, PostgREST RPCs, SECURITY DEFINER), TanStack Query v5, Tailwind + shadcn/Base-UI. Migrations via Supabase CLI (staging) + guarded psql (new-prod).

**Design spec:** [docs/specs/2026-08-21-warranty-completion-design.md](../../specs/2026-08-21-warranty-completion-design.md)

---

## Stage files (execute in order)

1. [01-foundational.md](01-foundational.md) — hygiene migration (un-regress record creation) + operator issuance smoke. **Gate:** warranty_records must actually get created before Stage 2/3 are meaningful.
2. [02-registry-and-origin.md](02-registry-and-origin.md) — origin snapshot on `warranty_records` + the certificate; warranty **Records** list/search under Sales.
3. [03-claims.md](03-claims.md) — `warranty_claims` table + numbering + lifecycle RPCs + the Approach-B return wiring + Claims UI + permissions.

Each stage ships on its own: staging → operator smoke → new-prod (guarded psql) → one push.

---

## Live-verified facts this plan relies on (checked 2026-08-21, staging + new-prod)

**Real creation mechanisms (NOT the flows-registry's stale names):**
- A sale return is created by **direct client inserts** into `so_po_returns` + `return_lines` (`src/hooks/useSaleReturns.ts:244-266`, `useCreateSaleReturn`). There is **no** `rpc_create_sale_return`.
- A credit note for a return is created by the helper `createCreditNoteForReturn(supabase, returnId, ret)` — direct inserts into `credit_notes` + `credit_note_lines`, then updates `so_po_returns` (`src/hooks/useSaleReturns.ts:304-414`). There is **no** `rpc_create_credit_note_for_return`.

**Real downstream RPCs (exact signatures — reuse verbatim):**
- `rpc_complete_return_inspection(p_return_id uuid, p_splits jsonb, p_restock_warehouse_id uuid)`
- `rpc_process_return_restock(p_return_id uuid)`
- `rpc_create_partial_replacement(p_return_id uuid, p_warehouse_id uuid, p_lines jsonb, p_gift_items jsonb, p_dispositions jsonb)`
- `rpc_record_return_refund(p_return_id uuid, p_lines jsonb, p_refund_method text, p_refund_reference text)`
- `rpc_record_return_store_credit(p_return_id uuid, p_lines jsonb)`
- `rpc_close_return(p_return_id uuid, p_resolution text)`
- `rpc_send_damaged_for_repair(p_return_line_disposition_id uuid, p_repair_vendor_id uuid, p_warehouse_id uuid, p_expected_return_date date, p_notes text, p_source_division_id uuid)` — repair rides a **return-line disposition**.
- Helpers: `_maybe_close_return(p_return_id uuid)`, `_return_resolution_status(p_return_id uuid)`.

**Key columns:**
- `so_po_returns`: `id, return_number, source_type (enum), source_id, source_delivery_id, date, reason, restock_warehouse_id, credit_note_id, debit_note_id, status (enum), division_id, created_by, created_by_name, …`. **No warranty link column** → Stage 3 adds `warranty_claim_id uuid` (nullable FK).
- `return_lines`: `id, return_id, brand_variant_id, item_name, sku, qty, condition, condition_notes, sale_delivery_line_id, receival_item_id`.
- `warranty_records`: `id, warranty_number, sale_delivery_line_id, sale_order_id, customer_id, division_id, brand_variant_id, item_name, sku, qty, policy_id, policy_name_snapshot, coverage_type_snapshot, duration_months_snapshot, terms_en_snapshot, terms_ar_snapshot, void_conditions_snapshot, starts_from_snapshot, start_date, end_date, created_at, source_type (warranty_source_type)`. **No origin column** → Stage 2 adds `origin_country_id uuid` + `origin_name_snapshot text`.
- Origin source: `inventory_item_brand_variants.country_id` (FK) → `countries.name`.
- Numbering pattern to mirror: `next_warranty_number(p_source_type warranty_source_type, p_division_id uuid)` + `warranty_number_counters(source_type, division_id, next_value)`.
- Enum: `warranty_source_type` (sale/service/contract) on `warranty_records.source_type`.
- `create_warranty_records_for_delivery(p_delivery_id uuid)` is called by `complete_delivery_inventory`; live body correctly references `so_invoices` on both DBs; `warranty_records` currently has 0 rows (never exercised).

---

## Global Constraints (apply to EVERY task)

- **Migrations:** create in `supabase/migrations/YYYYMMDDHHMMSS_*.sql`, **timestamp after `20260930000200`** (repo's latest) — use `20261002*`+ so ordering is correct. Apply to staging with `npx supabase db push`. **Mirror every migration file to `supabase/migrations-staging/` in the same commit.** Apply to new-prod only via guarded psql (drift-check first) **after operator staging smoke**.
- **Source function bodies live:** before any `CREATE OR REPLACE`, fetch the current body with `pg_get_functiondef` against the linked DB — baseline schema + `database.types.ts` are stale and will regress renames. Reproduce the live body, change only the intended lines.
- **SECURITY DEFINER hardening:** every new DEFINER function: `SET search_path TO 'public'`, in-body `auth.uid()`→profile + permission check, `REVOKE EXECUTE … FROM PUBLIC, anon`, `GRANT EXECUTE … TO authenticated`.
- **RLS:** every new table `ENABLE ROW LEVEL SECURITY` + division-scoped SELECT (`is_division_visible(division_id)`) + writes routed through DEFINER RPCs (no direct client write policy for privileged columns/status).
- **Deploy discipline:** commit locally; **do not push** until operator smokes staging; **one push per deploy**; ask before pushing.
- **Frontend quality:** `npx tsc --noEmit` + eslint clean after each stage. **Never run `next build`.** Dropdowns show human labels never UUIDs; DialogTitle wraps; number inputs use `1,000,000` format via `formatCurrency`/`formatNumber`; responsive across the 4 breakpoints; no layout shift on interaction; 44px mobile targets.
- **Supabase budget:** every list query has `.limit(N)` + explicit columns (no `select('*')` on lists); no unfiltered realtime; pause polling on `document.hidden`.
- **Not-yet-typed RPCs:** new RPCs won't be in `database.types.ts` until regen — call via the established `supabase.rpc('name' as never, args as never)` cast, or regenerate types + re-append the 4 helper aliases.
- **Flow registry:** add/extend the `docs/flows-registry.md` entry **in the same commit** that ships each new flow.
- **Commits:** HEREDOC with both trailers:
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
- **After each stage:** update PROGRESS.md (In Progress + Completed + Security Audit Log) in a docs-only commit; append to `EOD/EOD-YYYY-MM-DD.md`.

---

## Out of scope (do NOT build — designed-for, deferred)

Service & contract claim workflows (the `warranty_type`/`workflow` discriminator leaves room; only the **sale** workflow is built now — service is currently tracked as Consumption and the type may be re-pointed later). Warranty expiry / "expiring soon" / alerts. Service/contract issuance writers.
