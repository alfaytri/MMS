# Money-Path Review — Session Handover (2026-08-05)

**Read this after `/clear` to resume where we left off.**

---

## TL;DR

Ran an adversarial multi-agent QA review over the **Core Money Path** (Purchase → Receival → FIFO → Landed Cost → COGS → Invoices/Payments). **28 confirmed defects** (12 critical + 15 high + 1 latent medium) + **1 migration blocker**. Findings are logged in `docs/release-checklist-money-path.md`.

**Money path is not deploy-ready.** Do not merge `deploy/warehouse-shipping` to `main` until at least the criticals are fixed.

Next up: run the same workflow shape over the **six uncovered domains** listed below, then triage into fix batches.

---

## What's on disk from this session

| File | Purpose |
|---|---|
| `docs/release-checklist-money-path.md` | Full release checklist (10 sections) + all 28 confirmed findings + migration blocker. Each finding has: severity, file:line, why, repro, minimal fix. |
| `docs/handover-2026-08-05-money-path-review.md` | This file. |

Workflow artifacts (transcripts, journal, per-agent results):
- Run ID: `wf_f9705f92-0c7`
- Script: `C:\Users\IT\.claude\projects\D--MMS\c485ee00-bbd7-42ec-b1cd-122214a6823d\workflows\scripts\money-path-review-wf_f9705f92-0c7.js`
- Transcript dir: `C:\Users\IT\.claude\projects\D--MMS\c485ee00-bbd7-42ec-b1cd-122214a6823d\subagents\workflows\wf_f9705f92-0c7\`
- Full result (all 28 finding bodies + verifier reasoning): `C:\Users\IT\AppData\Local\Temp\claude\D--MMS\c485ee00-bbd7-42ec-b1cd-122214a6823d\tasks\w5i42wtft.output`

No code changes were made this session. Nothing to commit.

---

## Review shape (for reference — same shape to reuse on the next pass)

- 6 domain finders in parallel (`effort: high`, `general-purpose` agents)
- Each raw finding was handed to a separate adversarial verifier told to **default to REFUTED** unless it could reproduce the failure from current code
- 1 migration-sanity agent swept the full `supabase/migrations/` tree
- 35 raw → 28 confirmed (7 refuted and dropped)
- 3.3M subagent tokens, 693 tool calls, ~24 min wall clock

---

## Confirmed findings — headline summary

Full details in `docs/release-checklist-money-path.md`. Do NOT re-derive these from memory — always read the checklist.

### 🚨 12 CRITICAL — block deployment
1. `po_line_items` delete errors swallowed → duplicate lines + broken PO totals (`usePurchaseOrders.ts:531`)
2. PO edit silently CASCADEs and wipes every supplier RFQ quote row (`usePurchaseOrders.ts:953`)
3. PO return cancel never restores `fifo_cost_layers.remaining_qty` — permanent FIFO corruption
4. PO return cancel INSERTs NULL `warehouse_id` + `sub_container_id` — every cancel raises NOT NULL
5. `allocate_landed_cost` mis-scopes FIFO layers — freight cost bleeds onto stock in other warehouses
6. `apply_receival_edit` qty branch omits `sub_container_id` (NOT NULL) — every approved qty edit fails
7. `apply_receival_edit` cost branch writes PO currency into QAR columns — inventory value ~72% understated on FX POs
8. `useApplyCreditNote` allows same CN to be double-consumed as payment + store credit
9. `useApplyCreditNote` can insert negative payment and stamp wrong `payment_status`
10. `useSettleInstallment` overwrites `paid_amount`, always stamps 'paid', PAY-ids via `COUNT(*)` race
11. `useApplyStoreCredit` has no server-side ownership/balance validation — any user can drain any customer's CN
12. `useIssueCreditNote` inserts non-existent `amount` column, never sets `total_amount`

### ⚠️ 15 HIGH — must fix before deployment
Full list in the checklist. Concentrations: non-atomic create paths (H1, H2, H15), missing over-allocation guards (H11, H4), FX/currency mixing (H12), silent status writes with no error checks (H13, H14), retro-COGS gaps (H8), FIFO scope errors (H9, H10).

### 🧭 1 MEDIUM (latent)
M1 — Phase E return-restock reversal doesn't set `consumer_division_id`. No code reads that column yet, but it's the go-forward canonical.

### 🗂️ 1 MIGRATION BLOCKER
`supabase/migrations-staging/` is **58 files behind** `supabase/migrations/` (last mirror = 2026-08-06). A fresh Supabase project provisioned via the staging README boots at a 2026-08-05 baseline missing: Phase E RPC rewrites, Phase F damaged-stock, **Warranty Phase 1**, teams_places consumption, inventory_item_photos, all Phase D.4b/D.5/E FIFO+COGS hotfixes. Answer to the checklist question *"can a brand new database be created from migrations"* is **no**.

---

## Domains NOT covered in this pass

The money-path pass was scoped tight. These six domains still need the same treatment before you can call deployment ready:

| # | Domain | Why it matters for deployment |
|---|---|---|
| 1 | **Sales flow before delivery** — SO creation, quotations, approval workflow, credit terms, division routing | The money-path review only covered the delivery → FIFO/COGS handoff. Every prior step (line pricing, discount math, tax, approval gates) is unaudited. |
| 2 | **PDF generation** — invoice PDF, delivery-note PDF, warranty certificate PDF, PO PDF, bill PDF, quotation PDF | Every operator-visible output. Missing font glyphs, wrong totals on the PDF vs the DB, RTL layout breakage, print scaling — none of these were checked. |
| 3 | **Pagination + sorting** — every list page on money-path + master-data + sales/purchase/inventory | Not a single table was audited for correct server-side paging. Any list that fetches unlimited rows is a Supabase quota risk (see `docs/supabase-budget.md`). |
| 4 | **Permissions matrix** — per-page permission strings, sidebar visibility, action-button gating, role/division enforcement | Beyond RLS on RPCs, the per-page checks weren't enumerated. Silent auth bypass on any money-adjacent page = critical. |
| 5 | **Warehouse operations** — transfers, stock adjustments, damaged stock, send-for-repair, return-from-repair (Phase E/F work) | Recently shipped in `deploy/warehouse-shipping`. Phase E rewrote several RPCs already found buggy on the money-path side; the warehouse-side callers of the same RPCs may have their own edge cases. |
| 6 | **Consumption workflow** — teams_places consumption, edit-request approvals, custody moves | Newest module. Consumes FIFO the same way sales do — any bug here mirrors into COGS and inventory value. |

---

## Next up — proposed plan

Same workflow shape as this pass. Two options:

**Option A — one big pass over all six domains** (recommended)
- 6 finders in parallel + adversarial verify + optional migration re-sweep
- ~15 agents total, ~25 min wall clock, ~3–4M subagent tokens (same order of magnitude as this session)
- Delivers one consolidated report + updated release checklist
- Best if the boss wants the full picture before any fixing starts

**Option B — split into two smaller passes**
- Pass 1: pre-delivery sales flow + PDFs + pagination (3 finders)
- Pass 2: permissions + warehouse ops + consumption (3 finders)
- Cheaper per pass, faster to react to intermediate findings
- Best if we want to start fixing sales-side bugs while warehouse-side is still being reviewed

**Option C — fix money-path criticals first, then review the rest**
- Burn down the 12 criticals in a dedicated fix branch
- After criticals land, re-run the money-path workflow to confirm nothing regressed
- Then move to the 6 uncovered domains
- Best if deployment is genuinely close and we need to derisk the known bugs first

Ask the operator which of A / B / C to run.

---

## Session-start ritual for resumption

1. Read `AGENTS.md`
2. Read `C:\Users\IT\.claude\projects\D--MMS\memory\MEMORY.md`
3. Read this file (`docs/handover-2026-08-05-money-path-review.md`)
4. Read `docs/release-checklist-money-path.md` for the full finding bodies
5. Ask the operator whether to run Option A / B / C above (or if any money-path critical was already fixed — re-verify against current code before assuming)

---

## Rules to carry forward when running the next review

- **Prompt template lives in the workflow script** at the path listed above. Reuse it verbatim — the CONTEXT block (live DB body wins, table renames, severity threshold, no style nitpicks) is what kept the noise low.
- **Adversarial verify is not optional.** 20% of raw findings were refuted this pass. Skipping verify would have shipped noise into the report.
- **Migrations are ground truth** because the Supabase MCP server isn't authenticated in headless sessions. If a finding hinges on the CURRENT live-DB function body, tell the operator and ask them to `pg_get_functiondef` in an authenticated session.
- **Report critical + high only.** Medium and below buries the actionable items.
- **Every finding needs: severity, file:line, why, concrete repro, minimal fix.** Reject anything that's just "consider improving X".
