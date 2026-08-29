# Warranty Module — Session Handover (2026-08-05)

**Read this after `/clear` to resume where we left off.**

---

## TL;DR

Warranty Module **Phase 1 is complete** and applied to staging (`mwvblpgbgxipvrevkeff`). All 18 planned tasks shipped + one refinement round after boss feedback (new numbering format). Branch is ready to smoke-test then merge.

- **Branch:** `feature/warranty-module-phase-1` (off `deploy/warehouse-shipping`)
- **DB target:** staging only (dev DB frozen per current policy)
- **Types + tsc:** regenerated and clean
- **Prod cutover:** ships with the rest of `deploy/warehouse-shipping`

---

## What's live on the branch

### Database (8 migrations, all applied to staging)

| File | Purpose |
|---|---|
| `supabase/migrations/20260815003000_warranty_policies.sql` | `warranty_policies` table, seed 3 default policies, initial `warranty_number_seq` (later dropped) |
| `20260815003100_inventory_categories_default_warranty_policy.sql` | Category-level `default_warranty_policy_id` FK |
| `20260815003200_inventory_items_warranty_policy.sql` | Per-item `warranty_policy_id` override FK |
| `20260815003300_get_effective_warranty_policy.sql` | Resolver: item → recursive category chain → NULL |
| `20260815003400_warranty_records.sql` | `warranty_records` table + division-scoped RLS + 5 indexes |
| `20260815003500_warranty_delivery_hook.sql` | Helper `create_warranty_records_for_delivery` (AFTER UPDATE trigger version — trigger later dropped) |
| `20260815003600_warranty_delivery_hook_inline.sql` | Refactor: trigger dropped, PERFORM call inlined into `complete_delivery_inventory` |
| `20260815003700_warranty_source_type_and_scoped_numbering.sql` | **Numbering refactor after boss feedback** — new format `WAR-SALE-AFM-001`, adds `warranty_records.source_type` enum column |

### Numbering (post-refactor, current state)

- Format: `WAR-<SOURCE>-<DIVISION_SLUG>-<COUNTER>`
- Sources today: `sale` only (enum has `sale`, `service`, `contract`)
- Counters: independent per `(source_type, division_id)` tuple in table `warranty_number_counters`
- Slug: prefers `company_divisions.short_name`. Fallback computes from `name`:
  - `Al Faytri Maintenance` → collapse "Al Faytri" → 2 words → `AFM`
  - `Alfaytri Kitchen` → `AFK`
  - `Alfaytri MEP` (second word ≤ 3 chars) → `AMEP`
  - `Alfaytri Facility Management` → `AFF`
- Slug function: `public.resolve_warranty_division_slug(division_id)` — STABLE, SECURITY INVOKER
- Number RPC: `public.next_warranty_number(source_type, division_id)` — SECURITY DEFINER, atomic upsert on counters

### Client code

| Path | Role |
|---|---|
| `src/hooks/useWarrantyPolicies.ts` | Full CRUD hook set: list, active-only list, detail, create, update, toggle-active. Exports `COVERAGE_TYPES`, `STARTS_FROM_OPTIONS` enums + label maps. `throwDbError` helper surfaces raw Postgrest fields per feedback rule. |
| `src/hooks/useEffectiveWarranty.ts` | Two hooks: `useEffectiveWarranty(item_id)` (RPC + policy fetch) and `useEffectiveWarrantyForVariant(brand_variant_id)` (BV → item → RPC + policy fetch, used by SO line badge). |
| `src/hooks/useWarrantyRecordsForDelivery.ts` | Filters `warranty_records` via inner join on `sale_delivery_lines.sale_delivery_id`. Powers Print button gate + certificate PDF payload. |
| `src/lib/queryKeys.ts` | New `warranty` namespace: policies, policiesActive, policyDetail, effectiveForItem, recordsForDelivery. |
| `src/lib/sales/warranty-certificate-pdf-html.ts` | Bilingual HTML template — meta strip, per-item table (warranty#, coverage, dates), one terms/void block per distinct policy, signature slots. |
| `src/lib/sales/generate-warranty-certificate-pdf.ts` | PDF pipeline — clones delivery-note shape (loadPdfFonts, resolveBrand, htmlToPdfBuffer). **Not stored** — regenerated on demand. |
| `src/app/api/sales/deliveries/[id]/warranty-certificate/route.ts` | GET + POST, streams PDF bytes inline. Bearer-token auth via `getUser`. |
| `src/app/(dashboard)/master-data/admin/warranty-policies/page.tsx` | Master-data page: stat strip, search, DataTable, GuardedFormDialog for create/edit. |
| `src/components/master-data/AdminSidebar.tsx` | Sidebar link "Warranty Policies" (ShieldCheck icon, `master_data.admin.view` permission). |
| `src/components/services/inventory/CategoryEditDialog.tsx` | Extended: "Default Warranty Policy" Select with "Inherit from parent chain" fallback. |
| `src/components/services/inventory/ItemEditDialog.tsx` | Extended: "Warranty Policy Override" Select + live effective-policy preview via `useEffectiveWarranty`. |
| `src/components/sales/SoLineItemsEditor.tsx` | Per-row `WarrantyBadge` — green "Nmo warranty" / muted "No warranty". |
| `src/components/sales/DeliveryDetailDialog.tsx` | Footer "Print Warranty Certificate" button (gated on records existing). |
| `src/app/(dashboard)/sales/invoices/[id]/page.tsx` | Toolbar warranty button (resolves delivery via SO → newest warranty-producing delivery). |
| `src/hooks/useInventory.ts` | Category create/update payload types extended to include `default_warranty_policy_id`. |
| `src/types/database.types.ts` | Regenerated after every schema change; helper aliases (`DBTable/DBInsert/DBUpdate/AllTables`) re-appended. |

### Docs

| File | Purpose |
|---|---|
| `docs/plans/2026-08-05-warranty-phase-1.md` | Original Phase 1 plan (18 tasks). |
| `docs/plans/2026-08-05-warranty-context.md` | Locked-in decisions + session-start ritual for the branch. |
| `docs/plans/2026-08-05-warranty-multi-source-plan.md` | **Message drafted for the boss** — plain-English Phase 2 vision (multi-source register). Ends with 2 questions we need his answer on before writing a Phase 2 plan. |
| `docs/flows-registry.md` | New "Warranty" section: `Create Warranty Records at Delivery`, `Print Warranty Certificate`. |
| `PROGRESS.md` | `## ✅ Completed` has 3+ warranty rows spanning tasks 1-18 + numbering refactor. `## 🔒 Security Audit Log` has the Phase 1 row. `## 🔄 In Progress` shows Phase 1 complete. |
| `EOD/EOD-2026-08-05.md` | Items 9-23 cover today's warranty work. |

---

## Design decisions locked in this session

1. **Numbering with source + division** (per boss). Old `WAR-00001` scheme replaced.
2. **Slug rule** for auto-generating division codes when `short_name` is empty — collapse "Al Faytri X" triples, 2-letter first-word + 1-letter second for long specialties, `A` + full second word for short acronyms (MEP, HR, IT).
3. **Inline hook, not trigger** — warranty creation runs inside `complete_delivery_inventory` via a `PERFORM` call (operator preference — trigger version was shipped then dropped).
4. **No PDF storage** — certificates regenerate on demand from snapshotted `warranty_records`.
5. **No delete on policies** — `warranty_records.policy_id` is `ON DELETE RESTRICT`. Soft archive via `is_active`.
6. **`source_type` enum**: `sale`, `service`, `contract` (only `sale` writes today; `installation` deferred pending decision).

---

## Waiting on the boss

Before Phase 2 plan can be finalized, need his answers on:

1. **Warranty claims workflow** — full assess → covered/void → repair/replacement/credit workflow, vs. simple "Under Claim" flag on the warranty row.
2. **Expiry reminders** — notify customer, notify team, both, or neither.

Also carrying these operator-side inputs already locked but worth restating for Phase 2 planning:

- **Contracts** — deferred, will own their own warranty policy attached at contract level (per-contract, not per-line materials)
- **Maintenance / service orders** — will add `service` writer once ERP is fully shipped; labor-vs-parts decision to make then
- **Installations** — will live under service orders, separate plan later
- **Register access** — locked via nav permission (not visible to warehouse operators / delivery staff)
- **Sales view** — dedicated tab on sales for their subset + separate tab for expired warranties

---

## Suggested next moves (when resuming)

**Option A — smoke and ship Phase 1**
1. Operator smokes the 7-step "Metric of success" from `docs/plans/2026-08-05-warranty-phase-1.md`:
   - Create 3 policies via master data
   - Set a default on Split AC category
   - Create SO with a Split AC line → see "12mo warranty" badge
   - Complete delivery → `warranty_records` row auto-created with `WAR-SALE-<DIV>-*` number
   - Print button on delivery detail → bilingual PDF
   - Reprint → same certificate, same numbers
   - Verify RLS: switch division, records disappear from other-division user
2. If clean, PR from `feature/warranty-module-phase-1` into `deploy/warehouse-shipping`.

**Option B — build the Warranty Register**
- The single-screen list from the boss's message.
- Can be built entirely on top of Phase 1 data (sales only for now).
- Would immediately show any WAR- records created during smoke testing.
- New route suggestion: `/warranty` with role-locked nav entry.
- Adds a Sales tab in `src/app/(dashboard)/sales/` for the sales-side view.

**Option C — wait for boss's answers, plan Phase 2**
- Once we have claim-workflow + reminders direction, write `docs/plans/2026-08-XX-warranty-phase-2.md`.

---

## Branch commit history (26 commits since deploy/warehouse-shipping)

Recent (most relevant):
```
1cd12f49 docs: update PROGRESS.md — warranty numbering refactor
5c2f0c61 feat(db): scoped warranty numbering + source_type column
20f95bc9 docs: Warranty Phase 1 complete — security audit + close-out (task 18)
6f556dfd feat(warranty): print-certificate route + button, flow-registry entries (tasks 16-17)
204aa5ae docs: update PROGRESS.md — Warranty Phase 1 Tasks 12-15 complete
a37370d6 feat(warranty): category + item pickers, SO badge, certificate PDF (tasks 12-15)
26ac5353 feat(master-data): /master-data/admin/warranty-policies list page + dialog
646d4a04 feat(hooks): useWarrantyRecordsForDelivery(delivery_id)
afa05bfa feat(hooks): useEffectiveWarranty(item_id)
13d35115 feat(hooks): useWarrantyPolicies — list, detail, create, update, toggle
a3265fb6 chore(types): regenerate database.types.ts from staging
870294d8 refactor(db): inline warranty creation inside complete_delivery_inventory
acb7bfe6 feat(db): auto-create warranty_records on delivery via AFTER UPDATE trigger
e43efb95 feat(db): warranty_records table + division-scoped RLS
17431a15 feat(db): get_effective_warranty_policy(p_item_id) resolver
f2c3800e feat(db): inventory_items.warranty_policy_id override FK
595fff2f feat(db): inventory_categories.default_warranty_policy_id FK
(and earlier: warranty_policies migration + docs commits)
```

All commits signed with both co-author trailers per repo policy.

---

## Session-start ritual for resumption

1. Read `AGENTS.md`
2. Read `C:\Users\IT\.claude\projects\D--MMS\memory\MEMORY.md`
3. Read this file (`docs/handover-2026-08-05-warranty-phase-1.md`)
4. Read `docs/plans/2026-08-05-warranty-multi-source-plan.md` (the boss message + open questions)
5. Ask the operator which of A / B / C above to work on.
