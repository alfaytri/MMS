# Handover — Storage audit + dialog dirty-guard rollout

**Date:** 2026-08-04
**Branch:** `deploy/warehouse-shipping`
**Status:** All changes uncommitted, awaiting smoke-test approval before commit
**Migration state:** ONE migration applied to staging (see §5)

---

## 1. What triggered this session

Full audit of photo/attachment/bucket usage across the codebase. Found:

- **2 buckets referenced in code but never created by any migration** — uploads returned `NoSuchBucket` 404
- **1 avatar RLS policy too open** — any authenticated user could overwrite anyone's avatar
- **1-year signed URLs persisted to DB** — leakage / JWT-rotation break
- **No server-side file_size_limit / MIME allow-list** on 4 buckets
- **Orphan files on cancel** across every upload dialog
- **Non-atomic bill replace** (delete old before upload new)
- **Non-atomic Promise.all** batch uploads in consumption
- **Avatar cache-buster written to DB** (initial fix was wrong — reverted, keeping ?t= is correct)

Then user asked for a `Discard unsaved changes?` prompt on click-outside/Escape/Cancel across every form dialog. **8/75 dialogs done. 67 remaining.**

---

## 2. What is DONE (uncommitted)

### 2A — Bucket creation migration (applied to staging)

**File:** `supabase/migrations/20260815002000_create_division_assets_and_lc_bills_buckets.sql`

Creates two missing buckets:
- `division-assets` — public, 5 MB, image/jpeg + png + webp + svg. Used by Company + Division logos and stamps.
- `lc-bills` — private, 10 MB, image types + PDF. Used by landed-cost bill attachments. Signed URLs on read (1-hour TTL via existing `useBillSignedUrls`).

Both have RLS policies for authenticated read/insert/update/delete.

### 2B — Stock-adjustment signed-URL refactor

Before: photos uploaded, then a 365-day signed URL was persisted to `stock_adjustments.photo_urls`. That token = ~permanent access.

Now:
- **[useWarehouseOperations.ts](../src/hooks/useWarehouseOperations.ts)** — new `useAdjustmentPhotoSignedUrls(paths)` hook mirroring `useBillSignedUrls`: minted 1-hour signed URLs, keyed by path, 50-min staleTime.
- **[WhAdjustmentDialog.tsx](../src/components/purchase/wh/WhAdjustmentDialog.tsx)** — uploads store **paths** in `photo_urls`, not URLs. Added MIME allow-list + 10 MB cap + extension fallback. Rollback of successful uploads if any file in the batch fails.
- **[WhAdjustmentDetailDialog.tsx](../src/components/purchase/wh/WhAdjustmentDetailDialog.tsx)** and **[WhAdjustmentsTab.tsx](../src/components/purchase/wh/WhAdjustmentsTab.tsx)** — resolve paths on demand via the new hook. Backwards-compatible with old rows that stored full URLs (checks `startsWith('http')`).

### 2C — Landed-cost bill replace atomicity

**[landed-costs/page.tsx](../src/app/\(dashboard\)/purchase/landed-costs/page.tsx)** — reordered: upload new → swap state → best-effort delete old. Prior behavior deleted the old bill before uploading the new one, so an upload failure lost both.

### 2D — Consumption batch upload atomicity

**[NewConsumptionDialog.tsx](../src/components/consumption/NewConsumptionDialog.tsx)** — replaced `Promise.all` with `Promise.allSettled` + rollback of successful uploads if any file failed. User asks for N, gets all-or-nothing instead of a silent partial.

### 2E — Orphan cleanup on cancel (across every upload dialog)

Applied to 8 dialogs. Pattern:
- Track paths uploaded THIS dialog session in a ref
- On cancel/X/click-outside → sweep the ref from the bucket
- On successful save → clear ref (paths now live in the DB row)
- On removing a photo/attachment mid-session → delete the corresponding session-upload immediately
- Photo-replace within one session → drop the superseded upload immediately

Files: CustomerDialog, InventoryItemFormDialog, ItemEditDialog, NewConsumptionDialog, WhAdjustmentDialog, CreateLcDialog (inside landed-costs/page.tsx), CompanyFormDialog, DivisionFormDialog.

### 2F — Avatar cache-buster (reverted to correct behavior)

**[profile/page.tsx](../src/app/\(dashboard\)/profile/page.tsx)** — the `?t=Date.now()` querystring IS kept in the DB URL (necessary because the avatar path is deterministic + `upsert:true`, so the base URL never changes). Local `freshAvatarUrl` state override was added so the uploading tab refreshes immediately.

### 2G — Company logo in TopNav

**[TopNav.tsx](../src/components/layout/TopNav.tsx)** — displays the primary company's `logo_url` next to the brand name instead of the hardcoded Wrench icon. Wrench remains fallback if no logo.

### 2H — Discard-unsaved-changes prompt (8/75 dialogs)

**New hook: [useDirtyDialogGuard.tsx](../src/hooks/useDirtyDialogGuard.tsx)**

Renders an AlertDialog with "Discard unsaved changes?" whenever the user clicks outside, presses Escape, or clicks Cancel while form is dirty. Wire pattern:

```tsx
const { guardedOnOpenChange, confirmDialog } = useDirtyDialogGuard({
  isDirty,
  onOpenChange: handleOpenChange, // your existing wrapper if any
})
// <Dialog onOpenChange={guardedOnOpenChange}>...</Dialog>
// {confirmDialog}
```

Applied to the same 8 dialogs as §2E.

**Gotcha for react-hook-form dialogs:** the outer render must call `useWatch({ control: form.control })` so `formState.isDirty` stays fresh across keystrokes. Without it, only the field being watched via `form.watch(...)` triggers re-renders, leaving `isDirty` stale in the guard's closure. `InventoryItemFormDialog`, `CompanyFormDialog`, and `DivisionFormDialog` all needed this.

### 2I — Chat-media doc drift

**[contact-centre-v2-redesign.md](modules/contact-centre-v2-redesign.md)** — replaced `chat-media` (documentation-only misnomer) with the actual bucket name `chat-attachments`.

### 2J — Migration archive README

**[supabase/migrations-staging/_archive/README.md](../supabase/migrations-staging/_archive/README.md)** — warning against moving archived migrations back into the active folder. Safer than deleting 200+ files of tracked history.

---

## 3. What is NOT DONE (deferred / not started)

### 3A — Avatars RLS owner-check (High)

Anyone authenticated can currently overwrite anyone's avatar. Requires a migration adding `(storage.foldername(name))[1] = auth.uid()::text` to the update policy. **Not started.**

### 3B — Server-side file_size_limit / MIME allow-list on legacy buckets (High)

The following buckets have no server-side limits (client-side checks are trivially bypassed):
- `inventory-item-photos`
- `consumption-attachments`
- `adjustment-photos`
- `customer-credit-docs`

Single migration to add limits. **Not started.**

### 3C — Storage cascade triggers (Medium B)

DB `AFTER DELETE` triggers on `customers`, `company_divisions`, and `AFTER UPDATE` on `inventory_items.image_url` to remove orphaned objects from Storage. Requires `pg_net` + Vault-stored service-role key. Biggest ongoing leak is item photo replace during edit (no delete of the old file). **Not started.**

### 3D — PDF-bucket privatization (Low 2)

6 buckets with customer PII are `public = true`:
- `receival-receipt-pdfs`, `delivery-note-pdfs`, `return-pdfs`, `po-pdfs`, `bill-pdfs`, `booking-confirmations`

All served through auth-gated Next.js API routes that 302-redirect. Fix requires flipping the buckets private + updating all 5 PDF generators (`src/lib/{purchase,sales,returns}/generate-*-pdf.ts`) to store paths and mint short-TTL signed URLs on each call. **Not started — biggest scope.**

### 3E — Dirty-guard on remaining 67 dialogs

The 8 upload dialogs are done. 67 form-carrying dialogs across the app still don't prompt on cancel. Full list is in the conversation transcript above the "go ahead" message — includes SupplierFormDialog, EditUserDialog, WarehouseFormDialog, InventoryReceivalDialog, ReceivalFormDialog, WhTransferDialog, all the sales dialogs (DeliveryFormDialog, CreditNoteFormDialog, ReplacementDelivery, etc.), plus ~20 inline dialogs inside page.tsx files. Estimated ~2-3 hours of mechanical work.

Split roughly:
- ~15 RHF dialogs → mechanical (add `useWatch` + hook + wire 3 places)
- ~50 useState dialogs → need per-dialog `isDirty` calculation

---

## 4. How to verify what IS done — checklist

### 4.1 — Bucket creation (migration 20260815002000)

- Open **Master Data → Companies & Divisions → Add Company** → upload a logo → save. Should succeed, no 404.
- Open **Purchase → Landed Costs → Create Landed Cost** → attach a bill on a cost line. Paperclip should go green, no 404.
- Confirm on Supabase dashboard: Storage → both `division-assets` (public) and `lc-bills` (private) buckets exist.

### 4.2 — Adjustment photos signed URLs

- Create a new stock adjustment with an evidence photo → submit.
- Open the adjustment's detail dialog → photo should render (via 1-hour signed URL).
- Open the tab's photo preview → same.
- On Supabase dashboard: `stock_adjustments.photo_urls` for new rows contains storage paths (e.g. `user-id/1728…-abc.jpg`), NOT full HTTPS URLs. Old rows still contain full URLs and continue to render.

### 4.3 — Landed-cost bill replace

- Create a draft LC with a cost line → attach a bill. Replace it with a second file. Second upload should succeed. First file should be gone from `lc-bills` bucket (check Supabase dashboard).
- If the second upload fails (throw an error via network throttling): first file should still be intact.

### 4.4 — Consumption Promise.allSettled

- Hard-to-test manually. Trust the code: `Promise.allSettled` + rollback on any rejection.

### 4.5 — Orphan cleanup on cancel (8 dialogs)

For each dialog, the recipe is:
1. Open dialog → upload a file (photo / doc / bill).
2. Click outside OR press Escape OR click Cancel → confirm "Discard" (if dirty-guard fires).
3. Reopen the same dialog → file slot should be empty, not the file you just uploaded.
4. On Supabase dashboard: the file should be gone from the bucket.

Specific tests:
- **CustomerDialog** — upload CR / Establishment ID / Signed form → cancel → bucket clean
- **InventoryItemFormDialog** — upload item photo → cancel → clean
- **ItemEditDialog** — same
- **NewConsumptionDialog** — upload attachment → cancel → clean
- **WhAdjustmentDialog** — upload photo → cancel → clean
- **CreateLcDialog** (landed-costs page) — attach bill → cancel → clean. Also: attach bill → click the trash icon on the cost line → file removed.
- **CompanyFormDialog** — upload logo + stamp → cancel → both clean
- **DivisionFormDialog** — same

### 4.6 — Photo-replace within one session

- **InventoryItemFormDialog / ItemEditDialog / CompanyFormDialog / DivisionFormDialog**: open dialog → upload photo A → click "Change photo" and upload photo B → save. Only photo B should remain in the bucket (A auto-deleted on replace).

### 4.7 — Avatar cache-buster

- Go to `/profile` → upload a new avatar. The image on the profile page should refresh immediately without page reload.
- Navigate to any other page and back → TopNav avatar should show the NEW image (not the previous one).
- On Supabase: `user_data.avatar_url` should contain `?t=<timestamp>` in the URL.

### 4.8 — TopNav company logo

- Master Data → Companies → upload a logo on the primary company → save.
- Reload the page. TopNav should show the uploaded logo instead of the Wrench icon.
- If no company has a logo, Wrench icon shows as fallback.

### 4.9 — Dirty-guard prompt

For each of the 8 dialogs, verify:
1. Open dialog → type nothing → click outside → dialog closes silently (no prompt).
2. Open dialog → type any field → click outside → **"Discard unsaved changes?"** prompt.
3. Prompt → click **Keep editing** → prompt closes, dialog stays with your typed values.
4. Prompt → click **Discard** → both close, next open of dialog is empty.
5. **Escape key** and the Cancel button also trigger the prompt when dirty.
6. Fill fields → click Save/Create → dialog closes with no prompt (success bypasses guard).

Verified pilots (confirmed by user): CustomerDialog ✅, InventoryItemFormDialog ✅ (after the useWatch fix).

### 4.10 — Chat-media doc

Trivial: `grep -n "chat-media" docs/modules/contact-centre-v2-redesign.md` should return no results. `chat-attachments` is used consistently.

---

## 5. Migrations state

- **Applied to staging (`mwvblpgbgxipvrevkeff`)** on 2026-08-04:
  - `20260815002000_create_division_assets_and_lc_bills_buckets.sql`
- **Not applied to dev** (per policy — dev DB frozen during deploy/warehouse-shipping window).

---

## 6. Uncommitted files

**Modified:**
- `src/app/(dashboard)/profile/page.tsx`
- `src/app/(dashboard)/purchase/landed-costs/page.tsx`
- `src/components/consumption/NewConsumptionDialog.tsx`
- `src/components/layout/TopNav.tsx`
- `src/components/master-data/CompanyFormDialog.tsx`
- `src/components/master-data/CustomerDialog.tsx`
- `src/components/master-data/DivisionFormDialog.tsx`
- `src/components/master-data/InventoryItemFormDialog.tsx`
- `src/components/purchase/wh/WhAdjustmentDetailDialog.tsx`
- `src/components/purchase/wh/WhAdjustmentDialog.tsx`
- `src/components/purchase/wh/WhAdjustmentsTab.tsx`
- `src/components/services/inventory/ItemEditDialog.tsx`
- `src/hooks/useWarehouseOperations.ts`
- `src/lib/queryKeys.ts`
- `docs/modules/contact-centre-v2-redesign.md`

**New:**
- `src/hooks/useDirtyDialogGuard.tsx`
- `supabase/migrations/20260815002000_create_division_assets_and_lc_bills_buckets.sql`
- `supabase/migrations-staging/_archive/README.md`

---

## 7. Recommended next steps

**When you resume:**
1. Smoke-test the 8 patched dialogs against §4.5 and §4.9 checklists.
2. If clean, commit in logical groups (per project git co-authorship rule):
   - Group 1 — bucket migration + adjustment signed-URL refactor
   - Group 2 — orphan-cleanup + atomicity fixes across the 8 dialogs
   - Group 3 — dirty-guard hook + rollout to 8 dialogs
   - Group 4 — TopNav company logo + avatar cache-buster + docs
3. Update PROGRESS.md + EOD.
4. Decide on the deferred items in §3:
   - §3A + §3B — quick single migration for avatars RLS + bucket limits. Low risk.
   - §3E — grind through remaining 67 dialogs. Can be split across sessions.
   - §3C — DB triggers, needs pg_net + Vault setup.
   - §3D — PDF privatization, biggest scope. Consider after warehouse-shipping ships.
