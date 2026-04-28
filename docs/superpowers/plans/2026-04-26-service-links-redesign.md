# Service Links Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current item-centric Service Links view with a service-centric matrix showing which inventory items each service consumes, sells, or installs — with 3 link types, inline editing, breadcrumb paths, and operational health counters (linked / unlinked services).

**Architecture:** The existing `ServiceLinksView.tsx` is item-centric (browse items → variants → manage services). The new view is **service-centric**: list every leaf service, show what's linked to it, allow adding/editing/deleting links inline. A new DB migration adds `link_type`, `warranty_months`, `group_label`, and a `quantity` column (keeping `qty_per_service` temporarily populated) to `service_inventory`. A new helpers file owns all shared config and pure functions; new hooks in `useInventory.ts` drive the queries.

**Tech Stack:** Next.js, TypeScript, Supabase (Postgres), @tanstack/react-query v5, shadcn/ui, Tailwind CSS, Lucide icons

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `supabase/migrations/20260426000002_service_inventory_link_type.sql` | Add `quantity`, `link_type`, `warranty_months`, `group_label`; populate `quantity` from `qty_per_service`; drop `qty_per_service` |
| **Create** | `src/components/services/inventory/serviceInventoryHelpers.ts` | `LINK_TYPE_CONFIG`, `WARRANTY_OPTIONS`, `collectLeaves()`, `buildBreadcrumb()`, shared TypeScript types |
| **Modify** | `src/hooks/useInventory.ts` | Update old hooks to use `quantity`; add `useServicesForLinks`, `useAllServiceLinks`, optimistic `useUpdateServiceInventoryLink`, add/delete hooks |
| **Replace** | `src/components/services/inventory/ServiceLinksView.tsx` | Full service-centric rebuild: counters, toolbar with URL-synced filters, collapsible a11y rows, inline editing, AlertDialog delete, New Link dialog |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260426000002_service_inventory_link_type.sql`

> **Design note:** Rather than renaming `qty_per_service` directly (which would break any in-flight requests during deploy), we add a `quantity` column, populate it, then drop the old column. The old hooks in `useInventory.ts` are updated in Task 2 before the migration runs in staging/prod.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260426000002_service_inventory_link_type.sql

BEGIN;

-- Step A: Add the new quantity column (populated from existing data)
ALTER TABLE service_inventory
  ADD COLUMN IF NOT EXISTS quantity NUMERIC NOT NULL DEFAULT 1;

-- Step B: Sync existing data
UPDATE service_inventory SET quantity = qty_per_service;

-- Step C: Drop the old column
ALTER TABLE service_inventory
  DROP COLUMN IF EXISTS qty_per_service;

-- Step D: Add link behaviour columns
ALTER TABLE service_inventory
  ADD COLUMN IF NOT EXISTS link_type TEXT NOT NULL DEFAULT 'consumable'
    CHECK (link_type IN ('consumable', 'select_one', 'install_all')),
  ADD COLUMN IF NOT EXISTS warranty_months INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS group_label TEXT;

-- Step E: Index for type-filtering queries
CREATE INDEX IF NOT EXISTS idx_service_inv_link_type
  ON service_inventory(link_type);

COMMIT;
```

- [ ] **Step 2: Apply the migration locally**

```bash
npx supabase db push
```

Expected: migration applies without errors. Verify with:

```bash
npx supabase db dump --schema public | grep -A 20 "service_inventory"
```

Expected output contains `quantity`, `link_type`, `warranty_months`, `group_label` — no `qty_per_service`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260426000002_service_inventory_link_type.sql
git commit -m "feat(db): add link_type, warranty_months, group_label, quantity to service_inventory; drop qty_per_service"
```

---

## Task 2: Helpers File

**Files:**
- Create: `src/components/services/inventory/serviceInventoryHelpers.ts`

- [ ] **Step 1: Create the helpers file**

```typescript
// src/components/services/inventory/serviceInventoryHelpers.ts

export const LINK_TYPE_CONFIG = {
  consumable: {
    label: 'Consumable',
    letter: 'C',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  select_one: {
    label: 'Select One',
    letter: 'S',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  install_all: {
    label: 'Install All',
    letter: 'I',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
  },
} as const

export type LinkType = keyof typeof LINK_TYPE_CONFIG

export const WARRANTY_OPTIONS = [0, 3, 6, 12, 24, 36, 48, 60]

export interface ServiceNode {
  id: string
  name_en: string
  parent_id: string | null
  tree_type: string | null
}

export interface ServiceInventoryLinkFull {
  id: string
  service_id: string
  brand_variant_id: string
  link_type: LinkType
  warranty_months: number
  quantity: number
  group_label: string | null
  inventory_brand_variants: {
    brand: string
    selling_price: number | null
    inventory_items: {
      name_en: string
      sku: string
      unit: string
    }
  } | null  // null when variant was deleted (FK violation prevented, but defensive)
}

/** Returns only leaf services (services that are not the parent of any other service). */
export function collectLeaves(services: ServiceNode[]): ServiceNode[] {
  const parentIds = new Set(services.map((s) => s.parent_id).filter(Boolean) as string[])
  return services.filter((s) => !parentIds.has(s.id))
}

/**
 * Pre-computes a serviceId → breadcrumb string map for all services.
 * Call once when the services array loads; pass the resulting map to getBreadcrumb.
 * Avoids recreating the lookup Map O(n) per service on every filter/render.
 */
export function buildBreadcrumbMap(services: ServiceNode[]): Map<string, string> {
  const nodeMap = new Map(services.map((s) => [s.id, s]))
  const cache = new Map<string, string>()

  function resolve(id: string): string {
    if (cache.has(id)) return cache.get(id)!
    const node = nodeMap.get(id)
    if (!node) return ''
    const parentBreadcrumb = node.parent_id ? resolve(node.parent_id) : ''
    const result = parentBreadcrumb ? `${parentBreadcrumb} › ${node.name_en}` : node.name_en
    cache.set(id, result)
    return result
  }

  for (const s of services) resolve(s.id)
  return cache
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/services/inventory/serviceInventoryHelpers.ts
git commit -m "feat(service-links): add helpers — LINK_TYPE_CONFIG, WARRANTY_OPTIONS, collectLeaves, buildBreadcrumbMap"
```

---

## Task 3: Update Old Hooks and Add New Hooks

**Files:**
- Modify: `src/hooks/useInventory.ts`

### Step 1: Update old hooks that reference `qty_per_service`

- [ ] Find and update the `ServiceInventoryLink` type (around line 256). Change:

```typescript
// BEFORE
export type ServiceInventoryLink = {
  id: string
  service_id: string
  brand_variant_id: string
  qty_per_service: number
  notes: string | null
}
```

To:

```typescript
// AFTER
export type ServiceInventoryLink = {
  id: string
  service_id: string
  brand_variant_id: string
  quantity: number
  notes: string | null
}
```

- [ ] Find and update the `useServiceInventoryLinks` query select (around line 557). Change:

```typescript
// BEFORE
.select('id, service_id, brand_variant_id, qty_per_service, notes')
```

To:

```typescript
// AFTER
.select('id, service_id, brand_variant_id, quantity, notes')
```

- [ ] Find and update the insert in `useUpdateServiceInventoryLinks` (around line 593). Change:

```typescript
// BEFORE
const rows = toAdd.map((sid) => ({ service_id: sid, brand_variant_id: brandVariantId, qty_per_service: 1 }))
```

To:

```typescript
// AFTER
const rows = toAdd.map((sid) => ({ service_id: sid, brand_variant_id: brandVariantId, quantity: 1 }))
```

### Step 2: Add the import for helper types

- [ ] Add to the existing import block at the top of `useInventory.ts`:

```typescript
import type { ServiceNode, ServiceInventoryLinkFull, LinkType } from '@/components/services/inventory/serviceInventoryHelpers'
```

### Step 3: Add five new service-centric hooks

- [ ] Append the following block after the existing `useAllServices` hook (after the `// ─── Service inventory links ───` section):

```typescript
// ─── Service-centric service inventory hooks ──────────────────────────────────

/** All services — used to build leaves list and breadcrumbs. */
export function useServicesForLinks() {
  return useQuery({
    queryKey: ['services-for-links'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('services')
        .select('id, name_en, parent_id, tree_type')
        .order('name_en')
      if (error) throw error
      return (data ?? []) as ServiceNode[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * All service_inventory rows with joined variant + item details.
 * Uses LEFT JOIN (no !inner) so links with a missing/archived variant
 * appear with a null inventory_brand_variants field rather than silently
 * disappearing from the view and making the counters lie.
 */
export function useAllServiceLinks() {
  return useQuery({
    queryKey: ['service-links-all'],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('service_inventory')
        .select(`
          id,
          service_id,
          brand_variant_id,
          link_type,
          warranty_months,
          quantity,
          group_label,
          inventory_brand_variants(
            brand,
            selling_price,
            inventory_items(name_en, sku, unit)
          )
        `)
      if (error) throw error
      return (data ?? []) as ServiceInventoryLinkFull[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

/** Insert a single new service↔variant link. */
export function useAddServiceInventoryLink() {
  const qc = useQueryClient()
  return useMutation<void, Error, {
    service_id: string
    brand_variant_id: string
    link_type: LinkType
    quantity: number
    warranty_months: number
    group_label?: string | null
  }>({
    mutationFn: async (row) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('service_inventory')
        .insert(row)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-links-all'] })
    },
  })
}

/** Delete a service↔variant link by its primary key id. */
export function useDeleteServiceInventoryLink() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('service_inventory')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-links-all'] })
    },
  })
}

/**
 * Patch link_type, warranty_months, or quantity on an existing link.
 * Uses optimistic updates to avoid table flicker on inline edits — the
 * cache is updated immediately; rolled back if the server rejects.
 */
export function useUpdateServiceInventoryLink() {
  const qc = useQueryClient()
  return useMutation<
    void,
    Error,
    { id: string; link_type?: LinkType; warranty_months?: number; quantity?: number; group_label?: string | null },
    { prev: ServiceInventoryLinkFull[] | undefined }
  >({
    mutationFn: async ({ id, ...patch }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('service_inventory')
        .update(patch)
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: ['service-links-all'] })
      const prev = qc.getQueryData<ServiceInventoryLinkFull[]>(['service-links-all'])
      qc.setQueryData<ServiceInventoryLinkFull[]>(['service-links-all'], (old) =>
        old?.map((l) => l.id === variables.id ? { ...l, ...variables } : l) ?? []
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['service-links-all'], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['service-links-all'] })
    },
  })
}
```

### Step 4: Add `useInventoryBrandVariants` export alias if missing

- [ ] Run:

```bash
grep -n "export function use.*[Bb]rand[Vv]ariant" src/hooks/useInventory.ts
```

If the function is named `useBrandVariants` (not `useInventoryBrandVariants`), append this alias:

```typescript
/** Alias used by ServiceLinksView for brand variants under an item. */
export const useInventoryBrandVariants = useBrandVariants
```

If it is already named `useInventoryBrandVariants`, skip this step.

### Step 5: Verify TypeScript compiles

- [ ] Run:

```bash
npx tsc --noEmit
```

Expected: no errors. Specifically, no references to `qty_per_service` should remain.

- [ ] Confirm no stale references:

```bash
grep -rn "qty_per_service" src/
```

Expected: no output.

### Step 6: Commit

- [ ] Commit:

```bash
git add src/hooks/useInventory.ts
git commit -m "feat(service-links): update old hooks to use quantity; add service-centric hooks with optimistic updates"
```

---

## Task 4: Rebuild ServiceLinksView.tsx

**Files:**
- Replace: `src/components/services/inventory/ServiceLinksView.tsx`

Sub-components defined in this file in order:
1. `NewLinkDialog` — create a new service↔variant link
2. `DeleteLinkButton` — delete with AlertDialog confirmation
3. `ServiceLinkSubRow` — one linked-item row inside an expanded service
4. `ServiceRow` — one collapsible service row in the main table (a11y)
5. `ServiceLinksView` (export) — counters, URL-synced toolbar, table

### Step 1: Scaffold imports and types

- [ ] Replace the entire file with:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, ChevronDown, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  useServicesForLinks,
  useAllServiceLinks,
  useAddServiceInventoryLink,
  useDeleteServiceInventoryLink,
  useUpdateServiceInventoryLink,
  useInventoryItemsAll,
  useInventoryBrandVariants,
} from '@/hooks/useInventory'
import {
  LINK_TYPE_CONFIG,
  WARRANTY_OPTIONS,
  collectLeaves,
  buildBreadcrumbMap,
  type LinkType,
  type ServiceInventoryLinkFull,
  type ServiceNode,
} from './serviceInventoryHelpers'

type TreeTypeFilter = 'all' | 'normal' | 'contract' | 'mobile'
type StatusFilter = 'all' | 'linked' | 'unlinked'
```

### Step 2: Add NewLinkDialog

- [ ] Append to the same file:

```typescript
// ─── NewLinkDialog ────────────────────────────────────────────────────────────

function NewLinkDialog({
  services,
  breadcrumbs,
  preselectedServiceId,
  onClose,
}: {
  services: ServiceNode[]
  breadcrumbs: Map<string, string>
  preselectedServiceId?: string
  onClose: () => void
}) {
  const [step, setStep] = useState<'service' | 'variant'>(
    preselectedServiceId ? 'variant' : 'service',
  )
  const [serviceId, setServiceId] = useState(preselectedServiceId ?? '')
  const [itemId, setItemId] = useState<string | null>(null)
  const [variantId, setVariantId] = useState('')
  const [linkType, setLinkType] = useState<LinkType>('consumable')
  const [warrantyMonths, setWarrantyMonths] = useState(0)
  const [quantity, setQuantity] = useState(1)

  const { data: items = [] } = useInventoryItemsAll(step === 'variant')
  const { data: variants = [] } = useInventoryBrandVariants(itemId)
  const addLink = useAddServiceInventoryLink()

  const selectedService = services.find((s) => s.id === serviceId)

  function handleSave() {
    if (!serviceId || !variantId) return
    addLink.mutate(
      { service_id: serviceId, brand_variant_id: variantId, link_type: linkType, quantity, warranty_months: warrantyMonths },
      {
        onSuccess: () => { toast.success('Link created'); onClose() },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>New Service Link</DialogTitle>
        </DialogHeader>

        {step === 'service' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Pick a service to link an item to.</p>
            <Command className="rounded-md border border-border">
              <CommandInput placeholder="Search services…" className="text-xs" />
              <CommandList className="max-h-64">
                <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">
                  No services found
                </CommandEmpty>
                <CommandGroup>
                  {services.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={s.name_en}
                      onSelect={() => { setServiceId(s.id); setStep('variant') }}
                      className="text-xs cursor-pointer flex flex-col items-start gap-0.5"
                    >
                      <span>{s.name_en}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {breadcrumbs.get(s.id) ?? ''}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        )}

        {step === 'variant' && (
          <div className="space-y-4">
            {selectedService && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Service:</span>
                <span className="font-medium">{selectedService.name_en}</span>
                {!preselectedServiceId && (
                  <button
                    onClick={() => setStep('service')}
                    className="text-blue-600 underline underline-offset-2"
                  >
                    change
                  </button>
                )}
              </div>
            )}

            <div>
              <p className="text-xs font-medium mb-1.5">Item</p>
              <Select value={itemId ?? ''} onValueChange={(v) => { setItemId(v); setVariantId('') }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select item…" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item: { id: string; name_en: string; sku: string }) => (
                    <SelectItem key={item.id} value={item.id} className="text-xs">
                      {item.name_en} · {item.sku}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {itemId && (
              <div>
                <p className="text-xs font-medium mb-1.5">Brand variant</p>
                <Select value={variantId} onValueChange={setVariantId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select variant…" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((v: { id: string; brand: string }) => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">
                        {v.brand}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <p className="text-xs font-medium mb-1.5">Link type</p>
              <Select value={linkType} onValueChange={(v) => setLinkType(v as LinkType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LINK_TYPE_CONFIG) as LinkType[]).map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {LINK_TYPE_CONFIG[k].letter} — {LINK_TYPE_CONFIG[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium mb-1.5">Quantity</p>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <p className="text-xs font-medium mb-1.5">Warranty months</p>
                <Select
                  value={String(warrantyMonths)}
                  onValueChange={(v) => setWarrantyMonths(Number(v))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WARRANTY_OPTIONS.map((m) => (
                      <SelectItem key={m} value={String(m)} className="text-xs">
                        {m === 0 ? 'No warranty' : `${m} months`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {step === 'variant' && (
            <Button onClick={handleSave} disabled={!serviceId || !variantId || addLink.isPending}>
              {addLink.isPending ? 'Saving…' : 'Create Link'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Step 3: Add DeleteLinkButton with AlertDialog

- [ ] Append to the same file:

```typescript
// ─── DeleteLinkButton ─────────────────────────────────────────────────────────

function DeleteLinkButton({ id, label }: { id: string; label: string }) {
  const deleteLink = useDeleteServiceInventoryLink()

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          className="text-muted-foreground hover:text-destructive transition-colors"
          title="Remove link"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove link?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes <span className="font-medium">{label}</span> from this service.
            Future orders will no longer auto-deduct or charge this item.
            Historical orders are unaffected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              deleteLink.mutate(id, {
                onSuccess: () => toast.success('Link removed'),
                onError: (err) => toast.error(err.message),
              })
            }
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

### Step 4: Add ServiceLinkSubRow

- [ ] Append to the same file:

```typescript
// ─── ServiceLinkSubRow ────────────────────────────────────────────────────────

function ServiceLinkSubRow({ link }: { link: ServiceInventoryLinkFull }) {
  const updateLink = useUpdateServiceInventoryLink()
  const variant = link.inventory_brand_variants

  // Guard: variant was deleted (FK violation prevented, but defensive)
  if (!variant) {
    return (
      <tr className="border-b border-border/60 bg-red-50/30">
        <td colSpan={6} className="py-2 pl-10 text-xs text-red-600">
          ⚠ Variant missing — link ID {link.id}
        </td>
      </tr>
    )
  }

  const item = variant.inventory_items

  function handleTypeChange(type: LinkType) {
    updateLink.mutate(
      { id: link.id, link_type: type },
      { onError: (err) => toast.error(err.message) },
    )
  }

  function handleWarrantyChange(months: string) {
    updateLink.mutate(
      { id: link.id, warranty_months: Number(months) },
      { onError: (err) => toast.error(err.message) },
    )
  }

  // Uses onBlur (not onChange) — fires once when focus leaves the field.
  // This pattern naturally avoids race conditions from rapid input changes
  // without needing a debounce, since only one request fires per focus cycle.
  function handleQtyBlur(e: React.FocusEvent<HTMLInputElement>) {
    const qty = Number(e.target.value)
    if (qty > 0) {
      updateLink.mutate(
        { id: link.id, quantity: qty },
        { onError: (err) => toast.error(err.message) },
      )
    }
  }

  const cfg = LINK_TYPE_CONFIG[link.link_type]
  const deleteLabel = `${variant.brand} · ${item?.name_en ?? 'unknown item'}`

  return (
    <tr className="border-b border-border/60 bg-muted/10 hover:bg-muted/20">
      <td className="py-2 pl-10 pr-2" colSpan={2}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold border ${cfg.badgeClass}`}>
            {cfg.letter}
          </span>
          <span className="text-xs font-medium">{variant.brand}</span>
          {item && (
            <span className="text-[11px] text-muted-foreground">· {item.name_en} · {item.sku}</span>
          )}
          {variant.selling_price != null && variant.selling_price > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 h-4 text-emerald-700 border-emerald-200 bg-emerald-50">
              QAR {variant.selling_price.toLocaleString()}
            </Badge>
          )}
        </div>
      </td>

      <td className="py-2 px-2">
        <Select value={link.link_type} onValueChange={handleTypeChange}>
          <SelectTrigger className="h-6 text-[11px] w-28 px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LINK_TYPE_CONFIG) as LinkType[]).map((k) => (
              <SelectItem key={k} value={k} className="text-xs">
                {LINK_TYPE_CONFIG[k].letter} — {LINK_TYPE_CONFIG[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="py-2 px-2">
        <Select value={String(link.warranty_months)} onValueChange={handleWarrantyChange}>
          <SelectTrigger className="h-6 text-[11px] w-24 px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WARRANTY_OPTIONS.map((m) => (
              <SelectItem key={m} value={String(m)} className="text-xs">
                {m === 0 ? 'None' : `${m} mo`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="py-2 px-2">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            defaultValue={link.quantity}
            onBlur={handleQtyBlur}
            className="h-6 w-16 text-[11px] px-2"
          />
          {item && <span className="text-[10px] text-muted-foreground">{item.unit}</span>}
        </div>
      </td>

      <td className="py-2 px-2 text-right">
        <DeleteLinkButton id={link.id} label={deleteLabel} />
      </td>
    </tr>
  )
}
```

### Step 5: Add ServiceRow with a11y

- [ ] Append to the same file:

```typescript
// ─── ServiceRow ───────────────────────────────────────────────────────────────

function ServiceRow({
  service,
  links,
  breadcrumbs,
  allServices,
  onAddLink,
}: {
  service: ServiceNode
  links: ServiceInventoryLinkFull[]
  breadcrumbs: Map<string, string>
  allServices: ServiceNode[]
  onAddLink: (serviceId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const linked = links.length > 0
  const breadcrumb = breadcrumbs.get(service.id) ?? service.name_en

  const variantLabels = links
    .map((l) => l.inventory_brand_variants?.brand)
    .filter(Boolean) as string[]
  const previewLabels = variantLabels.slice(0, 2)
  const overflowCount = variantLabels.length - 2

  const typeLetters = [...new Set(links.map((l) => LINK_TYPE_CONFIG[l.link_type].letter))]
  const totalQty = links.reduce((acc, l) => acc + (l.quantity ?? 0), 0)

  function toggle() {
    setExpanded((v) => !v)
  }

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/20 cursor-pointer focus-within:bg-muted/10"
        onClick={toggle}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
      >
        <td className="py-2.5 pl-3 pr-2">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            }
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{service.name_en}</p>
              <p className="text-[10px] text-muted-foreground truncate">{breadcrumb}</p>
            </div>
          </div>
        </td>

        <td className="py-2.5 px-2">
          {linked ? (
            <Badge variant="outline" className="text-[10px] px-1.5 h-5 text-emerald-700 border-emerald-200 bg-emerald-50 gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> {links.length}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] px-1.5 h-5 text-amber-700 border-amber-200 bg-amber-50 gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> 0
            </Badge>
          )}
        </td>

        <td className="py-2.5 px-2 hidden md:table-cell">
          <span className="text-xs text-muted-foreground">
            {previewLabels.join(', ')}
            {overflowCount > 0 && ` +${overflowCount}`}
          </span>
        </td>

        <td className="py-2.5 px-2 hidden lg:table-cell">
          <div className="flex gap-1">
            {typeLetters.map((letter) => {
              const cfg = Object.values(LINK_TYPE_CONFIG).find((c) => c.letter === letter)!
              return (
                <span key={letter} className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold border ${cfg.badgeClass}`}>
                  {letter}
                </span>
              )
            })}
          </div>
        </td>

        <td className="py-2.5 px-2 hidden lg:table-cell">
          <span className="text-xs text-muted-foreground">{totalQty > 0 ? totalQty : '—'}</span>
        </td>

        <td className="py-2.5 px-2 text-right" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            title="Add link to this service"
            onClick={() => onAddLink(service.id)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </td>
      </tr>

      {expanded && links.map((link) => (
        <ServiceLinkSubRow key={link.id} link={link} />
      ))}
    </>
  )
}
```

### Step 6: Add the main ServiceLinksView export with URL-synced filters

- [ ] Append to the same file:

```typescript
// ─── ServiceLinksView ─────────────────────────────────────────────────────────

export function ServiceLinksView({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Read filter state from URL (persists across navigation/refresh)
  const search = searchParams.get('slSearch') ?? ''
  const typeFilter = (searchParams.get('slType') ?? 'all') as TreeTypeFilter
  const statusFilter = (searchParams.get('slStatus') ?? 'all') as StatusFilter

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all' || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const [newLinkServiceId, setNewLinkServiceId] = useState<string | undefined>(undefined)
  const [showNewLink, setShowNewLink] = useState(false)

  const { data: allServices = [], isLoading: servicesLoading } = useServicesForLinks()
  const { data: allLinks = [], isLoading: linksLoading } = useAllServiceLinks()

  const isLoading = servicesLoading || linksLoading

  // Pre-compute breadcrumbs once when services load — O(n) total, not O(n) per filter
  const breadcrumbs = useMemo(() => buildBreadcrumbMap(allServices), [allServices])

  // Build a map: service_id → links for that service
  const linksByService = useMemo(() => {
    const map = new Map<string, ServiceInventoryLinkFull[]>()
    for (const link of allLinks) {
      const existing = map.get(link.service_id) ?? []
      existing.push(link)
      map.set(link.service_id, existing)
    }
    return map
  }, [allLinks])

  const leaves = useMemo(() => collectLeaves(allServices), [allServices])

  const totalLeaves = leaves.length
  const linkedLeaves = leaves.filter((s) => (linksByService.get(s.id)?.length ?? 0) > 0).length
  const unlinkedLeaves = totalLeaves - linkedLeaves

  const filteredLeaves = useMemo(() => {
    const lowerSearch = search.toLowerCase()
    return leaves.filter((s) => {
      if (lowerSearch) {
        const crumb = (breadcrumbs.get(s.id) ?? '').toLowerCase()
        if (!crumb.includes(lowerSearch)) return false
      }
      if (typeFilter !== 'all' && s.tree_type !== typeFilter) return false
      const linkCount = linksByService.get(s.id)?.length ?? 0
      if (statusFilter === 'linked' && linkCount === 0) return false
      if (statusFilter === 'unlinked' && linkCount > 0) return false
      return true
    })
  }, [leaves, breadcrumbs, search, typeFilter, statusFilter, linksByService])

  function openNewLink(serviceId?: string) {
    setNewLinkServiceId(serviceId)
    setShowNewLink(true)
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header counters ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-muted/20">
        <span className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{totalLeaves}</span> services
        </span>
        <span className="text-xs text-emerald-700 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          <span className="font-semibold">{linkedLeaves}</span> linked
        </span>
        <span className="text-xs text-amber-700 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          <span className="font-semibold">{unlinkedLeaves}</span> unlinked
        </span>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-wrap">
        <Input
          placeholder="Search services…"
          value={search}
          onChange={(e) => setParam('slSearch', e.target.value)}
          className="h-7 text-xs w-48 shrink-0"
        />
        <Select value={typeFilter} onValueChange={(v) => setParam('slType', v)}>
          <SelectTrigger className="h-7 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Types</SelectItem>
            <SelectItem value="normal" className="text-xs">Normal</SelectItem>
            <SelectItem value="contract" className="text-xs">Contract</SelectItem>
            <SelectItem value="mobile" className="text-xs">Mobile</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setParam('slStatus', v)}>
          <SelectTrigger className="h-7 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
            <SelectItem value="linked" className="text-xs">Linked</SelectItem>
            <SelectItem value="unlinked" className="text-xs">Unlinked</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => openNewLink()}>
            <Plus className="h-3.5 w-3.5" /> New Link
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40 sticky top-0">
                <th className="text-left text-[11px] font-semibold py-2 pl-3 pr-2 w-64">SERVICE</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2 w-20">STATUS</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2 hidden md:table-cell">ITEMS</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2 hidden lg:table-cell w-20">TYPES</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2 hidden lg:table-cell w-16">QTY</th>
                <th className="text-right text-[11px] font-semibold py-2 px-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filteredLeaves.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-xs text-muted-foreground py-16">
                    No services match the current filters
                  </td>
                </tr>
              )}
              {filteredLeaves.map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  links={linksByService.get(service.id) ?? []}
                  breadcrumbs={breadcrumbs}
                  allServices={allServices}
                  onAddLink={openNewLink}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── New Link Dialog ── */}
      {showNewLink && (
        <NewLinkDialog
          services={leaves}
          breadcrumbs={breadcrumbs}
          preselectedServiceId={newLinkServiceId}
          onClose={() => { setShowNewLink(false); setNewLinkServiceId(undefined) }}
        />
      )}
    </div>
  )
}
```

### Step 7: Verify TypeScript compiles

- [ ] Run:

```bash
npx tsc --noEmit
```

Expected: 0 errors.

### Step 8: Commit

- [ ] Commit:

```bash
git add src/components/services/inventory/ServiceLinksView.tsx
git commit -m "feat(service-links): rebuild ServiceLinksView — service-centric view with a11y rows, URL-synced filters, AlertDialog delete, optimistic inline editing"
```

---

## Task 5: Final Verification

- [ ] **Step 1: TypeScript clean build**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Confirm no stale `qty_per_service` references**

```bash
grep -rn "qty_per_service" src/
```

Expected: no output.

- [ ] **Step 3: Dev server smoke test**

```bash
npm run dev
```

Navigate to `/master-data/services` → Inventory tab → Service Links sub-tab. Verify:

| Feature | Expected |
|---------|----------|
| Header counters | Correct totals — services / linked / unlinked |
| Search filter | Filters rows by service name or breadcrumb path; persists on page reload (URL param `slSearch`) |
| Type dropdown | Filters by tree_type; persists in URL (`slType`) |
| Status dropdown | Shows only linked / unlinked rows; persists in URL (`slStatus`) |
| Clicking a service row | Expands / collapses linked items; keyboard Enter/Space also toggles |
| Expanded sub-rows | Shows variant brand, item name, SKU, selling price badge (if >0), link type dropdown, warranty dropdown, qty input, unit, delete button |
| Changing link type | Saves immediately, no table flicker (optimistic update) |
| Changing warranty | Saves immediately, no table flicker (optimistic update) |
| Blurring qty input | Saves updated quantity |
| Delete button | Shows AlertDialog with description; confirming removes the row |
| ➕ per-row button | Opens New Link dialog pre-selecting that service |
| + New Link button | Opens dialog with empty service picker |
| New Link dialog — service step | Searchable list of all leaf services with breadcrumbs |
| New Link dialog — variant step | Item picker → variant picker → link type / qty / warranty → Create Link |
| After creating link | Row appears in table; counters update |
| Mobile (< 640px) | Items, Types, Qty columns hidden; breadcrumb truncates cleanly |
| Screen reader | Expandable rows have `role="button"` and `aria-expanded` |

- [ ] **Step 4: Update PROGRESS.md and commit**

Update `## ✅ Completed` and `## 🔄 In Progress` sections per the mandatory protocol, then:

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — Service Links redesign complete"
```

---

## Review Response Notes

| Item | Decision |
|---|---|
| 1 — Breaking rename | Fixed: add `quantity` + sync + drop `qty_per_service` in migration; update 3 old references in Task 3 |
| 2 — Breadcrumb performance | Fixed: `buildBreadcrumbMap` pre-computes once in `useMemo`; rows look up by ID |
| 3 — `as any` typing | Deferred: pre-existing pattern across all hooks in this file; regenerating Supabase types is a separate task |
| 4 — Optimistic UI | Fixed: `useUpdateServiceInventoryLink` uses `onMutate` / rollback pattern |
| 5 — `!inner` vanishing | Fixed: removed `!inner`, added null guard + "Variant missing" warning row |
| 6 — Delete confirmation | Fixed: `DeleteLinkButton` wraps `AlertDialog` with contextual description |
| 7 — Filter URL sync | Fixed: `slSearch`, `slType`, `slStatus` params; `setParam` helper cleans up defaults |
| 8 — Race conditions | Non-issue: qty uses `onBlur` (one event per focus cycle), not `onChange`. No debounce needed |
| 9 — Accessibility | Fixed: `role="button"`, `aria-expanded`, `tabIndex={0}`, `onKeyDown` for Enter/Space |
