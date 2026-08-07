# Six-Domains Review — Session Handover (2026-08-05)

**Read this after `/clear` to resume where we left off.**

---

## TL;DR

Ran the same adversarial multi-agent QA workflow from the money-path review over the **6 previously uncovered domains**: Sales pre-delivery, PDF generation, Pagination/sorting, Permissions matrix, Warehouse operations, and Consumption workflow. **20 confirmed defects** (4 critical + 13 high + 3 medium). Zero refuted — 100% confirmation rate.

**Combined with the money-path review:** the codebase now has **49 confirmed findings** (16 critical + 28 high + 4 medium + 1 migration blocker) across all audited domains. Full details in two companion checklists.

---

## What's on disk from this session

| File | Purpose |
|---|---|
| `docs/release-checklist-six-domains.md` | Full release checklist for the 6 domains — all 20 confirmed findings with severity, file:line, why, repro, fix. |
| `docs/release-checklist-money-path.md` | Prior session's 28+1 findings (unchanged). |
| `docs/handover-2026-08-05-six-domains-review.md` | This file. |

Workflow artifacts:
- Run ID: `wf_2fab414e-5b4`
- Script: `C:\Users\IT\.claude\projects\D--MMS\676cef1f-d95d-4329-aa52-b737a3340dae\workflows\scripts\full-domain-review-wf_2fab414e-5b4.js`
- Transcript dir: `C:\Users\IT\.claude\projects\D--MMS\676cef1f-d95d-4329-aa52-b737a3340dae\subagents\workflows\wf_2fab414e-5b4\`
- Full result: `C:\Users\IT\AppData\Local\Temp\claude\D--MMS\676cef1f-d95d-4329-aa52-b737a3340dae\tasks\wsqtqfp4k.output`

No code changes were made this session. Nothing to commit.

---

## Review shape

- 6 domain finders in parallel (`effort: high`, `general-purpose` agents)
- Each finding handed to a separate adversarial verifier (default: REFUTED)
- Pipeline pattern (no barrier between find/verify — each finding verifies as soon as its finder completes)
- 20 raw → 20 confirmed (0 refuted, 0 needs context)
- 1.7M subagent tokens, 630 tool calls, ~16 min wall clock
- 26 agents total

---

## Confirmed findings — headline summary

Full details in `docs/release-checklist-six-domains.md`. Do NOT re-derive these from memory — always read the checklist.

### 🚨 4 CRITICAL — block deployment

| # | Domain | Title | File |
|---|---|---|---|
| C1 | Sales pre-delivery | useConfirmSO bypasses approval chain + double-reserves stock | `useSaleOrders.ts:826` |
| C2 | Permissions | RLS on custom_roles allows any user to self-escalate to system admin | baseline_schema.sql:16120 |
| C3 | Warehouse ops | Stock adjustment 'damage' deducts good FIFO but never creates damaged stock entries | phase_f migration:146 |
| C4 | Consumption | rpc_cancel_consumption doesn't restore stock_level | consumption RPC:207 |

### ⚠️ 13 HIGH — must fix before deployment

| # | Domain | Title |
|---|---|---|
| H1 | Sales | useCancelSO allows cancelling delivered/invoiced SOs without reversal |
| H2 | Sales | 18-arg create_sale_order checks wrong intent string |
| H3 | PDFs | Invoice PDF hardcodes QAR currency on multi-currency sales |
| H4 | PDFs | Credit/Debit Note PDF hardcodes QAR currency |
| H5 | PDFs | PO PDF mixes QAR totals with original-currency label |
| H6 | PDFs | Bill PDF payment table shows duplicate entries from overlapping queries |
| H7 | Pagination | useSaleOrders fetches entire history with nested joins, no .limit() |
| H8 | Pagination | WhStockValueTab fetches ALL fifo_cost_layers, no limit |
| H9 | Permissions | Warehouse reports API has no permission check (SERVICE_ROLE bypass) |
| H10 | Permissions | requireAdmin() inconsistent with requirePermission() — no is_system_admin check |
| H11 | Warehouse | receive_transfer doesn't decrement stock_level for shrinkage |
| H12 | Consumption | Self-approval gap in consumption edit requests |
| H13 | Consumption | generate_consumption_number count(*) race under concurrency |

### 🧭 3 MEDIUM (verifier-downgraded)

M1–M3: Three more unbounded list queries (receivals+deliveries, sale returns, reorder points). PostgREST `max_rows` provides a silent cap at 1000 rows, so these are quota/performance issues, not data corruption.

---

## Cross-domain patterns worth noting

1. **Currency handling is inconsistent across PDFs.** Quotation PDF and Bill PDF handle multi-currency correctly. Invoice, Credit/Debit Note, and PO PDFs do not. The fix is mechanical — same pattern, just not applied everywhere.

2. **stock_level denormalization is fragile.** Three separate bugs (C3, C4, H11) all stem from `stock_level` on `inventory_item_brand_variants` being a denormalized counter that some RPCs update and others forget. Consider a trigger-based approach or recalc-on-read for this counter.

3. **Supabase budget violations are widespread.** 5 confirmed unbounded queries (H7, H8, M1–M3) across different hooks. A systematic sweep for `.select()` without `.limit()` would likely find more. The project already hit quota twice.

4. **RLS on role-management tables is the single highest-severity finding.** C2 allows any authenticated user to become system admin. This should be the first fix.

---

## Proposed next step — fix prioritization

Now that both passes are complete, all domains are covered. Recommended fix order:

### Batch 1 — Security (do first, each is a standalone migration or hook edit)
- C2 — RLS on custom_roles/user_custom_roles (migration)
- H9 — Warehouse reports API permission check (1 line change)
- H2 — Drop or fix 18-arg create_sale_order overload (migration)

### Batch 2 — Data integrity (FIFO/stock_level corruption)
- C3 — Damage adjustment → damaged stock materialization (migration)
- C4 — Consumption cancel → stock_level restore (migration)
- H11 — Transfer shrinkage → stock_level decrement (migration)
- C1 — Remove useConfirmSO or restrict to quotation-only (hook + page edit)
- H1 — Guard useCancelSO against post-delivery cancel (hook + page edit)

### Batch 3 — Financial documents (PDF currency fixes)
- H3, H4, H5, H6 — Four PDF fixes (all in src/lib/purchase/ and src/lib/sales/)

### Batch 4 — Quota protection + housekeeping
- H7, H8 — Add .limit() to the two highest-traffic unbounded queries
- M1–M3 — Add .limit() to remaining unbounded queries
- H10 — requireAdmin() consistency fix
- H12, H13 — Consumption workflow guards

### Combined with money-path criticals
The 12 money-path criticals should be interleaved with Batch 1–2 based on shared code overlap. Several touch the same RPCs (FIFO, COGS, reserved_qty).

---

## Session-start ritual for next session

1. Read `AGENTS.md`
2. Read `C:\Users\IT\.claude\projects\D--MMS\memory\MEMORY.md`
3. Read this file (`docs/handover-2026-08-05-six-domains-review.md`)
4. Read `docs/release-checklist-six-domains.md` for full finding bodies
5. Read `docs/release-checklist-money-path.md` for the prior 29 findings
6. Ask the operator which batch to start with, or whether to begin fixing
