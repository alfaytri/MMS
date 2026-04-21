# Services Hub — Shell, Tree Tabs & Edit Dialog
**Design Spec** · 2026-04-21

---

## Overview

Build the `/master-data/services` page — the first of three sub-plans for the Services Hub within Phase 1. This plan covers the full-height page shell, the three tree-based tabs (Normal, Contract, Mobile), the shared `ServiceTree` recursive renderer, the `ServiceEditDialog` with all feature flags, and the dashboard layout change that enables full-bleed hub pages.

**Sub-plan sequence:**
1. **Shell, Tree Tabs & Edit Dialog** ← this spec
2. Notifications & Instructions (next)
3. Inventory & Promotions (last)

---

## Tech Stack (same as all Phase 1)

Next.js 15 App Router · TypeScript · Supabase (browser client) · TanStack Query v5 · shadcn/ui · Tailwind CSS · Zod · react-hook-form · Lucide icons · Sonner toasts

---

## Database Migration

**File:** `supabase/migrations/20260421000000_services_feature_flags.sql`

```sql
ALTER TABLE services
  ADD COLUMN has_qc    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN has_parts BOOLEAN NOT NULL DEFAULT false;
```

Existing columns already cover the other feature flags:
- `instructions` (boolean) → Instructions toggle
- `reminder_days` (int, non-null = enabled) → Reminders toggle
- `inventory_items` (JSONB, non-empty = enabled) → Inventory toggle

---

## Dashboard Layout Change

**File:** `src/app/(dashboard)/layout.tsx`

Change `<main className="flex-1 p-6">` → `<main className="flex-1 overflow-hidden flex flex-col">`.

All existing pages that previously relied on this padding must add their own root wrapper:
```tsx
<div className="p-6 space-y-6">
  {/* existing page content */}
</div>
```

**Affected pages (~15 files):**
- `src/app/(dashboard)/page.tsx` (dashboard)
- `src/app/(dashboard)/master-data/inventory/page.tsx`
- `src/app/(dashboard)/master-data/suppliers/page.tsx`
- `src/app/(dashboard)/master-data/users/page.tsx`
- `src/app/(dashboard)/master-data/audit-trail/page.tsx`
- `src/app/(dashboard)/master-data/import/page.tsx`
- `src/app/(dashboard)/master-data/companies/page.tsx`
- `src/app/(dashboard)/master-data/admin/page.tsx` + sub-pages
- All `src/app/(dashboard)/purchase/*/page.tsx` (~7 pages)
- All `src/app/(dashboard)/sales/*/page.tsx` (~7 pages)

---

## Data Layer — `src/hooks/useServices.ts`

### Types

```ts
export type Service = DBTable<'services'>
export type ServiceInsert = DBInsert<'services'>
export type ServiceUpdate = DBUpdate<'services'>
```

### `useServiceTree(treeType: string, divisionIds: string[], enabled = true)`

- Fetches all rows from `services` where `tree_type = treeType`
- If `divisionIds.length > 0`, adds `.in('division', divisionIds)` filter
- Orders by `sort_order ASC`
- `staleTime: 5 * 60 * 1000`
- Query key: `['services', treeType, divisionIds]`
- Returns flat `Service[]` — tree assembly done in component

### `useCreateService()`

Mutation:
1. Insert row into `services`
2. Write to `activity_log`: `action: 'services/service-created'`, `module: 'services'`, `entity_type: 'service'`, `entity_id: newId`, `details: { name_en, tree_type, parent_id }`
3. On success: `invalidateQueries(['services', treeType])`

### `useUpdateService()`

Mutation:
1. Update row by `id`
2. Write to `activity_log`: `action: 'services/service-updated'`, `module: 'services'`, `entity_type: 'service'`, `entity_id: id`, `details: { changed_fields: string[] }`
3. On success: `invalidateQueries(['services', treeType])`

### `useInstructions(enabled = true)`

Fetches all rows from `instructions` table ordered by `name_en`. Used by `ServiceEditDialog` Instructions sub-field to populate the multi-select. Query key: `['instructions']`. `staleTime: 10 * 60 * 1000`.

### `useReorderServices()`

Mutation accepts `{ movedId, movedSortOrder, siblingId, siblingNewSortOrder, direction, treeType }`:
1. `Promise.all([update movedId sort_order, update siblingId sort_order])`
2. Write to `activity_log`:
```json
{
  "action": "services/service-reordered",
  "module": "services",
  "entity_type": "service",
  "entity_id": "<movedId>",
  "details": {
    "direction": "up" | "down",
    "from_sort_order": <number>,
    "to_sort_order": <number>,
    "swapped_with_id": "<siblingId>"
  }
}
```
3. On success: `invalidateQueries(['services', treeType])`

---

## Shared Component — `src/components/shared/DivisionMultiSelect.tsx`

**Props:** `value: string[]`, `onChange: (ids: string[]) => void`, `className?: string`

**Behavior:**
- Uses `useDivisions()` internally
- Renders a `<Popover>` trigger button: `h-7 w-[200px] text-[11px]`
  - Label: "All Divisions" when empty, "N divisions" when some selected
- Popover content: scrollable checklist of division names, each with a checkbox
- Fully reusable — no services-specific logic inside

---

## Page Shell — `src/app/(dashboard)/master-data/services/page.tsx`

### Page State

```ts
const [activeTab, setActiveTab] = useState('normal')
const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['normal']))
const [divisionFilter, setDivisionFilter] = useState<string[]>([])
const [featureFilters, setFeatureFilters] = useState<Set<string>>(new Set())
const [contractTypeFilter, setContractTypeFilter] = useState<string>('all')
const [editDialog, setEditDialog] = useState<{
  open: boolean
  mode: 'new' | 'edit'
  type: 'normal' | 'contract' | 'mobile'
  node: Service | null
  parentId: string | null
}>({ open: false, mode: 'new', type: 'normal', node: null, parentId: null })
```

**Tab switch behaviour:** `setActiveTab(tab)` + `setDivisionFilter([])` + `setFeatureFilters(new Set())` + `setContractTypeFilter('all')` + add tab to `visitedTabs`.

### Root Container

```tsx
<div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
  <TabBar />
  <FilterBar />   {/* conditional */}
  <TabContent />
</div>
```

### Tab Bar

```
Wrapper: px-4 pt-2 border-b border-border bg-card
TabsList: h-9 w-full justify-start bg-transparent p-0 gap-0 overflow-x-auto flex-nowrap
```

Each `<TabsTrigger>`: `px-3 py-2 text-xs gap-1.5 border-b-2 border-transparent` → active: `border-primary`. No background/shadow.

| # | Icon | Label | tab key |
|---|---|---|---|
| 1 | `<ListTree>` | Normal Services | `normal` |
| 2 | `<FileText>` | Contract Services | `contract` |
| 3 | `<Smartphone>` | Mobile App Services | `mobile` |
| 4 | `<Bell>` | Notifications | `reminders` |
| 5 | `<FileText>` | Instructions | `instructions` |
| 6 | `<Package>` | Inventory | `inventory` |
| 7 | `<Tag>` | Promotions | `promotions` |

Icons: `h-3.5 w-3.5` to the left of the label.

### Filter Bar

**Hidden** when `activeTab` is `reminders`, `instructions`, or `inventory`.
**Shown** when `activeTab` is `normal`, `contract`, `mobile`, or `promotions`.

```
Wrapper: flex items-center gap-2 px-4 py-2 border-b border-border bg-card overflow-x-auto flex-nowrap
```

**Left label:** `<Filter h-3.5 w-3.5> Filter by:` — `text-xs text-muted-foreground`

**Middle cluster** — varies by tab:

*Normal + Mobile tabs:* 5 toggle `<Button variant={active?"default":"outline"} size="sm" className="h-7 text-[11px] gap-1">`:

| key | Icon | Label |
|---|---|---|
| `inventory` | `<Package h-3 w-3>` | Inventory |
| `reminders` | `<Bell h-3 w-3>` | Reminders |
| `instructions` | `<FileText h-3 w-3>` | Instr |
| `qc` | `<ClipboardCheck h-3 w-3>` | QC |
| `parts` | `<Wrench h-3 w-3>` | Parts |

Active filter chips row (rendered after buttons when any toggle is on):
```tsx
<Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer">
  ✓ {label} ✕
</Badge>
```
Clicking chip toggles filter off.

*Contract tab:* 3 mutually-exclusive type buttons (same Button style). Clicking active button resets to `'all'`.

| key | Icon | Label |
|---|---|---|
| `preventive` | `<FileText h-3 w-3>` | Preventive |
| `area` | `<Ruler h-3 w-3>` | Area-Based |
| `general` | `<Percent h-3 w-3>` | General |

*Promotions tab:* no middle buttons.

**Right cluster** (`ml-auto flex items-center gap-2`):
- `<DivisionMultiSelect>` — hidden on promotions tab
- New button (tree tabs only): `<Button size="sm" className="h-7 text-[11px] gap-1"><Plus h-3.5>` + label:
  - "New Service" (normal)
  - "New Contract Service" (contract)
  - "New Mobile Service" (mobile)

### Tab Content

```
Wrapper: flex-1 overflow-auto scrollbar-thin bg-card
```

**Loading state:**
```tsx
<div className="flex h-32 items-center justify-center">
  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
</div>
```

**Error state:**
```tsx
<div className="flex h-32 items-center justify-center px-4 text-sm text-destructive">
  Failed to load this section: {error.message}
</div>
```

**Tab 1 — Normal Services:**
```tsx
<ServiceTableView
  serviceType="normal"
  divisionFilter={divisionFilter}
  featureFilters={featureFilters}
  enabled={visitedTabs.has('normal')}
  onEdit={(node) => setEditDialog({ open: true, mode: 'edit', type: 'normal', node, parentId: null })}
  onAddChild={(parentId) => setEditDialog({ open: true, mode: 'new', type: 'normal', node: null, parentId })}
/>
```

**Tab 2 — Contract Services:**
```tsx
<ContractTableView
  typeFilter={contractTypeFilter}
  divisionFilter={divisionFilter}
  enabled={visitedTabs.has('contract')}
  onEdit={...}
  onAddChild={...}
/>
```

**Tab 3 — Mobile App Services:**
```tsx
<ServiceTableView
  serviceType="mobile"
  divisionFilter={divisionFilter}
  featureFilters={featureFilters}
  enabled={visitedTabs.has('mobile')}
  onEdit={...}
  onAddChild={...}
/>
```

**Tabs 4–7** (Notifications, Instructions, Inventory, Promotions): render placeholder `<div className="p-8 text-sm text-muted-foreground text-center">Coming in next plan</div>` — these are wired in the subsequent sub-plans.

---

## ServiceTree Component — `src/components/services/ServiceTree.tsx`

### Props

```ts
interface ServiceTreeProps {
  data: Service[]
  isLoading: boolean
  error: Error | null
  featureFilters: Set<string>       // which feature columns to show
  divisionFilter: string[]          // for recursive pruning
  onEdit: (node: Service) => void
  onAddChild: (parentId: string) => void
  onReorder: (args: ReorderArgs) => void
  extraColumns?: ExtraColumn[]      // ContractTableView passes area price column
}
```

### Tree Assembly

```ts
function buildTree(flat: Service[]): Map<string | null, Service[]> {
  const map = new Map<string | null, Service[]>()
  for (const s of flat) {
    const key = s.parent_id ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return map
}
```

Division filter applied as recursive pruning: a parent node is included if it or any descendant matches the filter.

### Row Anatomy

Rendered recursively starting from `map.get(null)`:

```
[indent][chevron or spacer][name_en] [name_ar muted]   [feature badges]   [hover actions]
```

- **Indent:** `style={{ paddingLeft: depth * 20 }}` on the row
- **Chevron:** `<ChevronRight h-3.5>` rotates 90° when expanded; replaced by `<span className="w-3.5">` spacer for leaf nodes
- **Expand state:** local `Set<string>` of expanded node IDs — nodes with children start collapsed
- **name_en:** `text-xs font-medium`
- **name_ar:** `text-[11px] text-muted-foreground ml-1.5`
- **Feature badges** (shown only when corresponding `featureFilter` is active):
  - Inventory: `<Package h-3>` badge if `(service.inventory_items as any[])?.length > 0`
  - Reminders: `<Bell h-3>` badge if `service.reminder_days != null`
  - Instructions: `<FileText h-3>` badge if `service.instructions === true`
  - QC: `<ClipboardCheck h-3>` badge if `service.has_qc === true`
  - Parts: `<Wrench h-3>` badge if `service.has_parts === true`
- **Hover actions** (`opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-auto`):
  - ↑ button — hidden if first sibling
  - ↓ button — hidden if last sibling
  - `+` button — calls `onAddChild(service.id)`
  - pencil button — calls `onEdit(service)`

### Empty State

```tsx
<div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
  No services found
</div>
```

---

## ServiceTableView — `src/components/services/ServiceTableView.tsx`

Thin wrapper:
1. Calls `useServiceTree(serviceType, divisionFilter, enabled)`
2. Calls `useReorderServices()` mutation
3. Passes all data + handlers into `<ServiceTree>`

---

## ContractTableView — `src/components/services/ContractTableView.tsx`

Same as `ServiceTableView` but:
1. Calls `useServiceTree('contract', divisionFilter, enabled)`
2. Client-side filters by `contract_type` when `typeFilter !== 'all'`
3. Passes an `extraColumns` prop to `ServiceTree` when `typeFilter === 'area'`: price-per-area column showing `service.price` + `service.price_unit`

---

## ServiceEditDialog — `src/components/services/ServiceEditDialog.tsx`

### Props

```ts
interface ServiceEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'new' | 'edit'
  type: 'normal' | 'contract' | 'mobile'
  node: Service | null
  parentId: string | null
}
```

### Form Structure (react-hook-form + Zod)

**Section: Core** (always shown)
| Field | Input | Notes |
|---|---|---|
| Name (EN) | `<Input>` | required |
| Name (AR) | `<Input>` | optional, RTL |
| Code | `<Input>` | optional |
| Status | `<Switch>` | active / inactive |
| Division | `<Select>` from `useDivisions()` | required |
| Parent Service | Indented combobox (Popover + Command) | pre-order traversal of same tree_type, shows `name_en` with depth indent + `name_ar` muted; pre-filled from `parentId` prop |

**Section: Pricing** (normal + mobile + contract)
| Field | Input | Condition |
|---|---|---|
| Price | `<Input type="number">` | all types |
| Emergency Price | `<Input type="number">` | normal + mobile only |
| Discount % | `<Input type="number">` | contract only |
| Price Unit | `<Input>` | contract + `area` type only |

**Section: Contract** (contract only)
| Field | Input |
|---|---|
| Contract Type | 3-button toggle: preventive / area-based / general |

**Section: Features** (normal + mobile only)

5 toggle rows, each `flex items-center justify-between`:
```
[Icon] [Label]    [Switch]
```
When switch is ON, an inline sub-field expands below it:

| Toggle | Sub-field when ON |
|---|---|
| Inventory | `inventory_items` JSONB editor — add/remove rows of `{ name: string, qty: number }` |
| Reminders | `reminder_days` number input ("Remind every N days") |
| Instructions | Multi-select combobox of existing `instructions` records (fetched from `instructions` table) |
| QC | No sub-field — just sets `has_qc = true` |
| Parts | No sub-field — just sets `has_parts = true` |

**Section: Invoice Text** (normal + contract + mobile)
| Field | Input |
|---|---|
| Invoice Text EN | `<Textarea>` |
| Invoice Text AR | `<Textarea>` RTL |

### `buildServicePayload()`

Shapes form values into a `ServiceInsert` / `ServiceUpdate`:
- Sets `tree_type` from the dialog's `type` prop
- Converts `inventory_items` toggle OFF → `null` on the JSONB field
- Converts Reminders toggle OFF → `reminder_days: null`
- Converts Instructions toggle OFF → `instructions: false`
- Sets `has_qc`, `has_parts` booleans
- Sets `parent_id` from the parent combobox (or `parentId` prop for add-child)
- `sort_order` defaults to `siblings.length` (end of list) on create

### On Save
1. `buildServicePayload()` → `useCreateService()` or `useUpdateService()`
2. Toast: "Service saved" (success) / "Failed to save service" (error)
3. `onOpenChange(false)`

---

## Navigation Wire-up

`src/components/layout/nav-config.ts` (or equivalent nav file):
Replace the `Service List (Coming Soon)` stub with:
```ts
{ label: 'Services', href: '/master-data/services' }
```

---

## Responsive Behaviour

Per AGENTS.md mandatory responsive rules:
- Tab bar: `overflow-x-auto flex-nowrap` — tabs scroll horizontally on mobile
- Filter bar: `overflow-x-auto flex-nowrap` — filter buttons scroll horizontally on mobile
- Tree rows: on `< md`, feature badge columns are hidden (only name + hover actions remain)
- ServiceEditDialog: full-screen on mobile (`w-full h-full rounded-none`), centered card on `md:+`
- Touch targets: row action buttons `min-h-[44px]` on mobile

---

## File Map

```
supabase/migrations/
  20260421000000_services_feature_flags.sql        NEW

src/hooks/
  useServices.ts                                   NEW

src/components/shared/
  DivisionMultiSelect.tsx                          NEW

src/components/services/                           NEW FOLDER
  ServiceTree.tsx
  ServiceTableView.tsx
  ContractTableView.tsx
  ServiceEditDialog.tsx

src/app/(dashboard)/
  layout.tsx                                       EDIT — remove p-6
  master-data/services/page.tsx                    NEW

src/app/(dashboard)/master-data/
  inventory/page.tsx                               EDIT — +p-6 wrapper
  suppliers/page.tsx                               EDIT — +p-6 wrapper
  users/page.tsx                                   EDIT — +p-6 wrapper
  audit-trail/page.tsx                             EDIT — +p-6 wrapper
  import/page.tsx                                  EDIT — +p-6 wrapper
  admin/page.tsx + sub-pages                       EDIT — +p-6 wrapper
  admin/companies/page.tsx                         EDIT — +p-6 wrapper
  admin/warehouses/page.tsx                        EDIT — +p-6 wrapper
  admin/brand-groups/page.tsx                      EDIT — +p-6 wrapper
  admin/reason-lists/page.tsx                      EDIT — +p-6 wrapper

src/app/(dashboard)/purchase/*/page.tsx            EDIT — +p-6 wrapper (~7 files)
src/app/(dashboard)/sales/*/page.tsx               EDIT — +p-6 wrapper (~7 files)
src/app/(dashboard)/page.tsx                       EDIT — +p-6 wrapper

src/components/layout/nav-config.ts               EDIT — wire Services nav entry
```

---

## Out of Scope (next sub-plans)

- Notifications tab inner content (FixedNotificationsSection, ServiceRemindersSection)
- Instructions tab inner content (InstructionsTableView, InstructionLinksView)
- Inventory tab inner content (InventoryTableView)
- Promotions tab inner content (PromotionsView)
