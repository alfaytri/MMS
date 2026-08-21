# Warranty Module — Completion (Phase 2) Design Spec

**Date:** 2026-08-21
**Status:** Design approved (operator), pending spec review → implementation plan
**Branch:** deploy/warehouse-shipping
**Related:** `docs/plans/2026-08-05-warranty-phase-1.md`, `docs/handover-2026-08-05-warranty-phase-1.md`, `docs/plans/2026-08-10-warehouse-origin-visibility/deferred-and-warranty-readiness.md`, flows-registry `Create Sales Return`/`Complete Return Inspection`/`Restock Sales Return`/`Issue Credit Note for Sales Return`/`Create Partial Replacement`.

---

## 1. Why this exists

Warranty was built as a Phase 1 (7 migrations dated 2026-08-15) and then left **unverified and half-usable**. Live-verified state (staging `mwvblpgbgxipvrevkeff` + new-prod `optishfnnctrhffpoywg`, 2026-08-21):

- **Config half works & is reachable:** `warranty_policies` CRUD (Admin → Warranty Policies, `AdminSidebar.tsx:64`), per-category default policy, per-item override, `get_effective_warranty_policy` resolver, effective-warranty preview badges on items and SO lines.
- **Issuance half is wired but never run:** `complete_delivery_inventory` calls `create_warranty_records_for_delivery`, which (live, both DBs) correctly references `so_invoices` — **but `warranty_records` has 0 rows on both DBs** because no real delivery has ever gone through. The certificate PDF buttons (`DeliveryDetailDialog.tsx:272`, `sales/invoices/[id]/page.tsx:162`) only render when a record exists, so they are dead-in-practice today.
- **Missing entirely:** any way to view/list/search warranty records; any claims/void workflow; country-of-origin on the record/certificate; service & contract issuance writers.
- **Latent landmine (files only, not live):** the corrective migration `20260806280200_fix_warranty_delivery_hook_invoices_ref.sql` sorts *before* the broken `20260815003700`, so a **fresh `db push` from an empty DB would re-break** record creation. Both live DBs currently hold the correct body.

The operator wants warranty **finished properly**, including a **claims/void workflow**, so it becomes a real end-to-end feature rather than a stranded Phase 1.

---

## 2. Goals / Non-goals

### In scope (this phase)
1. **Foundational fixes** so the feature actually works and can't silently regress:
   - Re-issue the `public.invoices → so_invoices` fix as a migration dated **after** `20260815003700`.
   - Verify issuance end-to-end (a real delivery creates a `warranty_record`; the certificate prints).
2. **Warranty registry** — a division-scoped list/search of warranty records with drill-in, under **Sales**.
3. **Origin snapshot** — bake country-of-origin onto `warranty_records` + the certificate (legal immutability). *(Small; operator may veto at review.)*
4. **Warranty claims — full lifecycle, SALE source only**, wired into the **existing Returns machinery** (Approach B): file → covered/rejected → resolution via return→inspection→restock→credit/replacement/repair → resolved; plus **void** with reason. All statuses monitored in one place.
5. **Permissions** for the new surfaces, following the app's grantable-key pattern.

### Explicitly deferred (future phases — design for, don't build)
- **Service & contract claim workflows.** These are materially different (inspection visit, backwork, re-installation; MEP differs). The data model must make warranty **type** (sale/service/contract) first-class and let the claim workflow **branch by type**, but only the **sale** workflow is built now. Note: service work is currently tracked as **Consumption** and may migrate to a dedicated service side later, so keep the warranty **type** loosely coupled — switching it later must not require reworking the sale path.
- **Warranty expiry / "expiring soon" / alerts.**
- **Service/contract issuance writers** (only `source_type = 'sale'` has a writer today).

---

## 3. Design

### 3.1 Foundational (do first — nothing else is meaningful without records existing)

- **Migration hygiene:** new migration (timestamp after `20260815003700`) that re-applies the correct `create_warranty_records_for_delivery` body (the verbatim `so_invoices` version already in `20260806280200`), so a from-scratch rebuild produces the working version. Confirm `so_invoices` has the columns the body reads (`issued_date`, `sale_order_id`). No behavior change on the live DBs (they already have this body) — this closes the rebuild landmine.
- **Issuance verification:** operator-run smoke — complete a real delivery on a costed, warranty-covered item → confirm one `warranty_record` per delivered line is created with the snapshotted policy + number, and the certificate PDF prints. This exercises the never-run path and surfaces any latent runtime issue before we build on top of it.

### 3.2 Data model

**`warranty_records` (existing) — add:**
- `origin_country_id` (FK) + `origin_name_snapshot` (text), captured at record creation for immutability. Populate in `create_warranty_records_for_delivery` from the delivered line's variant/origin.

**`warranty_claims` (new table):**
- `id`, `warranty_record_id` (FK → warranty_records, RESTRICT), `warranty_type` (snapshot of the record's `source_type`: sale/service/contract — drives which workflow applies),
- `status` (enum, see 3.3), `issue_description`, `reported_by` (profile), `reported_at`,
- `decision` (covered / rejected), `decided_by`, `decided_at`, `decision_reason`,
- `resolution_type` (replacement / credit / refund / repair — for sale), `resolved_at`,
- `linked_return_id` (FK → so_po_returns, nullable), `linked_credit_note_id` (nullable),
- `void_reason`, `voided_by`, `voided_at`,
- `division_id` (for RLS scope), `claim_number` (scoped counter, mirror the `next_warranty_number` pattern), timestamps.
- **RLS:** enabled, division-scoped SELECT (`is_division_visible(division_id)`); **all writes via SECURITY DEFINER RPCs** with in-body `auth.uid()` + permission checks, `REVOKE EXECUTE FROM PUBLIC, anon`, grant `authenticated` (matches the app-wide pattern; see the go-live security work).
- A `workflow` discriminator derived from `warranty_type` so service/contract branches can be added later without touching the sale path.

### 3.3 Claim lifecycle (state machine)

```
open ──assess──► covered ──start resolution──► in_progress ──(return resolved)──► resolved
  │                 │
  │                 └──────────────────────────────────────────────────────────► void (reason)
  └──assess──► rejected (reason)
open/covered/in_progress ──────────────────────────────────────────────────────► void (reason)
```

- **open:** filed against a warranty record (issue, reporter, date).
- **covered / rejected:** the "is it covered?" decision, with reason.
- **in_progress:** a resolution has started (a warranty-flagged return exists).
- **resolved:** the linked return reached its terminal resolution; `resolution_type` stamped from the outcome.
- **void:** warranty/claim invalidated (misuse, out of policy) with a reason; allowed from open/covered/in_progress.

All transitions are RPC-driven and division/permission-gated. The registry + claims list surface every status ("monitor").

### 3.4 Sale claim workflow (Approach B — ride the Returns machinery)

A warranty claim on a **sale** is "a return under warranty." No parallel resolution engine is built — the claim drives the **existing** return flows (flows-registry: `Create Sales Return` → `Complete Return Inspection` → `Restock Sales Return` → `Issue Credit Note for Sales Return` / `Create Partial Replacement` / `Record Return Refund`). Concretely:

1. **File** a claim from a warranty record → `open`.
2. **Assess** → `covered` or `rejected(reason)`.
3. **Start resolution** (covered only): create a **warranty-flagged sale return** by reusing the existing return-creation RPC, linked to the claim + the record's original delivery/SO. Claim → `in_progress`, `linked_return_id` set.
4. The return then rides the **existing** machinery unchanged:
   - **Inspection** decides good vs damaged (the "is it OK / damaged before we take it back" step the operator described).
   - **Restock** good units; **disposition** damaged units.
   - **Outcome**: Credit Note / Replacement delivery / Refund via the existing RPCs. **Repair**: a repairable returned unit rides the existing damaged-disposition → send-for-repair path.
5. When the return reaches its terminal state, the claim → `resolved` with `resolution_type` derived from the outcome; `linked_credit_note_id` set when a CN was issued.
6. **Void** anytime with a reason.

**Interface boundary (isolation):** `warranty_claims` is a bounded unit that *consumes* the returns machinery through its public RPCs + a `linked_return_id` reference and a status-sync (trigger or RPC) that reads the return's terminal state. It does **not** duplicate return logic. This keeps one source of truth (Returns) and lets the claim layer be understood/tested on its own.

**Open items to verify during planning (the flagged "doubt"):** the exact live signatures of the return-creation RPC and the damaged-disposition→repair path (`pg_get_functiondef` against the linked DB), and whether the return schema needs a `warranty_claim_id` link column vs. reverse-linking from the claim. Resolved in the implementation-plan step, not here.

### 3.5 UI / navigation

- **Sales group** gains a **"Warranties"** area (per operator) with two tabs:
  - **Records** — division-scoped registry: list/search warranty records, drill into one (policy, dates, origin, source delivery/customer, certificate button).
  - **Claims** — file / assess / start-resolution / void; a status-filtered list that "monitors" all claims (open/covered/rejected/in_progress/resolved/void).
- **Warranty Policies stays under Admin** (unchanged).
- Reuse existing shared table/dialog components; follow responsive + dropdown-label + dialog-title-wrap conventions.

### 3.6 Permissions (grantable keys, NAV_TREE)

- `sales.warranties.view` — see the Records + Claims lists.
- `sales.warranty_claims.manage` — file/assess/resolve/void claims.
- (Policies keep their existing `master_data.admin.view` gate.)
- Enforce in DB RPCs (in-body permission check) **and** gate the UI buttons/routes (`route-permissions.ts` + NAV_TREE), matching the create-vs-edit pattern from the permission-hardening work.

---

## 4. Sequencing / phased delivery

1. **Foundational:** hygiene migration + operator issuance smoke (records must exist before anything else is useful).
2. **Registry:** warranty-records list/search under Sales + origin snapshot on the record/certificate.
3. **Claims (sale):** `warranty_claims` table + RPCs + lifecycle + the Approach-B return wiring + Claims UI + permissions.

Each stage is independently shippable (staging → operator smoke → new-prod + push), following the project's one-push-per-deploy rule.

---

## 5. Testing / verification

- **DB:** rolled-back DO-block probes for each new RPC (file/assess/resolve/void; RLS division scope; permission gate rejects unauthorized; the claim→return link + status sync). `pg_get_functiondef` verification of any reused/modified function bodies before writing SQL (project rule — live DB is authoritative).
- **Type/lint:** `tsc --noEmit` + eslint clean.
- **Operator smoke (staging):** issuance (delivery→record→certificate); file a claim → cover → resolve via return→inspection→credit/replacement; reject; void; permission gate hides the surfaces for a role without the keys.
- Mirror every migration to `supabase/migrations-staging/`.

---

## 6. Risks / watch-items

- **Issuance had never run** — the foundational smoke may surface a latent runtime bug in `create_warranty_records_for_delivery` (e.g., a column mismatch). Treat that as part of step 1, not a surprise later.
- **Return-machinery coupling** — reusing return RPCs means warranty resolution inherits their guards (e.g., SO status ∈ delivered/invoiced/closed). Confirm a warranty claim's originating delivery satisfies them; if not, decide whether the claim-created return needs a distinct guard path.
- **Type migration** — service currently = Consumption and warranty `type` may be re-pointed later; keep `warranty_type`/`workflow` decoupled so that move doesn't touch the sale path.
- **Egress/quota** — the registry list must follow the Supabase budget rules (`.limit()`, no wide `select('*')`, no unfiltered realtime).

---

## 7. Explicitly out of scope (restate)

Service & contract claim workflows; warranty expiry/alerts; service/contract issuance writers. Designed-for (type-branching, deferred docs) but not built this phase.
