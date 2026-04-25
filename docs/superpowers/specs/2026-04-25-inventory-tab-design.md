# Inventory Tab — Full Implementation Design

**Route:** `/master-data/services` → Inventory tab  
**Date:** 2026-04-25  
**Scope:** Rebuild `InventoryTab.tsx` + all sub-components to match the `Ideas/inventory.txt` spec

---

## Overview

Replace the current flat two-sub-tab `InventoryTab.tsx` with a full 5-tab inventory management UI. The Inventory tab lives exclusively inside the Services Hub — the standalone `/master-data/inventory` route has been removed.

---

## Folder Structure

```
src/components/services/inventory/
├── ItemsListView.tsx           ← Products / Spare Parts / Consumables (type prop)
├── CategoryRow.tsx             ← Level 1 expandable row
├── ItemRow.tsx                 ← Level 2 expandable row
├── BrandVariantRow.tsx         ← Level 3 expandable row + FIFO expand toggle
├── FifoLayersTable.tsx         ← Level 4 read-only FIFO panel
├── ToolsAssetsView.tsx         ← flat list from tool_asset_items
├── ServiceLinksView.tsx        ← item → service linking matrix
├── CategoryEditDialog.tsx      ← create / edit / archive category
├── ItemEditDialog.tsx          ← create / edit / archive item
├── BrandVariantEditDialog.tsx  ← create / edit / archive brand variant
└── ToolAssetEditDialog.tsx     ← create / edit / archive tool/asset
```

`src/components/services/InventoryTab.tsx` — rewritten as the 5-tab shell only. No data fetching; passes `enabled` flag to each sub-component.

---

## The 5 Sub-Tabs

| Tab | Component | Data source |
|-----|-----------|-------------|
| Products (Installation) | `ItemsListView type="product"` | `inventory_items` filtered by `item_type` |
| Spare Parts (Sales) | `ItemsListView type="spare_part"` | same |
| Consumables (Internal) | `ItemsListView type="consumable"` | same |
| Tools & Assets | `ToolsAssetsView` | `tool_asset_items` |
| Service Links | `ServiceLinksView` | `service_inventory` join |

Active tab gets orange bottom border (matching app design system). Tab switcher is local `useState` — no URL param (the services page already owns the outer tab URL param).

---

## Tree View — Products / Spare Parts / Consumables

### Expand State
`ItemsListView` holds `expandedCategories: Set<string>` and `expandedItems: Set<string>` and `expandedVariants: Set<string>` in local state. Clicking a chevron toggles the relevant set.

### Level 1 — Category Row (`CategoryRow.tsx`)

| Column | Content |
|--------|---------|
| ITEM | chevron + 📦 icon + `name_en` (bold) + `name_ar` (muted, smaller) |
| SKU | `sku_prefix` |
| UNIT | — |
| PRICING | — |
| STOCK / SERVICES | — |
| ACTIONS | ⇅ sort · ✏️ edit → `CategoryEditDialog` · 📦 archive (confirm dialog) |

### Level 2 — Item Row (`ItemRow.tsx`)

| Column | Content |
|--------|---------|
| ITEM | indented chevron + `name_en` + attribute chips (from `inventory_item_attributes`) + `name_ar` (muted) |
| SKU | `sku` |
| UNIT | `unit` |
| PRICING | Avg Cost: `average_cost` averaged across brand variants (QAR) |
| STOCK / SERVICES | stock badge (sum of `stock_level` across variants, colour-coded) + 🔗 service-link count badge |
| ACTIONS | ⇅ sort · ✏️ edit → `ItemEditDialog` · ↕ rearrange brands · 📦 archive |

Stock badge colours: green if > 0, amber if ≤ `reorder_point`, red if 0.

### Level 3 — Brand Variant Sub-Table (`BrandVariantRow.tsx`)

Nested grey-header table rendered when item is expanded.

| Column | Content |
|--------|---------|
| SUPPLIER / BRAND | brand name (clickable → `BrandVariantEditDialog`) |
| CODE | auto-generated SKU |
| AVG COST | `average_cost` from `inventory_brand_variants` |
| SELLING PRICE | `selling_price` |
| STOCK LEVEL | `stock_level` (green / amber / red) |
| INCOMING | sum of open PO line items not yet received |
| ACTIONS | ⇅ sort · ✏️ edit · 📦 archive |

Below the brand table: **"+ Add Brand Variant"** text button → opens `BrandVariantEditDialog` in create mode.

Clicking a brand variant row expands Level 4 (FIFO panel) below it.

### Level 4 — FIFO Layers Panel (`FifoLayersTable.tsx`)

Read-only. Fetched lazily when variant row is first expanded (`enabled: variantExpanded`).

| Column | Source field |
|--------|-------------|
| RECEIVAL # | `receival_number` (— if null/legacy) |
| DATE | `date` |
| QTY IN | `qty` |
| REMAINING | `remaining_qty` (green if > 0, grey if 0) |
| UNIT COST | `unit_cost` |
| LANDED | `landed_cost_per_unit` (— if 0) |
| TOTAL/UNIT | `total_unit_cost` |

No edit actions. Layers are written exclusively by Postgres RPCs.

### Toolbar (shared across all 3 product tabs)
- 🔍 Search (filters by `name_en`, `name_ar`, `sku` live)
- Show archived toggle (OFF by default — hides `status = 'archived'` at all levels)
- **+ New Category** button (top-right, orange) → `CategoryEditDialog` create mode

---

## Tools & Assets Tab (`ToolsAssetsView.tsx`)

Flat searchable table from `tool_asset_items`. No tree hierarchy.

| Column | Content |
|--------|---------|
| NAME | item name |
| CODE / TAG | asset code or tag |
| CATEGORY | free-text category |
| TYPE | `serialized` / `bulk` badge |
| QTY / SERIAL | bulk → quantity; serialized → serial number |
| STATUS | active / archived badge |
| ACTIONS | ✏️ edit → `ToolAssetEditDialog` · 📦 archive |

Toolbar: search input + **"+ Add Tool/Asset"** button.

No FIFO layers, no cost tracking — tools are not costed inventory.

---

## Service Links Tab (`ServiceLinksView.tsx`)

Items-first matrix. Shows all inventory items with their linked service count.

| Column | Content |
|--------|---------|
| ITEM | `name_en` |
| SKU | `sku` |
| TYPE | item_type badge |
| LINKED SERVICES | count badge |
| ACTIONS | **Manage Links** button |

**Manage Links** opens a dialog with all services as a checkbox list. Check = insert `service_inventory` row; uncheck = delete row. Filtered search inside the dialog.

Toolbar: search by item name + filter by service dropdown.

---

## CRUD Dialogs

### CategoryEditDialog
Fields: Name (EN) · Name (AR) · SKU Prefix  
Edit mode adds: Status toggle (active / archived)  
Archive: separate confirm step with warning about hidden child items.

### ItemEditDialog
Fields: Name (EN) · Name (AR) · SKU · Unit (select: Piece/Kg/Litre/Set/Box/Other) · Item Type (locked to current tab, read-only in edit) · Attribute chips (add/remove free-text tags)  
Parent category pre-filled from context row.

### BrandVariantEditDialog
Fields: Brand (dropdown from `brands` table — human-readable name, never UUID) · SKU Code · Selling Price · Reorder Point  
No cost fields — cost is FIFO-derived only.

### ToolAssetEditDialog
Fields: Name · Code/Tag · Category · Type toggle (Serialized / Bulk)  
Conditional: Serialized → Serial Number field; Bulk → Quantity field  
Edit mode adds: Status toggle.

### Dialog Rules (all dialogs)
- Mobile: `w-full h-full rounded-none` (full-screen)
- Desktop: `sm:max-w-lg sm:rounded-lg` (centered card)
- Archive is always a separate confirm step
- Dropdowns must show human-readable labels — never raw UUIDs (UUID Guard rule)

---

## Hooks to Add (`useInventory.ts`)

| Hook | Operation |
|------|-----------|
| `useCreateInventoryCategory()` | INSERT `inventory_categories` |
| `useUpdateInventoryCategory()` | UPDATE name/name_ar/sku_prefix/status |
| `useArchiveInventoryCategory()` | UPDATE `status = 'archived'` |
| `useArchiveInventoryItem()` | UPDATE `status = 'archived'` |
| `useArchiveInventoryBrandVariant()` | UPDATE `status = 'archived'` |
| `useFifoLayers(brandVariantId, enabled)` | SELECT `fifo_cost_layers` ordered by date ASC |
| `useToolAssets(search)` | SELECT `tool_asset_items` with optional search |
| `useCreateToolAsset()` | INSERT `tool_asset_items` |
| `useUpdateToolAsset()` | UPDATE `tool_asset_items` |

All existing hooks (`useInventoryCategories`, `useInventoryItems`, `useBrandVariants`, `useCreateInventoryItem`, `useUpdateInventoryItem`, `useCreateBrandVariant`, `useUpdateBrandVariant`) are reused as-is.

---

## What Was Removed

- `src/app/(dashboard)/master-data/inventory/page.tsx` — deleted ✅
- Nav entry `{ label: 'Inventory Items', href: '/master-data/inventory' }` — removed from `nav-config.ts` ✅

---

## No DB Migration Required

- `fifo_cost_layers.landed_cost_per_unit` — already exists (NUMERIC DEFAULT 0)
- `fifo_cost_layers.total_unit_cost` — already exists
- `inventory_items.item_type` — already exists
- All other tables referenced are existing schema
