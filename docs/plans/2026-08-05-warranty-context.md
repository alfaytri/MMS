# Warranty Module — Context Handoff for Next Session

**Read this first after `/clear`.** It captures every decision that led to the plan, so you don't have to re-brainstorm.

---

## What is this?

The company sells items to customers. Suppliers don't offer any warranty. So Alfaytri creates and honours its own warranty per sale. Phase 1 = build the policy system, auto-create the coverage record at delivery time, and print a bilingual certificate. Phase 2 (later) = claims workflow.

**The implementation plan lives at:** [`docs/plans/2026-08-05-warranty-phase-1.md`](2026-08-05-warranty-phase-1.md). Read it before writing any code.

---

## Locked-in decisions

Every question was asked and answered — do not re-ask these.

| Question | Answer | Reasoning |
|---|---|---|
| Per-item or per-category policy default? | **Category default + optional per-item override** | Most items follow their category. Specific outliers get overridden. Saves setting 500 policies. |
| Should categories inherit up the parent chain? | **Yes — nearest-ancestor-wins, walking leaf UP toward root. Item override > closest ancestor > NULL (no warranty).** Confirmed 2026-08-05. | Example: item lives in `Piston` under `Split` under `AC`. Resolver checks Piston first; if empty, checks Split; if empty, checks AC. First hit stops. If nothing in the chain has a policy AND the item has no override, item is uninsured — no fallback. |
| Serial-number tracking on sold units? | **No.** Track warranty per invoice line only. | Customer proves via receipt. Adding serials means changing the delivery form and every operator's workflow — not worth it for MVP. |
| Repair labor cost accounting? | **Skipped for MVP.** | Explained below. Ops can count claims without booking a Warranty Expense account entry. Revisit after Phase 2 lands if the accountant asks. |
| Void detection in software? | **No — manual judgment call by tech team.** | Void reasons are free-text on the certificate; the tech team decides case-by-case during a claim. |
| Paid warranty extension? | **Not in scope.** | Future feature. Every warranty is free + bundled. |
| Certificate delivery? | **Printed at handover.** | Regenerate PDF on demand from the records — no need to store the file. Digital delivery (email / WhatsApp) can be added later. |
| Auto-creation hook location? | **Inside `complete_delivery_inventory` RPC** | Same transaction as the delivery stamping — atomic. If body is too big, extract a `create_warranty_records_for_delivery(p_delivery_id)` helper RPC and call it from there. |
| Store PDF file, or regenerate? | **Regenerate on demand** | Records carry snapshotted terms — the PDF is always reproducible. Storing would double the storage-cascade work we just finished. |

---

## The "repair labor cost" question, explained

**Scenario:** you sell a Split AC with `parts_and_labor` coverage. 8 months later the customer's compressor fails. You dispatch a technician who spends 3 hours + fuel to fix it under warranty.

- **Parts** — you take a compressor from your stock. This is already tracked via your existing damaged-stock / repair flows.
- **Labor** — the 3 tech hours + fuel are a real cost. Some businesses want that recorded as an expense line ("Warranty Expense" account) so month-end reports show the true cost of the warranty program.

**Your call was: skip it for MVP.** That's fine — nothing prevents adding it in Phase 2 or beyond. Just don't wire any expense-tracking into Phase 1.

---

## Data shape summary (full details in the plan)

**Three new tables + two extensions:**

1. `warranty_policies` — reusable templates (name, duration_months, coverage_type, starts_from, terms_en, terms_ar, void_conditions[], is_active).
2. `inventory_categories.default_warranty_policy_id` — nullable FK.
3. `inventory_items.warranty_policy_id` — nullable FK, overrides category.
4. `get_effective_warranty_policy(p_item_id)` — function: item override → recursive category walk → NULL.
5. `warranty_records` — one row per sold delivery line at delivery time. Fields: `warranty_number` (`WAR-*`), `sale_delivery_line_id`, denormed customer/division/brand_variant, snapshotted policy fields (name, coverage, duration, terms en/ar), `start_date` + `end_date`.

**Auto-creation trigger:** on `sale_deliveries.status → delivered`, for each line: resolve policy → snapshot into `warranty_records`. Skip if no policy or duration 0.

**Idempotency:** UNIQUE on `sale_delivery_line_id`.

**RLS:** `is_division_visible(division_id)` restrictive — same pattern as the sale-orders / returns tables.

---

## Reference patterns to reuse (don't rebuild these)

| Need | Look at |
|---|---|
| Master-data CRUD page shape | `useReasonLists` + the Reason Lists page at `/master-data/reason-lists` (or `/master-data/country-codes`) |
| Effective-value resolver via category chain | `useCategorySubContainer` — it already walks category `parent_id` recursively |
| PDF generator layout + libs | `src/lib/sales/generate-delivery-note-pdf.ts` — clone the shape |
| Bilingual EN/AR text handling | Existing invoice PDF templates — they already handle Arabic right-alignment |
| Snapshotting a policy onto a record | Same pattern as `sale_order_lines` snapshotting `unit_price` at SO create time — don't reach through the FK, embed the values |
| Sequence naming (`WAR-00001`) | Existing `so_number` / `po_number` / `receival_number` sequences — grep migrations for `CREATE SEQUENCE` examples |
| RLS shape | `20260731000000_rls_division_scope_backfill.sql` — the `so_po_returns` block is the closest match |

---

## Files the next session should NOT re-invent

- `src/components/providers/DivisionProvider.tsx` — `useActiveDivision()` gives you divisions + super-viewer flag. Already used on all our list pages.
- `src/hooks/useDivisions.ts` — for admin-facing division pickers.
- `src/components/shared/GuardedFormDialog.tsx` — every new dialog must go through this per the 3E rollout we just finished.

---

## Migration policy (repeated because it matters)

**Every migration goes to STAGING ONLY** (`mwvblpgbgxipvrevkeff`) during the `deploy/warehouse-shipping` window. Dev DB (`wkmvjxxmzstsvahuiwsz`) is frozen. See `AGENTS.md` § Database Migrations.

Apply via:
```bash
npx supabase db push
```

Never ask the user to run SQL by hand.

---

## Where to branch

Off `deploy/warehouse-shipping`. Suggested branch: `feature/warranty-module-phase-1`.

Don't merge to `develop` yet — the whole warranty phase can ride the warehouse-shipping cutover, or split later. Ask the user.

---

## Do NOT touch in Phase 1

- The claims workflow (Phase 2).
- The existing `so_po_returns` / `credit_notes` / `debit_notes` flows — the claim page will *wrap* these later, but Phase 1 does not modify them.
- The `sale_deliveries` schema — only the RPC body changes.
- Paid extension pricing, warranty extension purchases, warranty transfers on resale.
- Automatic customer notifications.

---

## When Phase 1 is done — the smoke script

Run through the 7 steps in `## Metric of success` at the bottom of the plan doc. If all pass, security-audit clean, commit + PR.

---

## Session-start ritual for next session

1. Read `AGENTS.md`
2. Read `C:\Users\IT\.claude\projects\D--MMS\memory\MEMORY.md`
3. **Read this file (`docs/plans/2026-08-05-warranty-context.md`)**
4. **Read the plan (`docs/plans/2026-08-05-warranty-phase-1.md`)**
5. Confirm with operator: "Ready to start Task 1 — the `warranty_policies` migration + seed?" Then go.
