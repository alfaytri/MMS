# Handover — Storage audit 3A/3B/3C + dirty-guard rollout to 27 more dialogs

**Date:** 2026-08-04 → 2026-08-05
**Branch:** `deploy/warehouse-shipping`
**Session continues from:** [handover-2026-08-04-storage-and-dialog-guard.md](handover-2026-08-04-storage-and-dialog-guard.md) (§3A / §3B / §3C / §3E deferred queue)
**Commits landed this session:** 30 (see §6 for the full range).

---

## 1. Summary — what shipped

The prior session closed the initial storage audit (buckets + orphan cleanup on cancel + dirty-guard on 8 upload dialogs). This session drained most of the deferred queue:

- ✅ **3A** — avatars RLS owner-check (1 migration, applied to staging).
- ✅ **3B** — server-side size + MIME limits on 4 legacy buckets (1 migration, applied to staging).
- ✅ **3C** — storage cascade triggers via pg_net + Vault (7 migrations + a per-environment bootstrap runbook, applied to staging, Vault secret created, end-to-end smoked by the operator).
- 🚧 **3E** — dirty-guard rollout: 19 more form dialogs guarded via a new `GuardedFormDialog` / `GuardedDialog` wrapper. **8 dialogs done previously + 19 this session = 27 total.**

Only 3D (PDF-bucket privatization) is fully untouched; the remaining 3E work is ~15 more dialogs (§4 lists them).

---

## 2. What's DONE (committed on staging)

### 2A — Storage audit 3A: avatars bucket owner-check

**File:** `supabase/migrations/20260804225530_avatars_owner_check.sql`

Before, any authenticated user could overwrite or delete anyone's avatar (the `avatars_auth_update` / `_delete` / `_insert` policies only checked `bucket_id = 'avatars'`). Now all three write policies also require `split_part(name, '.', 1) = auth.uid()::text`. Files are flat at the bucket root (`<auth_user_id>.<ext>`, no folders), so a filename-prefix match is the right lock. Public SELECT policy unchanged (avatars stay publicly readable).

### 2B — Storage audit 3B: server-side size + MIME limits on 4 legacy buckets

**File:** `supabase/migrations/20260804225735_bucket_size_and_mime_limits.sql`

Buckets that previously had no server-side `file_size_limit` / `allowed_mime_types`:
- `inventory-item-photos` → 10 MB, images (jpeg/png/webp)
- `adjustment-photos` → 10 MB, images
- `consumption-attachments` → 10 MB, images + `application/pdf`
- `customer-credit-docs` → 10 MB, images + `application/pdf`

Caps match the existing per-dialog client-side checks; server-side enforcement means a direct `storage.upload` call can no longer bypass them.

### 2C — Storage audit 3C: storage cascade triggers (fire-and-forget delete on DB events)

**Plan:** [docs/superpowers/plans/2026-08-04-storage-cascade-triggers.md](superpowers/plans/2026-08-04-storage-cascade-triggers.md) (9-task plan; the plans/ subfolder is gitignored — the file lives locally under that path).

**Migrations (applied to staging in this order):**
1. `20260804232123_storage_cleanup_infra.sql` — enables `pg_net` + `supabase_vault`; creates `storage_cleanup_failures` audit table (RLS on, no policies = deny-by-default); creates `storage_delete_object(bucket, path, source_table, source_id)` helper. Helper normalizes both raw paths and full public URLs (strips `?t=` cache-busters), reads the service-role key from `vault.decrypted_secrets` at call time, and logs failures to the audit table (parent DML never aborts).
2. `20260804232211_storage_cleanup_customers.sql` — customers.cr_url / establishment_id_url / signed_credit_form_url (customer-credit-docs bucket).
3. `20260804232229_storage_cleanup_companies_divisions.sql` — companies.logo_url / stamp_url + company_divisions.logo_url / stamp_url (division-assets bucket).
4. `20260804232250_storage_cleanup_inventory_items.sql` — inventory_items.image_url (inventory-item-photos bucket). Closes the biggest ongoing leak (photo replace during edit).
5. `20260804232304_storage_cleanup_stock_adjustments.sql` — stock_adjustments.photo_urls (text[]). Array-diff via `EXCEPT` on UPDATE so only removed elements get deleted.
6. `20260804232321_storage_cleanup_consumption_entries.sql` — consumption_entries.attachments (text[]). Same EXCEPT-diff pattern.
7. `20260804232337_storage_cleanup_landed_cost_lines.sql` — landed_cost_lines.bill_path (lc-bills bucket).

**Docs:**
- `docs/flows-registry.md` gained a Storage Hygiene section with the cascade-cleanup flow entry.
- `docs/ops/storage-cascade-vault-bootstrap.md` — **per-environment runbook** (Vault secret creation, verify SQL, smoke test, prod-cutover checklist including the base-URL patch, monitoring query, rollback via `DELETE FROM vault.secrets`).

**Staging Vault secret:** created 2026-08-04 20:34 UTC. `SELECT id, name FROM vault.secrets WHERE name = 'storage_cleanup_service_role_key';` returns `92e8d33a-8c3d-4a6d-ac95-2bf9e008f4a6`. `SELECT length(decrypted_secret) FROM vault.decrypted_secrets WHERE name = ...;` returns 219.

**Verified 2026-08-04 by operator:**
- Direct helper smoke on `division-assets` (upload → `storage_delete_object` → file gone, audit table empty).
- Inventory item photo replace → old file gone from `inventory-item-photos`.
- Company logo replace → old file gone from `division-assets`.
- Landed-cost bill replace → old file gone from `lc-bills`.
- Customer credit doc replace → old file gone from `customer-credit-docs`.
- `storage_cleanup_failures` empty throughout all tests.

### 2D — Storage audit 3E: `GuardedFormDialog` / `GuardedDialog` wrapper + rollout to 19 more form dialogs

**New primitive:** `src/components/shared/GuardedFormDialog.tsx` (commit `10d0d5e9`).

Exports two components:
- `<GuardedFormDialog form={form} ref={guardRef}>` — for react-hook-form dialogs. Owns the `useWatch` subscription and reads `form.formState.isDirty` internally. Accepts an optional `extraDirty` boolean for hybrid RHF + useState dialogs.
- `<GuardedDialog isDirty={...} ref={guardRef}>` — for pure useState dialogs. Caller computes `isDirty` manually.

Both expose an imperative handle: `guardRef.current?.requestClose()` (routes Cancel through the guard prompt) and `guardRef.current?.closeAfterSubmit()` (bypasses the guard on successful save).

**Retrofit recipe (~5 mechanical edits per dialog):**
1. Import `GuardedFormDialog` (or `GuardedDialog`) + the handle type + `useRef` if not already imported.
2. Drop the raw `Dialog` import (still need `DialogContent`, `DialogHeader`, etc.).
3. `const guardRef = useRef<GuardedFormDialogHandle>(null)`.
4. `<Dialog open={open} onOpenChange={onOpenChange}>` → `<GuardedFormDialog open={open} onOpenChange={onOpenChange} form={form} ref={guardRef}>` (and `</Dialog>` → `</GuardedFormDialog>`).
5. Cancel button: `onClick={() => onOpenChange(false)}` → `onClick={() => guardRef.current?.requestClose()}`.
6. In every `onSuccess` callback that closes: `onOpenChange(false)` → `guardRef.current?.closeAfterSubmit()`.

**Dialogs guarded this session (19 total):**

RHF-based (via `GuardedFormDialog`):
- `src/components/master-data/SupplierFormDialog.tsx`
- `src/components/master-data/WarehouseFormDialog.tsx` (uses `extraDirty={rpsDirty}` for the RP multi-select)
- `src/components/master-data/SubContainerFormDialog.tsx`
- `src/components/master-data/BrandVariantFormDialog.tsx`
- `src/components/master-data/RoleFormDialog.tsx`
- `src/components/master-data/AddUserDialog.tsx` (uses `extraDirty` for phone + division useState)
- `src/components/master-data/EditUserDialog.tsx` (`extraDirty` for phone + CC access + 3CX extension)
- `src/components/master-data/ResetPasswordDialog.tsx`
- `src/components/purchase/AddSupplierDialog.tsx`
- `src/components/shared/PaymentFormDialog.tsx` — **shared base**, so `SoPaymentDialog` + `PoPaymentDialog` inherit the guard automatically without code changes.

useState-based (via `GuardedDialog`):
- `src/components/master-data/attributes/AttributeFormDialog.tsx` (snapshot-based dirty check for post-save re-editing)
- `src/components/warehouse/SendForRepairDialog.tsx`
- `src/components/warehouse/SendDamagedStockForRepairDialog.tsx`
- `src/components/warehouse/WriteOffDamagedStockDialog.tsx`
- `src/components/warehouse/ReturnFromRepairDialog.tsx`
- `src/components/sales/CompleteInspectionDialog.tsx`
- `src/components/sales/CreateReturnDialog.tsx`
- `src/components/sales/CreditNoteFormDialog.tsx`
- `src/components/sales/CustomerPaymentDialog.tsx`
- `src/components/sales/SoDeliveryDialog.tsx`
- `src/components/sales/DeliveryFormDialog.tsx`
- `src/components/sales/ReplacementDeliveryDialog.tsx`
- `src/components/finance/PaymentPlanDialog.tsx`
- `src/components/shared/ChangeBookedRateDialog.tsx`
- `src/components/consumption/RequestConsumptionEditDialog.tsx`
- `src/components/purchase/PoShipmentDialog.tsx`
- `src/components/services/inventory/CategoryEditDialog.tsx` (snapshot-based)

(Adding the 8 upload dialogs from the prior session: **27 dialogs guarded on this branch.**)

### 2E — Docs updates

- `PROGRESS.md` — updated across every task boundary (start marker + completion entry per §3E rule); new rows on `## 🔒 Security Audit Log` for 3A / 3B / 3C.
- `EOD/EOD-2026-08-04.md` — items 41 → 48 covering smoke sign-off, 3A, 3B, 3C, Vault bootstrap runbook, 3C verification, follow-up SECURITY DEFINER task briefing.
- `docs/flows-registry.md` — new Storage Hygiene section for the cascade flow, with a link to the Vault bootstrap runbook.
- `docs/ops/storage-cascade-vault-bootstrap.md` — per-env runbook (new file).
- `docs/superpowers/plans/2026-08-04-storage-cascade-triggers.md` — the 9-task plan (gitignored per project convention; lives locally).

---

## 3. What is NOT DONE (deferred / not started)

### 3.1 Storage audit 3D — PDF-bucket privatization (biggest remaining scope)

6 buckets with customer PII are still `public = true`:
- `receival-receipt-pdfs`
- `delivery-note-pdfs`
- `return-pdfs`
- `po-pdfs`
- `bill-pdfs`
- `booking-confirmations`

All are served through auth-gated Next.js API routes that 302-redirect, so the practical exposure is limited — but the buckets themselves are technically world-readable if a URL leaks. Fix requires flipping the buckets private + updating all 5 PDF generators (`src/lib/{purchase,sales,returns}/generate-*-pdf.ts`) to store paths and mint short-TTL signed URLs on each call. Recommend deferring until after `deploy/warehouse-shipping` ships — this touches ~half a dozen files and every PDF-rendering surface.

### 3.2 Storage audit 3E remaining — ~15 more form dialogs

Split by module (all rollout is mechanical now that the wrapper exists):

**Purchase (~7):**
- `InventoryReceivalDialog` (`src/components/inventory/`)
- `BillFormDialog`
- `CreateBillFromPODialog`
- `PoPaymentDialog` — actually inherits guard via PaymentFormDialog; may already be covered
- `ReceivalFormDialog`
- `ReplacementReceivalDialog`
- `RequestEditDialog` (purchase edit approval)

**Warehouse ops (~4):**
- `WhInventoryCheckStartDialog`
- `WhTransferDialog` (larger — ~400 lines with nested AlertDialog)
- `CustodyAssignDialog`
- `CustodyReturnDialog`

**Inventory / services (~3):**
- `BrandVariantEditDialog` (`src/components/services/inventory/`)
- `ToolAssetEditDialog`
- `InventoryImportDialog` (2-step Excel wizard — slightly more involved)

**Invoices (~1, needs shape change):**
- `src/components/invoices/CreditNoteDialog.tsx` — currently built on `<AlertDialog>`, not `<Dialog>`. The `GuardedDialog` wrapper only intercepts Dialog `onOpenChange`. Fix requires either converting to `<Dialog>` first, or adding a sibling `GuardedAlertDialog` variant. Small dialog, straightforward.

Estimated 3-4 more batches of 4-5 dialogs each to close 3E fully.

### 3.3 Separate task briefed but not on this branch

**4 SECURITY DEFINER views** flagged by Supabase's Advisors tab during 3C smoke testing:
- `public.warehouse_sub_container_totals`
- `public.sale_order_lines_summary` (High risk — likely bypasses division RLS)
- `public.return_line_progress`
- `public.return_progress`

Brief handed to the operator's board (§8 in the prior session's message). Fix per view is either `ALTER VIEW ... SET (security_invoker = true)` or documenting why it must stay definer. Not on this branch.

---

## 4. Per-environment operator step you must do before triggers can delete

**Only required once per environment.** Skipping it means every cascade-cleanup trigger fires but logs a `Vault secret ... missing` row to `storage_cleanup_failures` — no data corruption, cleanup just goes dormant.

On staging this is already done. **When you push these migrations to production, run in the prod SQL editor:**

```sql
SELECT vault.create_secret(
  '<PROD SUPABASE_SERVICE_ROLE_KEY from Vercel env>',
  'storage_cleanup_service_role_key'
);
```

Then verify + smoke-test per [docs/ops/storage-cascade-vault-bootstrap.md](ops/storage-cascade-vault-bootstrap.md).

**Prod also needs a base-URL patch** — the helper hardcodes `https://mwvblpgbgxipvrevkeff.supabase.co` (staging). Before running migrations on prod, either edit the URL literal in `20260804232123_storage_cleanup_infra.sql` (or write a follow-up migration that does `CREATE OR REPLACE FUNCTION storage_delete_object` with the prod URL) OR refactor the helper to read the base URL from a second Vault secret. The runbook has both options in the "When you push these migrations to a new environment" section.

---

## 5. How to verify — checklists

### 5.1 3A — Avatars RLS owner-check

- Sign in as user A → upload a new avatar → succeeds (own filename `<uid_A>.jpg`).
- In DevTools console: `supabase.storage.from('avatars').remove(['<some_other_uid>.jpg'])` → should fail with an RLS error (403 / new row violates policy).
- Public reads still work (TopNav avatars visible for other users).

### 5.2 3B — Server-side bucket limits

- Try uploading a 15 MB image to Inventory → item photo → server rejects with 413 / `exceeds file_size_limit`.
- Try uploading a `.zip` to a customer credit doc slot → server rejects with `mime type not allowed`.
- Normal uploads (<10 MB JPG/PNG/WebP; PDF for consumption + credit-docs) still work.

### 5.3 3C — Storage cascade triggers

Smoke was already done on 2026-08-04 (see §2C). Between smoke tests, run this to catch drift:
```sql
SELECT count(*), max(occurred_at), max(error_text)
FROM public.storage_cleanup_failures
WHERE occurred_at > now() - interval '1 hour';
```
Non-zero rows in the last hour = something's off (missing Vault secret, expired key, network to Storage broken).

### 5.4 3E — Dirty-guard on new dialogs

Per-dialog verification pattern (repeat for each of the 19 new files in §2D):
1. Open dialog → don't touch anything → click outside / Escape / Cancel → closes silently, no prompt.
2. Open → change something → click outside → **"Discard unsaved changes?"** appears.
3. Prompt → Keep editing → prompt closes, dialog stays with the change.
4. Prompt → Discard → both close, next open shows the pre-edit state.
5. Fill + submit successfully → dialog closes with no prompt.

The operator has already smoke-tested batches 2B.1 through 2B.6 in the earlier turns of this session (Supplier, Warehouse, Sub-container, BrandVariant, Role, AddUser, ResetPassword, AddSupplier, Attribute, EditUser, plus the 4 warehouse-ops dialogs and the 4 sales dialogs). The final 5 (batches 2B.4 sales-deliveries + 2B.5 finance + 2B.6 purchase/inventory) are ready for smoke.

---

## 6. Commits landed this session (chronological)

```
29ada14b  docs: update PROGRESS.md — starting avatars RLS owner-check
78ca7369  feat(storage): lock avatars bucket write policies to file owner       [3A]
9e09c296  docs: update PROGRESS.md — avatars RLS owner-check complete
7c21d4c0  feat(storage): server-side size + MIME limits on 4 legacy buckets     [3B]
52cef2d2  docs: update PROGRESS.md — bucket size+MIME limits complete
fa84cb02  docs: update PROGRESS.md — starting storage cascade triggers (3C)
61bf1bc9  feat(storage): pg_net + Vault + storage_delete_object helper         [3C task 1]
e9477892  feat(storage): cascade delete customer credit doc files              [3C task 2]
bf507cd3  feat(storage): cascade delete company + division logo/stamp          [3C task 3]
5f2f9fcd  feat(storage): cascade delete inventory item photo                   [3C task 4]
b69169e9  feat(storage): cascade delete stock adjustment photos                [3C task 5]
44eeabd8  feat(storage): cascade delete consumption attachments                [3C task 6]
29bd6bc9  feat(storage): cascade delete landed cost bill                       [3C task 7]
25236412  docs: register storage cascade cleanup + PROGRESS/audit close-out    [3C task 8]
fa9f43c4  docs(ops): storage-cascade Vault-secret bootstrap runbook
79011315  docs: link storage-cascade bootstrap runbook from registry + PROGRESS
799b1adf  docs: mark storage cascade 3C fully verified on staging
0af5e828  docs: update PROGRESS.md — starting 3E dirty-guard rollout
724da8d3  feat(dialogs): dirty-guard on SupplierFormDialog + WarehouseFormDialog   [3E]
10d0d5e9  feat(dialogs): GuardedFormDialog wrapper + retrofit Supplier + Warehouse [3E]
84d7d367  feat(dialogs): dirty-guard rollout to 4 admin form dialogs via wrapper   [3E]
c51e022d  feat(dialogs): dirty-guard rollout to 4 more RHF + 1 useState dialogs    [3E]
dc0096e4  feat(dialogs): dirty-guard on 4 warehouse-ops dialogs                    [3E]
2402dd9f  feat(dialogs): dirty-guard on 4 sales dialogs                            [3E]
d42f036c  feat(dialogs): dirty-guard on 3 sales dialogs + shared PaymentFormDialog [3E]
75338590  feat(dialogs): dirty-guard on 3 finance/misc dialogs                     [3E]
9fb19bbc  feat(dialogs): dirty-guard on PoShipmentDialog + CategoryEditDialog      [3E]
```

Branch is ahead of `origin/deploy/warehouse-shipping` by 90+ commits total (including work from the prior sessions).

---

## 7. Migrations state

**Applied to staging (`mwvblpgbgxipvrevkeff`) 2026-08-04:**
- `20260804225530_avatars_owner_check.sql`
- `20260804225735_bucket_size_and_mime_limits.sql`
- `20260804232123_storage_cleanup_infra.sql`
- `20260804232211_storage_cleanup_customers.sql`
- `20260804232229_storage_cleanup_companies_divisions.sql`
- `20260804232250_storage_cleanup_inventory_items.sql`
- `20260804232304_storage_cleanup_stock_adjustments.sql`
- `20260804232321_storage_cleanup_consumption_entries.sql`
- `20260804232337_storage_cleanup_landed_cost_lines.sql`

**Not applied to dev** (dev DB frozen during the `deploy/warehouse-shipping` window per AGENTS.md policy).

**Not applied to prod** — prod cutover is separate + still gated on `deploy/warehouse-shipping` shipping. See §4 for the Vault + base-URL steps.

---

## 8. Recommended next steps when you resume

1. **Smoke-test the last 5 3E dialogs shipped this session** — SoDeliveryDialog, DeliveryFormDialog, ReplacementDeliveryDialog (via SO returns), PaymentFormDialog (via any invoice payment), PaymentPlanDialog, ChangeBookedRateDialog, RequestConsumptionEditDialog, PoShipmentDialog, CategoryEditDialog. Verification pattern in §5.4.
2. **Continue 3E rollout** — ~15 dialogs remain (§3.2). Mechanical work at this point; 3-4 more batches of 4-5 dialogs each. If you want to move faster, dispatch a subagent per batch (all the pattern is now settled).
3. **Optionally address 3.3 SECURITY DEFINER views** — the operator has the brief on their board.
4. **Prod cutover planning** — before pushing this branch to prod, walk the [Vault bootstrap runbook](ops/storage-cascade-vault-bootstrap.md) with the prod service-role key and patch the base URL literal.
5. **Prod migration wave** — everything on this branch (this session's 9 migrations + all the branch's earlier migrations) needs a coordinated push to `wkmvjxxmzstsvahuiwsz` when `deploy/warehouse-shipping` ships. Dev DB catch-up is a separate decision (currently frozen).

---

## 9. Known state / gotchas

- `docs/superpowers/` is gitignored — the 3C plan doc lives locally and won't survive a `git clean -fdx`. If you need it in a fresh clone, regenerate via the same plan-writing skill flow.
- The `[impeccable@1]` design-hook lines in commit messages / PostToolUse output are ambient — they're not real findings, just the hook confirming it scanned each write.
- `PaymentFormDialog` guards both `SoPaymentDialog` and `PoPaymentDialog` transitively (they compose via props). No separate work needed on those two.
- `SoPaymentDialog` / `PoPaymentDialog` themselves don't render a `<Dialog>` — they render `<PaymentFormDialog>` and pass slots. Grep results showing them without the guard are false positives; they inherit it.
- Invoices' `CreditNoteDialog` uses `<AlertDialog>` (not `<Dialog>`). Skipped in the 3E rollout — needs either a component swap or a new `GuardedAlertDialog` sibling.
- Dev DB (`wkmvjxxmzstsvahuiwsz`) is frozen through the `deploy/warehouse-shipping` window. Do NOT push migrations there until we un-freeze it.
