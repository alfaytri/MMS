# Warehouses Hub Redesign — Design Spec

**Date:** 2026-04-20
**Route:** `/purchase/warehouses` (no route change)
**Nav:** Move from Purchase & Sales > Operations → Master Data group 1 (between Suppliers and Users & Roles)
**Approach:** Option A — rewrite existing files in place, client-side merge for Tab 7, no DB migrations

---

## Goals

- Rebuild the existing 7-tab Warehouses hub to match the detailed UI spec exactly
- Add Tab 7 "Receivals & Deliveries" unifying inbound purchase receivals + outbound sale deliveries
- Move nav entry from Purchase & Sales into Master Data dropdown
- Apply consistent compact density, semantic color tokens, and attention patterns throughout

---

## Architecture

### Page Skeleton

```
flex flex-col h-full
├── Sticky header (border-b)        — title + 3 action buttons
├── <Tabs> wrapping remainder
│   ├── TabsList h-8                — 7 compact triggers with badge counters
│   └── TabsContent flex-1 overflow-auto — per-tab scroll
└── 4 dialogs mounted at page level
```

### State Owned at `page.tsx`

| State | Type | Purpose |
|-------|------|---------|
| `activeTab` | URL search param `?tab=` | Which tab is shown (default `"warehouses"`) — see URL State section |
| `currentProfile` | from `useCurrentProfile()` | Permission checks passed as prop |
| `warehouses` | from `useWarehouses()` | Shared across all tabs via prop |
| `pendingTransferCount` | `number` | Transfer tab badge |
| `pendingReceivalCount` | `number` | Receivals tab badge |

Dialog open state is **co-located inside each dialog component** — each dialog owns its own `open` boolean via an imperative ref or a trigger prop pattern. `page.tsx` passes an `onOpenChange` prop only where needed (e.g., header buttons → `WhAdjustmentDialog`, `WhInventoryCheckDialog`, `WhTransferDialog`). `WhReceivalDetailDialog` receives `selectedReceival: ReceivalDelivery | null` + `onClose` from `ReceivalsDeliveriesTab`.

### URL-Based Tab State

`activeTab` is driven by `?tab=<value>` search param, not `useState`. This makes tabs linkable, refresh-safe, and back-button aware.

```tsx
// page.tsx pattern (Next.js App Router)
// Wrap page export in <Suspense> boundary to allow useSearchParams
const searchParams = useSearchParams()
const router = useRouter()
const activeTab = searchParams.get('tab') ?? 'warehouses'
const setActiveTab = (val: string) =>
  router.replace(`/purchase/warehouses?tab=${val}`, { scroll: false })
```

Page component must be wrapped in `<Suspense fallback={null}>` at the route level (or in the parent layout) to satisfy Next.js App Router requirements for `useSearchParams`.

### Performance: Preventing Re-render Cascades

- Each tab component (`WhWarehousesTab`, `WhStockOverviewTab`, etc.) is wrapped in `React.memo` — badge count updates in `page.tsx` won't cascade into mounted tab content
- Shadcn `<Tabs>` already skips rendering non-active `TabsContent` children, so unmounted tabs don't run
- Dialog hooks use `enabled: open` guard — no fetches fire until the dialog is actually open

### Permission Logic

- `canApproveTransfer`: `isAdmin OR currentProfileId === receivingWh.managerId`
- `canApproveAdjustment`: same as above per adjustment's warehouse
- `hasAdminRole`: drives inventory check reviewer panel visibility
- All mutations write `audit("purchase", action, …)` to audit trail

---

## Design Tokens & Patterns

**Compact density:** text-xs / text-[10px] / text-[9px]; buttons h-8/h-7/h-6; icons h-3/h-3.5/h-4

**Semantic color mapping (never use raw colors):**

| Semantic | Use case |
|----------|----------|
| `success` | approved, increase, inbound, zero variance |
| `warning` | pending_approval, decrease, variance, submitted checks |
| `destructive` | rejected, damage, write_off, negative variance, order_usage |
| `primary` | in_transit, adjustment_in, dispatched, SKU text |
| `muted` | pending, not counted, draft |

**Attention pattern:** `border-{status}/30 bg-{status}/5` on cards/rows needing action

**Empty states:** centered muted text + optional faded `h-10 text-muted-foreground/30` icon

**Borders:** `rounded-md border` (tables), `rounded-lg border` (cards/list rows)

**Tab badge style:** `ml-1 h-4 px-1 text-[9px] bg-warning/20 text-warning`

---

## Navigation Change

**File:** `src/components/layout/nav-config.ts`

- Remove `{ label: 'Warehouses', href: '/purchase/warehouses' }` from Purchase & Sales Operations group
- Add `{ label: 'Warehouses', href: '/purchase/warehouses' }` to Master Data group 1 between `Suppliers` and `Users & Roles`

---

## Files Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `src/components/layout/nav-config.ts` | Move nav entry |
| Rewrite | `src/app/(dashboard)/purchase/warehouses/page.tsx` | Page orchestrator |
| Rewrite | `src/components/purchase/wh/WhWarehousesTab.tsx` | Tab 1 |
| Rewrite | `src/components/purchase/wh/WhStockOverviewTab.tsx` | Tab 2 |
| Rewrite | `src/components/purchase/wh/WhTransfersTab.tsx` | Tab 3 |
| Rewrite | `src/components/purchase/wh/WhAdjustmentsTab.tsx` | Tab 4 |
| Rewrite | `src/components/purchase/wh/WhInventoryChecksTab.tsx` | Tab 5 |
| Rewrite | `src/components/purchase/wh/WhMovementsTab.tsx` | Tab 6 |
| **Create** | `src/components/purchase/wh/ReceivalsDeliveriesTab.tsx` | Tab 7 (new unified) |
| Rewrite | `src/components/purchase/wh/WhTransferDialog.tsx` | Modal C |
| Rewrite | `src/components/purchase/wh/WhAdjustmentDialog.tsx` | Modal A |
| Rewrite | `src/components/purchase/wh/WhInventoryCheckDialog.tsx` | Modal B |
| **Create** | `src/components/purchase/wh/WhReceivalDetailDialog.tsx` | Modal D |
| **Delete** | `src/components/purchase/wh/WhReceivalsTab.tsx` | Replaced by ReceivalsDeliveriesTab |
| Modify | `src/hooks/useWarehouseOperations.ts` | Add `useReceivalsAndDeliveries()` |

---

## Header (Sticky)

```
flex justify-between gap-2 px-4 md:px-6 py-4 border-b border-border
```

**Left:** `<h1>` "Warehouses" (text-lg font-semibold) + `<p>` "Stock overview, transfers, adjustments & movements" (text-xs text-muted-foreground)

**Right — 3 outline buttons (size="sm" variant="outline"):**

| Icon (h-3.5) | Label | Opens |
|---|---|---|
| `<ClipboardList>` | Stock Adjustment | `adjustmentOpen = true` |
| `<ClipboardCheck>` | Inventory Check | `checkOpen = true` |
| `<ArrowRightLeft>` | Transfer Stock | `transferOpen = true` |

---

## Tab Bar

`<TabsList>` h-8 `overflow-x-auto whitespace-nowrap scrollbar-hide`, all triggers text-xs gap-1, icons h-3 w-3

| # | Value | Icon | Label | Badge |
|---|-------|------|-------|-------|
| 1 | `warehouses` | `WarehouseIcon` | Warehouses | — |
| 2 | `stock` | `Layers` | Stock Overview | — |
| 3 | `transfers` | `ArrowRightLeft` | Transfers | `pendingTransferCount` warning |
| 4 | `adjustments` | `ClipboardList` | Adjustments | — |
| 5 | `checks` | `ClipboardCheck` | Inv. Checks | — |
| 6 | `movements` | `Activity` | Movements | — |
| 7 | `receivals` | `Truck` | Receivals & Deliveries | `pendingReceivalCount` warning |

---

## Tab 1 — Warehouses (`WhWarehousesTab`)

**Empty:** centered "No warehouses configured. Add warehouses in Admin Settings."

**Else:** `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`

Each card (`hover:shadow-md transition-shadow`):
- **Header** (pb-2): `<WarehouseIcon h-4 text-primary>` + name (text-sm font-medium)
- **Body** (space-y-2):
  - `<MapPin h-3>` location (text-xs text-muted-foreground; "No location set" fallback)
  - `<User h-3>` "Manager:" + manager name (font-medium; "Unassigned" fallback)
- **Footer** (pt-2 border-t flex justify-between):
  - `<Package h-3.5 text-primary>` `{itemCount.toLocaleString()} items`
  - `<DollarSign h-3.5 text-success>` `QR {totalValue.toLocaleString()}`

---

## Tab 2 — Stock Overview (`WhStockOverviewTab`)

**Summary row** (`grid grid-cols-3 gap-3`, each `p-3 rounded-md border`):

| Icon (h-4) | Label (text-[10px]) | Value (text-sm font-semibold) |
|---|---|---|
| `Layers` (primary) | Total Items | unique brand-variant count |
| `Package` (primary) | Total Qty | sum of all qty |
| `DollarSign` (success) | Total Value | `QR {value}` 2dp |

**Controls row** (`flex gap-3 mb-4`):
- Search input h-8 text-xs pl-8 max-w-xs, `<Search h-3.5>` left-inset, placeholder "Search items…"
- View Select w-[150px]: "Company Total" / "By Warehouse"

**View A — Company Total** (bordered table):
Cols: Category | Item | Brand | SKU (text-primary) | Qty (font-medium) | Reserved ("—" if zero) | Available (text-destructive if negative) | Value (QR)
- Right-aligned numeric columns
- Empty: 8-col centered "No stock data"

**View B — By Warehouse** (`<Accordion type="multiple">`):
- Trigger: warehouse name + outline badge `"{qty} items · QR {value}"`
- Content: nested table (Item / Brand / SKU / Qty / Value) all text-[10px]/text-xs

---

## Tab 3 — Transfers (`WhTransfersTab`)

`p-4 md:p-6`. Empty: "No transfers yet." Else `space-y-3`.

**Card** (`rounded-lg border p-4`, + `border-warning/30 bg-warning/5` if `pending_approval`):

**Top row** (flex justify-between mb-2):
- Left: transfer number (text-xs font-semibold text-primary) + status badge + date (text-[10px] muted)
- Right (only if `pending_approval`):
  - Can approve → Approve (h-7 success-tinted + `<CheckCircle2 h-3>`) + Reject (h-7 destructive-tinted + `<XCircle h-3>`)
  - Cannot approve → outline badge "Awaiting approval from {managerName}"

**Status palette:**

| Status | Style |
|--------|-------|
| `pending` | `bg-muted text-muted-foreground` |
| `in_transit` | `bg-primary/10 text-primary` |
| `pending_approval` | `bg-warning/10 text-warning` |
| `approved` | `bg-success/10 text-success` |
| `rejected` | `bg-destructive/10 text-destructive` |

**Body** (text-xs mb-2): `{fromWh}` `<ArrowRight h-3>` `{toWh}` · "by {createdByName}" · (if approved) `• Approved by {name}` (text-[10px] text-success)

**Items:** `flex flex-wrap gap-1.5` outline badges `"{qty}× {itemName}"` text-[10px]

**Footer:** notes (text-[10px] muted mt-1.5) if present

---

## Tab 4 — Adjustments (`WhAdjustmentsTab`)

Bordered table inside `p-4 md:p-6`.

**Cols:** Date (dd MMM) | Warehouse | Item (`{itemName}` + muted `({brand})`) | Type badge | Qty | Reason | Requested By | Status badge | Photos | Actions

**Type badges** (capitalize, `_` → space):
- `increase` → success
- `decrease` → warning
- `damage` / `write_off` → destructive

**Status badges:** `pending_approval` → warning | `approved` → success | `rejected` → destructive

**Photos:** ghost button `<Eye h-3>` + count → Photo Preview Dialog (`max-w-lg`, 2-col grid, aspect-square `<img>` tags) — rendered inline in `WhAdjustmentsTab.tsx` via a local `useState`, not a separate file

**Actions** (only if `pending_approval` + canApprove):
- Approve (h-6 text-[10px] success-tinted) + Reject (h-6 destructive-tinted) → call `process-stock-adjustment` edge function
- Else: "Awaiting approval" text or approver name

**Empty:** "No stock adjustments yet"

---

## Tab 5 — Inventory Checks (`WhInventoryChecksTab`)

**Empty:** centered `<ClipboardCheck h-10 text-muted-foreground/30>` + "No inventory checks yet"

**List:** `space-y-2` clickable rows (`px-3 py-2.5 rounded-lg border hover:bg-muted/30`). Pending rows: `border-warning/30 bg-warning/5`.

Each row: tinted icon-box (h-9 w-9 rounded-md flex items-center justify-center) + check number (text-xs font-semibold) + status badge + date (text-[10px] muted) right-aligned + `<Eye h-3.5>`. Sub-line: warehouse name · "by {submittedByName}" (text-[10px] muted).

**Status configs:**

| Status | Icon | Color |
|--------|------|-------|
| `draft` | `Clock` | muted |
| `submitted` | `Clock` | warning |
| `approved` | `CheckCircle2` | success |
| `rejected` | `XCircle` | destructive |

**Detail Dialog** (`max-w-2xl max-h-[85vh] flex flex-col`):
- Header: check number + status badge + warehouse name (muted)
- `<ScrollArea>` items table: Item | Brand | SKU | System | Counted | Variance | Status
  - Row tints: `bg-success/5` (zero variance), `bg-warning/5` (non-zero), `bg-muted/30` (not counted)
  - Variance: `text-success +N` / `text-destructive -N`
  - Status: "Match" (success badge) / "Variance" (warning badge) / "Not counted" (muted outline badge)
- Submitter notes box (muted bg, rounded) if present
- **Reviewer panel** (only if `submitted` + `hasAdminRole`): notes textarea + Reject (destructive outline) + Approve & Adjust (bg-success) → `process-inventory-check` edge fn
- **Footer audit:** "Approved/Rejected by {name} on {date} — {notes}"

---

## Tab 6 — Movements (`WhMovementsTab`)

**Filters** (`flex flex-wrap gap-3 mb-4`):
- Search max-w-xs "Search item / brand / SKU…"
- Warehouse Select w-[160px]
- Type Select w-[160px]: All + 7 movement types

**Bordered table cols:** Date (dd MMM yy) | Item | Brand | SKU | Type badge | Qty | Unit Cost | Total | Warehouse | Ref

**Type badge palette:**

| Type | Style |
|------|-------|
| `purchase` | success |
| `order_usage` | destructive |
| `adjustment_in` | primary |
| `adjustment_out` | warning |
| `transfer_in` | accent |
| `transfer_out` | secondary |
| `damage` | destructive |

**Empty:** 10-col centered "No movements found"

---

## Tab 7 — Receivals & Deliveries (`ReceivalsDeliveriesTab`) — NEW

**Filters** (`flex flex-wrap gap-3 mb-4`):
- Search max-w-xs "Search doc# / ref / party…"
- Direction Select w-[150px]: "All ({n})" / "Inbound ({n})" / "Outbound ({n})"
- Warehouse Select w-[160px]

**Bordered table** (clickable rows `hover:bg-muted/30`):
Cols: Direction | Doc # | Reference | Warehouse | Counterparty | Date | Items (count badge) | Status

**Direction badges:**
- Inbound: `bg-success/10 text-success` + `<Package h-2.5>` "Receival"
- Outbound: `bg-primary/10 text-primary` + `<Truck h-2.5>` "Delivery"

**Status badges:**
- `approved` / `delivered` → success
- `pending` / `pending_approval` → warning
- `dispatched` → primary
- else → muted

**Click → `WhReceivalDetailDialog`** (`max-w-md`):
- Header: doc# + direction badge
- 2-col info grid: Reference | Warehouse | Date | Counterparty
- Inbound: items table (Item / SKU / Qty)
- Outbound: items table (Line Item id slice / Qty)
- Read-only

**Badge counter:** `pendingReceivalCount` = inbound items with `status === 'pending_approval'`

---

## Modal A — Stock Adjustment Dialog (`WhAdjustmentDialog`)

`max-w-lg max-h-[90vh]` with internal scroll.

1. Warehouse Select (required)
2. `<InventoryItemLookup>` component (required)
3. 2-col grid: Type Select + Qty number input
   - Types: `increase` (Found/Returned), `decrease` (Lost/Consumed), `damage`, `write_off`
4. Reason input (required)
5. Notes textarea (optional)
6. Evidence Photos (max 5):
   - Existing: 16×16 thumb with hover-overlay X button
   - Add tile: 16×16 dashed border + `<Camera h-4>` → hidden `<input type="file" accept="image/*">`
7. Footer: Cancel | **Submit for Approval** (disabled until warehouse + item + type + qty + reason filled)

**Dialog fetch gating:** All internal queries use `enabled: open` so nothing fires until the dialog is open.

**Flow:** Upload files → `adjustment-photos` storage bucket → get 1-yr signed URLs → insert `stock_adjustments` row → `audit()` → toast success

---

## Modal B — Inventory Check Dialog (`WhInventoryCheckDialog`)

`max-w-3xl max-h-[90vh] flex flex-col`. Title: `<ClipboardCheck>` + "Inventory Check"

**Top row:** Warehouse Select (w-[200px]) + Search input (shown after warehouse selected) + counter badges:
- `"{counted}/{total} counted"` (outline)
- `"{varianceCount} variances"` (warning, if > 0)

**Items table** in `<ScrollArea>` — auto-loads ALL stock for selected warehouse from `fifo_cost_layers`:
Cols: Item | Brand | SKU | System Qty | Counted (`<Input w-20 h-7>`) | Variance | Status
- Row tints: success (zero variance), warning (non-zero), muted/30 (not yet counted)

**Notes textarea** below table.

**Footer:** Cancel | **Submit for Approval**

**Dialog fetch gating:** Stock data query uses `enabled: !!selectedWarehouseId && open`.

**Flow:** Generate `IC-YYYY-####` → insert `inventory_checks` + `inventory_check_items` rows → `audit()` → toast

---

## Modal C — Transfer Dialog (`WhTransferDialog`)

`max-w-lg`. Title: `<ArrowRightLeft>` + "Create Stock Transfer"

1. 2-col grid: From Warehouse Select + To Warehouse Select (To filters out From value)
2. Approval banner (shown when both selected): `bg-primary/5 border border-primary/20 rounded-md p-3` with `<Bell h-3>` "Notification will be sent to {managerName} for approval"
3. Items rows (`grid grid-cols-[1fr_80px_60px_80px] gap-2`): Item name | SKU (auto-filled) | Qty | Unit Select (Piece / kg / Liter / m² / Roll / Box)
4. Ghost "+ Add Item" button
5. Notes textarea
6. Footer: Cancel | **Create Transfer**

**Dialog fetch gating:** Manager name lookup uses `enabled: !!toWarehouseId && open`.

**Flow:** Generate `WT-YYYY-###` → insert `warehouse_transfers` row with `status: 'pending_approval'` → `audit()` → toast "Awaiting approval from {managerName}"

---

## Modal D — Receival Detail Dialog (`WhReceivalDetailDialog`)

`max-w-md`. Read-only. Opened via `selectedReceival` state.

- **Header:** doc# + direction badge (Inbound/Outbound)
- **2-col info grid:** Reference | Warehouse | Date | Counterparty
- **Inbound items table:** Item | SKU | Qty
- **Outbound items table:** Line Item (first 8 chars of line item ID as display label) | Qty
- **Footer:** Close button only

---

## Data Layer — New Hook

**`useReceivalsAndDeliveries()`** in `src/hooks/useWarehouseOperations.ts`:

```typescript
// Fetches receivals + sale_deliveries in parallel, merges to unified type
type ReceivalDelivery = {
  id: string
  direction: 'inbound' | 'outbound'
  docNumber: string
  reference: string
  warehouseId: string
  warehouseName: string
  counterparty: string        // supplier name (inbound) | customer name (outbound)
  date: string
  items: { name: string; sku: string; qty: number }[]
  itemCount: number
  status: string
}

// Implementation: Promise.all([supabase.from('receivals')..., supabase.from('sale_deliveries')...])
// NOTE: verify exact sales deliveries table name at implementation time (may be 'deliveries' or 'sale_deliveries')
// Map each to ReceivalDelivery, concat, sort by date desc
// pendingReceivalCount = inbound items where status === 'pending_approval'
```

---

## Component Library

| Element | shadcn Component |
|---------|-----------------|
| Cards | `Card, CardHeader, CardTitle, CardContent` |
| Tabs | `Tabs, TabsList, TabsTrigger, TabsContent` |
| Tables | `Table, TableHeader, TableBody, TableRow, TableHead, TableCell` |
| Selects | `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` |
| Dialogs | `Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription` |
| Forms | `Input, Textarea, Label` |
| Display | `Badge, ScrollArea, Accordion, AccordionItem, AccordionTrigger, AccordionContent` |
| Buttons | `Button` (default / outline / ghost) |

**Icons (lucide-react):** WarehouseIcon, Package, MapPin, User, DollarSign, ArrowRightLeft, ArrowRight, CheckCircle2, XCircle, Bell, Truck, Plus, Layers, Activity, ClipboardList, ClipboardCheck, Search, Eye, Camera, X, Clock, AlertTriangle, Minus

---

## Out of Scope

- No DB migrations (all tables + edge functions already exist)
- `WhReceivalsTab.tsx` (old purchase-only tab) — deleted, replaced by `ReceivalsDeliveriesTab.tsx`
- No changes to admin warehouse management at `/master-data/admin/warehouses`
