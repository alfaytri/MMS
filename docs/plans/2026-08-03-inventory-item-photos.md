# Inventory Item Photos — Phase Plan

**Branch:** `feature/inventory-item-photos` (off `feature/field-inventory-and-consumption`)
**Started:** 2026-08-03
**Trigger:** Operator wants every item-picker surface to show a product photo so the pick is visual, not just textual — starting from the red-rectangle spot on the `WhItemPicker` in the New Consumption dialog.

## Decisions locked (see chat)

| Question | Answer |
|---|---|
| Storage | Public bucket `inventory-item-photos`; item stores photo URL directly |
| Upload surfaces | (a) Inventory item add/edit form; (b) Bulk Excel import (optional Image URL column) |
| Picker UI | 48×48 px right-side square thumbnail, grey `Package`-icon fallback |
| Scope | Every existing item-picker surface — one reusable `ItemPhoto` component |

## DB changes — 1 migration

`20260815001800_inventory_item_photos.sql`
- `ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS image_url text` (nullable)
- New public storage bucket `inventory-item-photos`
- Storage RLS:
  - Select: `TO public` (anyone can read — that's the point of a public bucket)
  - Insert / Update / Delete: `TO authenticated` (any signed-in user; upload happens through the item form which is already permission-gated)
- Regenerate `database.types.ts` + re-append helper aliases

Storage folder convention: `<yyyy>/<mm>/<item-id-or-pending>/<timestamp>-<sanitised-filename>`.

## App changes — one reusable primitive, then wired everywhere

### 1. `src/components/shared/ItemPhoto.tsx` (new)

```tsx
<ItemPhoto url={item.image_url} name={item.name} size={48} />
```

- Wraps `<img>` with `loading="lazy"`, `decoding="async"`, `object-cover`, rounded corners.
- On missing URL OR `<img onError>`: renders a grey `Package` lucide icon centered in a `bg-muted` square. **Never a broken-image glyph.**
- Sizes: 32 / 40 / 48 / 64 (props narrow the choice for consistency).
- Only one image element per render, no runtime fetch — the URL is already public.

### 2. Item add/edit form — `InventoryItemFormDialog.tsx`

- New **Photo** field above name/SKU.
- If item already has `image_url` → thumbnail + Remove button.
- If empty → dashed upload button (drag-drop optional; MVP is click-to-pick).
- Upload calls `compressImageBeforeUpload` (Task 9 revision helper) → `supabase.storage.from('inventory-item-photos').upload(...)` → `getPublicUrl` → set on the form state.
- On save, the `image_url` is written alongside the rest of the item update.
- On new-item create path where we don't have an `id` yet, upload to `pending/` and either (a) let the file live there or (b) rewrite path post-create — MVP is (a); storage garbage from cancelled creates gets swept by a monthly cron later (not this phase).

### 3. Bulk Excel import — `src/lib/inventory-import.ts` + `useInventoryImport.ts`

- Add optional column **Image URL** to the import template (writer + reader).
- Reader stores the URL as-is on the item row.
- No compression on this path — the operator has already staged the image at that URL.
- Validation: if present, must be `https://` (skip on empty).

### 4. Wire `ItemPhoto` into every picker surface

| Surface | File | What changes |
|---|---|---|
| `WhItemPicker` | `src/components/purchase/wh/WhItemPicker.tsx` | Right-side 48×48 thumbnail on each row (the red rectangle). Extend `PickerItem` type with `imageUrl?: string`. |
| Callers of WhItemPicker | 6 files (CustodyAssignDialog, CustodyReturnDialog, NewConsumptionDialog, WhAdjustmentDialog, WhTransferDialog, any I missed) | Populate `imageUrl` when building the `PickerItem[]` array from stock rows. Stock queries already join `inventory_items` for the name — extend the select with `image_url`. |
| `CascadeInventorySelector` | `src/components/purchase/CascadeInventorySelector.tsx` | Once the tree drills down to leaf items, render a 32×32 thumbnail next to the item name. Category rows stay text-only. |
| Callers of CascadeInventorySelector | 6 files (PoLineItemsEditor, PoReceiveTab, ReceivalFormDialog, SoLineItemsEditor, ReplacementDeliveryDialog, possibly others) | No callsite changes — the selector reads `image_url` from its own item query. |
| Inventory master list | `src/app/(dashboard)/master-data/inventory/page.tsx` | 40×40 thumbnail in the item name cell. |
| Item detail dialog | if one exists | Larger 120×120 preview at top of dialog. |

Data-fetching change: every hook that returns items for picker consumption (`useWarehouseStock`, `useInventoryLeafItems`, the cascade selector's own query) gets `image_url` added to its select clause + resulting row type.

### 5. Fallback rule (design system)

The `ItemPhoto` component enforces:
- Missing URL → placeholder (Package icon on `bg-muted`).
- Failed load → same placeholder via `onError`.
- No `<img>` ever ships with `src=""` or a placeholder value (avoids the "broken image" browser glyph and the impeccable design-hook warning).

## Task breakdown

- [ ] Task 1 — Migration + storage bucket + type regen
- [ ] Task 2 — `ItemPhoto` shared component
- [ ] Task 3 — Photo field on `InventoryItemFormDialog` (upload + preview + remove)
- [ ] Task 4 — Bulk Excel import: Image URL column (writer + reader + template help sheet)
- [ ] Task 5 — Extend `useWarehouseStock` + `WhItemPicker` types with `image_url` → thumbnail on the picker row (this is the red-rectangle fix)
- [ ] Task 6 — Extend `CascadeInventorySelector` leaf rows with thumbnails
- [ ] Task 7 — Thumbnail on the inventory master-data list
- [ ] Task 8 — Verify (tsc + manual smoke) + commit + PROGRESS + EOD

Each task = one code commit + one docs commit per project protocol.

## Non-goals for this phase

- Variant-level (per-SKU) photos — item-level only for now.
- Photo cropping / rotation UI — trust the operator + compress helper.
- Photo gallery (multiple photos per item) — single photo for now.
- CDN / image-optimizer — public Supabase bucket URL is enough at project scale.
- Storage garbage-collection cron — deferred.

## Rollback

`ALTER TABLE public.inventory_items DROP COLUMN image_url` + drop the bucket. All UI reads null-safe on `image_url` so removing the column just makes every picker fall back to the Package placeholder — no code redeploy required.
