# Service Links Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cramped tree-table Service Links UI with a column browser + inline right panel, and simplify link types from three (consumable / select_one / install_all) to two (supply / consumable).

**Architecture:** Three focused components — `ServiceLinksColumnBrowser` (navigates the service tree level by level), `ServiceLeafPanel` (manages supply item + consumables for a selected leaf service), and a slimmed-down `ServiceLinksView` that wires them together. A DB migration drops the old link types and adds `supply`.

**Tech Stack:** Next.js, React, TanStack Query, Supabase, Tailwind, shadcn/ui (Popover, Command, Input, Button)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `supabase/migrations/20260502000001_service_inventory_supply_consumable.sql` | Drop old link_type constraint, add supply/consumable |
| Modify | `src/components/services/inventory/serviceInventoryHelpers.ts` | New LINK_TYPE_CONFIG (2 types), add buildTreeMap, remove WARRANTY_OPTIONS |
| Create | `src/components/services/inventory/ServiceLinksColumnBrowser.tsx` | Column browser — navigates service tree, shows leaf link status |
| Create | `src/components/services/inventory/ServiceLeafPanel.tsx` | Right panel — manage supply item + consumables for one leaf |
| Rewrite | `src/components/services/inventory/ServiceLinksView.tsx` | Top-level: load data, render browser + panel, show stats bar |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260502000001_service_inventory_supply_consumable.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260502000001_service_inventory_supply_consumable.sql

BEGIN;

-- Drop the auto-named inline check constraint added by the previous migration
ALTER TABLE service_inventory
  DROP CONSTRAINT IF EXISTS service_inventory_link_type_check;

-- Migrate any rows that used the old types
UPDATE service_inventory
  SET link_type = 'consumable'
  WHERE link_type IN ('select_one', 'install_all');

-- Add clean named constraint with the two new types
ALTER TABLE service_inventory
  ADD CONSTRAINT service_inventory_link_type_check
  CHECK (link_type IN ('supply', 'consumable'));

COMMIT;
```

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push
```

Expected output ends with: `Remote database is up to date`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260502000001_service_inventory_supply_consumable.sql
git commit -m "feat(db): simplify service_inventory link_type to supply/consumable"
```

---

## Task 2: Update Helpers

**Files:**
- Modify: `src/components/services/inventory/serviceInventoryHelpers.ts`

- [ ] **Step 1: Replace the entire file**

```ts
// src/components/services/inventory/serviceInventoryHelpers.ts

export const LINK_TYPE_CONFIG = {
  supply: {
    label: 'Supply',
    letter: 'S',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  consumable: {
    label: 'Consumable',
    letter: 'C',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
} as const

export type LinkType = keyof typeof LINK_TYPE_CONFIG

export interface ServiceNode {
  id: string
  name_en: string
  parent_id: string | null
  tree_type: string | null
  warranty?: number | null
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
  } | null
}

/** Returns a Map from parent_id → children, used by the column browser. */
export function buildTreeMap(
  services: ServiceNode[],
): Map<string | null, ServiceNode[]> {
  const map = new Map<string | null, ServiceNode[]>()
  for (const s of services) {
    const key = s.parent_id ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return map
}

/**
 * Pre-computes a serviceId → breadcrumb string map.
 * Call once when services load; pass the result wherever breadcrumbs are needed.
 */
export function buildBreadcrumbMap(services: ServiceNode[]): Map<string, string> {
  const nodeMap = new Map(services.map((s) => [s.id, s]))
  const cache = new Map<string, string>()

  function resolve(id: string): string {
    if (cache.has(id)) return cache.get(id)!
    const node = nodeMap.get(id)
    if (!node) return ''
    const parentCrumb = node.parent_id ? resolve(node.parent_id) : ''
    const result = parentCrumb ? `${parentCrumb} › ${node.name_en}` : node.name_en
    cache.set(id, result)
    return result
  }

  for (const s of services) resolve(s.id)
  return cache
}

/** Returns the set of service IDs that are parents (have at least one child). */
export function buildParentIdSet(services: ServiceNode[]): Set<string> {
  return new Set(
    services.map((s) => s.parent_id).filter(Boolean) as string[],
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/services/inventory/serviceInventoryHelpers.ts
git commit -m "refactor(services): simplify link type helpers, add buildTreeMap/buildParentIdSet"
```

---

## Task 3: ServiceLinksColumnBrowser

**Files:**
- Create: `src/components/services/inventory/ServiceLinksColumnBrowser.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/services/inventory/ServiceLinksColumnBrowser.tsx
'use client'

import { useState, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  buildParentIdSet,
  type ServiceNode,
  type ServiceInventoryLinkFull,
} from './serviceInventoryHelpers'

// ─── ColumnPanel ──────────────────────────────────────────────────────────────

interface ColumnPanelProps {
  nodes: ServiceNode[]
  selectedBranchId: string | undefined   // which branch is active in this column
  selectedLeafId: string | null           // which leaf is open (may be in any column)
  isLeaf: (id: string) => boolean
  linksByService: Map<string, ServiceInventoryLinkFull[]>
  onSelect: (id: string) => void
}

function ColumnPanel({
  nodes,
  selectedBranchId,
  selectedLeafId,
  isLeaf,
  linksByService,
  onSelect,
}: ColumnPanelProps) {
  if (nodes.length === 0) return null

  return (
    <div className="w-52 shrink-0 border-r border-border overflow-y-auto flex flex-col bg-background">
      {nodes.map((node) => {
        const leaf = isLeaf(node.id)
        const isActive = leaf
          ? selectedLeafId === node.id
          : selectedBranchId === node.id
        const links = leaf ? (linksByService.get(node.id) ?? []) : []
        const hasSupply = links.some((l) => l.link_type === 'supply')

        return (
          <button
            key={node.id}
            onClick={() => onSelect(node.id)}
            className={cn(
              'w-full text-left px-3 py-2.5 flex items-center justify-between gap-2',
              'border-b border-border/30 hover:bg-muted/30 transition-colors',
              isActive && 'bg-primary/10 text-primary',
            )}
          >
            <span
              className={cn(
                'flex-1 truncate text-xs leading-snug',
                isActive ? 'font-semibold' : 'font-normal text-foreground',
              )}
            >
              {node.name_en}
            </span>

            <span className="shrink-0 flex items-center">
              {leaf ? (
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    hasSupply ? 'bg-emerald-500' : 'bg-amber-400',
                  )}
                  title={hasSupply ? 'Supply item linked' : 'No supply item'}
                />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── ServiceLinksColumnBrowser ────────────────────────────────────────────────

interface ColumnBrowserProps {
  services: ServiceNode[]
  treeMap: Map<string | null, ServiceNode[]>
  linksByService: Map<string, ServiceInventoryLinkFull[]>
  selectedLeafId: string | null
  onLeafSelect: (id: string | null) => void
}

export function ServiceLinksColumnBrowser({
  services,
  treeMap,
  linksByService,
  selectedLeafId,
  onLeafSelect,
}: ColumnBrowserProps) {
  // selectedPath[k] = the branch ID selected in column k
  const [selectedPath, setSelectedPath] = useState<string[]>([])

  const parentIds = useMemo(() => buildParentIdSet(services), [services])

  function isLeaf(id: string) {
    return !parentIds.has(id)
  }

  function handleSelect(nodeId: string, colIdx: number) {
    if (isLeaf(nodeId)) {
      // Toggle leaf selection; trim path to this column
      onLeafSelect(selectedLeafId === nodeId ? null : nodeId)
      setSelectedPath((prev) => prev.slice(0, colIdx))
    } else {
      // Navigate into branch; close any open leaf
      setSelectedPath((prev) => [...prev.slice(0, colIdx), nodeId])
      onLeafSelect(null)
    }
  }

  // Build column list: column 0 = root children, column k = children of selectedPath[k-1]
  // Use stable keys: 'root' for col 0, then the branch ID for each subsequent col
  const columns: { key: string; nodes: ServiceNode[]; selectedBranchId: string | undefined }[] = []

  const roots = treeMap.get(null) ?? []
  columns.push({ key: 'root', nodes: roots, selectedBranchId: selectedPath[0] })

  for (let k = 0; k < selectedPath.length; k++) {
    const children = treeMap.get(selectedPath[k]) ?? []
    if (children.length > 0) {
      columns.push({
        key: selectedPath[k],
        nodes: children,
        selectedBranchId: selectedPath[k + 1],
      })
    }
  }

  return (
    <div className="flex flex-1 overflow-x-auto min-w-0">
      {columns.map((col, colIdx) => (
        <ColumnPanel
          key={col.key}
          nodes={col.nodes}
          selectedBranchId={col.selectedBranchId}
          selectedLeafId={selectedLeafId}
          isLeaf={isLeaf}
          linksByService={linksByService}
          onSelect={(id) => handleSelect(id, colIdx)}
        />
      ))}

      {/* Empty state when nothing is selected */}
      {selectedLeafId === null && columns.length > 0 && (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground px-8 text-center">
          Select a service to manage its inventory links
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/services/inventory/ServiceLinksColumnBrowser.tsx
git commit -m "feat(services): add ServiceLinksColumnBrowser column navigation component"
```

---

## Task 4: ServiceLeafPanel

**Files:**
- Create: `src/components/services/inventory/ServiceLeafPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/services/inventory/ServiceLeafPanel.tsx
'use client'

import { useState, useMemo } from 'react'
import { X, Plus, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  useAddServiceInventoryLink,
  useDeleteServiceInventoryLink,
  useUpdateServiceInventoryLink,
  useAllBrandVariantsGrouped,
  type BrandVariantGrouped,
} from '@/hooks/useInventory'
import type { ServiceInventoryLinkFull } from './serviceInventoryHelpers'

// ─── VariantPicker ────────────────────────────────────────────────────────────
// Self-contained popover that lets the user search and pick an inventory variant.
// Manages its own open state; calls onSelect(variantId) then closes.

function VariantPicker({
  label,
  allVariants,
  onSelect,
}: {
  label: string
  allVariants: BrandVariantGrouped[]
  onSelect: (variantId: string) => void
}) {
  const [open, setOpen] = useState(false)

  // Build category → item → variants tree for the picker
  const categoryTree = useMemo(() => {
    const catMap = new Map<
      string,
      {
        catName: string
        items: Map<string, { itemName: string; itemSku: string; variants: BrandVariantGrouped[] }>
      }
    >()
    for (const v of allVariants) {
      if (!catMap.has(v.catId))
        catMap.set(v.catId, { catName: v.catName, items: new Map() })
      const cat = catMap.get(v.catId)!
      if (!cat.items.has(v.itemId))
        cat.items.set(v.itemId, { itemName: v.itemName, itemSku: v.itemSku, variants: [] })
      cat.items.get(v.itemId)!.variants.push(v)
    }
    return catMap
  }, [allVariants])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-8 inline-flex items-center justify-between rounded-md border border-input bg-background px-3 text-xs text-muted-foreground shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span>{label}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="bottom">
        <Command>
          <CommandInput placeholder="Search by item or brand…" className="text-xs" />
          <CommandList className="max-h-72">
            <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">
              No items found
            </CommandEmpty>
            {[...categoryTree.entries()].map(([catId, { catName, items: itemMap }]) => (
              <CommandGroup key={catId} heading={catName}>
                {[...itemMap.entries()].map(([itemId, { itemName, itemSku, variants }]) => (
                  <div key={itemId}>
                    <div className="px-3 pt-1.5 pb-0.5 text-[10px] text-muted-foreground font-semibold flex gap-1">
                      <span>{itemName}</span>
                      <span className="opacity-50">· {itemSku}</span>
                    </div>
                    {variants.map((v) => (
                      <CommandItem
                        key={v.variantId}
                        value={`${catName} ${itemName} ${v.brand} ${itemSku}`}
                        onSelect={() => {
                          onSelect(v.variantId)
                          setOpen(false)
                        }}
                        className="text-xs cursor-pointer pl-6"
                      >
                        <span className="font-medium flex-1">{v.brand}</span>
                        {v.costPrice > 0 && (
                          <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                            {v.costPrice.toLocaleString()} QAR
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </div>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─── ServiceLeafPanel ─────────────────────────────────────────────────────────

interface LeafPanelProps {
  serviceId: string
  serviceName: string
  breadcrumb: string
  links: ServiceInventoryLinkFull[]
  warranty: number | null
  onClose: () => void
}

export function ServiceLeafPanel({
  serviceId,
  serviceName,
  breadcrumb,
  links,
  warranty,
  onClose,
}: LeafPanelProps) {
  const addLink = useAddServiceInventoryLink()
  const deleteLink = useDeleteServiceInventoryLink()
  const updateLink = useUpdateServiceInventoryLink()

  // Fetch variants only when this panel is mounted (cached 5 min)
  const { data: allVariants = [] } = useAllBrandVariantsGrouped(true)

  const supplyLink = links.find((l) => l.link_type === 'supply') ?? null
  const consumableLinks = links.filter((l) => l.link_type === 'consumable')

  // Consumable add flow state
  const [addingConsumable, setAddingConsumable] = useState(false)
  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null)
  const [pendingQty, setPendingQty] = useState(1)

  function handleAddSupply(variantId: string) {
    addLink.mutate(
      {
        service_id: serviceId,
        brand_variant_id: variantId,
        link_type: 'supply',
        quantity: 1,
        warranty_months: warranty ?? 0,
      },
      { onError: (err) => toast.error(err.message) },
    )
  }

  function handleAddConsumable() {
    if (!pendingVariantId) return
    addLink.mutate(
      {
        service_id: serviceId,
        brand_variant_id: pendingVariantId,
        link_type: 'consumable',
        quantity: pendingQty,
        warranty_months: 0,
      },
      {
        onSuccess: () => {
          setAddingConsumable(false)
          setPendingVariantId(null)
          setPendingQty(1)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleCancelConsumable() {
    setAddingConsumable(false)
    setPendingVariantId(null)
    setPendingQty(1)
  }

  function handleRemove(id: string) {
    deleteLink.mutate(id, { onError: (err) => toast.error(err.message) })
  }

  function handleQtyBlur(id: string, raw: string) {
    const qty = Number(raw)
    if (qty > 0) {
      updateLink.mutate({ id, quantity: qty }, { onError: (err) => toast.error(err.message) })
    }
  }

  return (
    <div className="w-72 shrink-0 flex flex-col border-l border-border bg-background h-full">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground truncate mb-0.5">{breadcrumb}</p>
          <p className="text-sm font-semibold leading-snug">{serviceName}</p>
          {warranty != null && warranty > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{warranty} mo warranty</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5 transition-colors"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">

        {/* Supply item */}
        <section>
          <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2">
            Supply Item
          </p>

          {supplyLink ? (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">
                  {supplyLink.inventory_brand_variants?.brand}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {supplyLink.inventory_brand_variants?.inventory_items?.name_en}
                  {' · '}
                  {supplyLink.inventory_brand_variants?.inventory_items?.sku}
                </p>
                {(supplyLink.inventory_brand_variants?.selling_price ?? 0) > 0 && (
                  <p className="text-[10px] text-emerald-700 mt-0.5">
                    QAR {supplyLink.inventory_brand_variants!.selling_price!.toLocaleString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleRemove(supplyLink.id)}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"
                title="Remove supply item"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <VariantPicker
              label="Set supply item…"
              allVariants={allVariants}
              onSelect={handleAddSupply}
            />
          )}
        </section>

        {/* Consumables */}
        <section>
          <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2">
            Consumables
          </p>

          <div className="space-y-1.5">
            {consumableLinks.map((link) => (
              <div
                key={link.id}
                className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 flex items-center gap-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate">
                    <span className="font-medium">
                      {link.inventory_brand_variants?.brand}
                    </span>
                    {' · '}
                    <span className="text-muted-foreground">
                      {link.inventory_brand_variants?.inventory_items?.name_en}
                    </span>
                  </p>
                </div>
                <Input
                  type="number"
                  min={0.01}
                  step={0.01}
                  defaultValue={link.quantity}
                  onBlur={(e) => handleQtyBlur(link.id, e.target.value)}
                  className="h-6 w-16 text-[11px] px-2 shrink-0"
                />
                <span className="text-[10px] text-muted-foreground shrink-0 w-5 text-right">
                  {link.inventory_brand_variants?.inventory_items?.unit}
                </span>
                <button
                  onClick={() => handleRemove(link.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {/* Add consumable flow */}
            {addingConsumable ? (
              <div className="rounded-md border border-border p-2.5 space-y-2">
                {pendingVariantId === null ? (
                  <VariantPicker
                    label="Select consumable…"
                    allVariants={allVariants}
                    onSelect={(id) => setPendingVariantId(id)}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={pendingQty}
                      onChange={(e) => setPendingQty(Number(e.target.value))}
                      className="h-7 w-20 text-xs"
                      autoFocus
                    />
                    <span className="text-[10px] text-muted-foreground">qty</span>
                    <Button
                      size="sm"
                      className="h-7 text-xs flex-1"
                      onClick={handleAddConsumable}
                      disabled={addLink.isPending}
                    >
                      {addLink.isPending ? '…' : 'Add'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2"
                      onClick={handleCancelConsumable}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {addingConsumable && pendingVariantId === null && (
                  <button
                    onClick={handleCancelConsumable}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setAddingConsumable(true)}
                className={cn(
                  'flex items-center gap-1.5 text-xs text-muted-foreground',
                  'hover:text-foreground transition-colors py-1 px-1',
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                Add consumable
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/services/inventory/ServiceLeafPanel.tsx
git commit -m "feat(services): add ServiceLeafPanel for managing supply item and consumables"
```

---

## Task 5: Rewrite ServiceLinksView

**Files:**
- Rewrite: `src/components/services/inventory/ServiceLinksView.tsx`

This file previously held `NewLinkDialog`, `DeleteLinkButton`, `ServiceLinkSubRow`, `TreeNode`, and `ServiceLinksView`. All of those are replaced. The new file only contains `ServiceLinksView`.

- [ ] **Step 1: Replace the entire file**

```tsx
// src/components/services/inventory/ServiceLinksView.tsx
'use client'

import { useState, useMemo } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useServicesForLinks, useAllServiceLinks } from '@/hooks/useInventory'
import {
  buildTreeMap,
  buildBreadcrumbMap,
  buildParentIdSet,
  type ServiceInventoryLinkFull,
} from './serviceInventoryHelpers'
import { ServiceLinksColumnBrowser } from './ServiceLinksColumnBrowser'
import { ServiceLeafPanel } from './ServiceLeafPanel'

export function ServiceLinksView({ enabled }: { enabled: boolean }) {
  const [selectedLeafId, setSelectedLeafId] = useState<string | null>(null)

  const { data: allServices = [], isLoading: servicesLoading } = useServicesForLinks()
  const { data: allLinks = [], isLoading: linksLoading } = useAllServiceLinks()
  const isLoading = servicesLoading || linksLoading

  const treeMap = useMemo(() => buildTreeMap(allServices), [allServices])
  const breadcrumbs = useMemo(() => buildBreadcrumbMap(allServices), [allServices])
  const parentIds = useMemo(() => buildParentIdSet(allServices), [allServices])

  const linksByService = useMemo(() => {
    const map = new Map<string, ServiceInventoryLinkFull[]>()
    for (const link of allLinks) {
      const arr = map.get(link.service_id) ?? []
      arr.push(link)
      map.set(link.service_id, arr)
    }
    return map
  }, [allLinks])

  // Stats — count only leaf services (no children)
  const leafIds = useMemo(
    () => allServices.filter((s) => !parentIds.has(s.id)).map((s) => s.id),
    [allServices, parentIds],
  )
  const supplyLinkedCount = leafIds.filter((id) =>
    (linksByService.get(id) ?? []).some((l) => l.link_type === 'supply'),
  ).length
  const noSupplyCount = leafIds.length - supplyLinkedCount

  const selectedService = selectedLeafId
    ? allServices.find((s) => s.id === selectedLeafId) ?? null
    : null
  const selectedLinks = selectedLeafId ? (linksByService.get(selectedLeafId) ?? []) : []

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Stats bar ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-muted/20 shrink-0 flex-wrap">
        <span className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{leafIds.length}</span> services
        </span>
        <span className="text-xs text-emerald-700 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          <span className="font-semibold">{supplyLinkedCount}</span> supply linked
        </span>
        <span className="text-xs text-amber-700 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          <span className="font-semibold">{noSupplyCount}</span> no supply
        </span>
        <span className="text-xs text-muted-foreground ml-auto hidden sm:block">
          Navigate → select a service → manage links
        </span>
      </div>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">
        <ServiceLinksColumnBrowser
          services={allServices}
          treeMap={treeMap}
          linksByService={linksByService}
          selectedLeafId={selectedLeafId}
          onLeafSelect={setSelectedLeafId}
        />

        {selectedService && (
          <ServiceLeafPanel
            serviceId={selectedService.id}
            serviceName={selectedService.name_en}
            breadcrumb={breadcrumbs.get(selectedService.id) ?? ''}
            links={selectedLinks}
            warranty={selectedService.warranty ?? null}
            onClose={() => setSelectedLeafId(null)}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If TypeScript reports `LinkType` errors (e.g. old `select_one` or `install_all` values used somewhere), search for them:

```bash
npx grep -r "select_one\|install_all" src/
```

Fix any remaining references by changing to `'consumable'`.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/ServiceLinksView.tsx
git commit -m "feat(services): rewrite ServiceLinksView with column browser + leaf panel"
```

---

## Task 6: PROGRESS.md

- [ ] **Step 1: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-05-02] **Service Links Redesign** — `serviceInventoryHelpers.ts`, `ServiceLinksView.tsx`, `ServiceLinksColumnBrowser.tsx` (new), `ServiceLeafPanel.tsx` (new), migration `20260502000001` — Column browser replaces tree table; link types simplified to supply/consumable; inline right panel replaces modal dialog
```

Remove from `## 🔄 In Progress` whatever was previously listed for this task.

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — Service Links redesign complete"
```

---

## Self-Review

**Spec coverage:**
- ✅ Link types reduced to supply + consumable — Task 1 (migration) + Task 2 (helpers)
- ✅ Column browser with variable depth — Task 3
- ✅ Green dot (supply linked) / amber dot (no supply) per leaf — Task 3, ColumnPanel
- ✅ Right panel with supply item + consumables, no modal — Task 4
- ✅ Consumable multi-attach (same item can be added to multiple services independently) — Task 4, handleAddConsumable
- ✅ Quantity editable on consumables — Task 4, handleQtyBlur
- ✅ Warranty auto-populated from service when creating supply link — Task 4, handleAddSupply
- ✅ Stats bar (total / linked / unlinked) — Task 5
- ✅ Old components (NewLinkDialog, TreeNode, ServiceLinkSubRow) removed — Task 5 (full file replace)

**Placeholder scan:** No TBDs, no "implement later", all code blocks complete.

**Type consistency:**
- `LinkType` = `'supply' | 'consumable'` throughout (derived from `LINK_TYPE_CONFIG` keys)
- `ServiceInventoryLinkFull`, `ServiceNode`, `BrandVariantGrouped` — same shape used in all tasks
- `buildTreeMap`, `buildBreadcrumbMap`, `buildParentIdSet` — defined in Task 2, imported in Tasks 3 and 5
- `useAddServiceInventoryLink` params match `{ service_id, brand_variant_id, link_type, quantity, warranty_months }` — verified against `useInventory.ts`
