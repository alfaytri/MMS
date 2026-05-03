# Service Links Master-Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Miller-columns Service Links subtab with a Search-First Master-Detail layout — a searchable flat/grouped list on the left (40%) and a context-sensitive action canvas on the right (60%) that supports single-service linking and multi-service bulk-linking.

**Architecture:** The left panel (`ServiceLinksMasterList`) renders leaf services grouped by top-level category, with instant local search that flattens the list. The right panel switches between three modes: zero state (nothing selected), single-select (shows `ServiceLeafPanel` as-is), and bulk-select (`ServiceLinksBulkPanel` with a checklist + atomic upsert RPC). `ServiceLinksView` owns the `activeId` / `checkedIds` state and routes between modes.

**Tech Stack:** Next.js 15, React 19, Supabase (postgres RPC for bulk upsert), TanStack Query v5, Tailwind CSS, shadcn/ui, existing `InventoryColumnPicker` and `ServiceLeafPanel` components reused unchanged.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| **Create** | `supabase/migrations/20260503120000_service_inventory_bulk_upsert.sql` | Postgres upsert RPC |
| **Create** | `src/components/services/inventory/ServiceLinksMasterList.tsx` | Left panel: search, grouped/flat list, rows |
| **Create** | `src/components/services/inventory/ServiceLinksZeroState.tsx` | Right panel zero state: category summary chart |
| **Create** | `src/components/services/inventory/ServiceLinksBulkPanel.tsx` | Right panel bulk mode: checklist + bulk-link |
| **Modify** | `src/hooks/useInventory.ts` | Add `useAddBulkServiceInventoryLinks` mutation |
| **Modify** | `src/components/services/inventory/ServiceLinksView.tsx` | Replace column browser; wire new layout |
| **Unchanged** | `src/components/services/inventory/ServiceLeafPanel.tsx` | Reused as-is for single-select mode |
| **Unchanged** | `src/components/services/inventory/InventoryColumnPicker.tsx` | Reused in bulk panel |
| **Unchanged** | `src/components/services/inventory/serviceInventoryHelpers.ts` | Types unchanged |

---

## Task 1: Database — Bulk Upsert RPC

**Files:**
- Create: `supabase/migrations/20260503120000_service_inventory_bulk_upsert.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260503120000_service_inventory_bulk_upsert.sql

CREATE OR REPLACE FUNCTION service_inventory_bulk_upsert(
  p_service_ids      uuid[],
  p_brand_variant_id uuid,
  p_link_type        text    DEFAULT 'supply',
  p_quantity         numeric DEFAULT 1,
  p_warranty_months  int     DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO service_inventory
    (service_id, brand_variant_id, link_type, quantity, warranty_months)
  SELECT
    unnest(p_service_ids),
    p_brand_variant_id,
    p_link_type,
    p_quantity,
    p_warranty_months
  ON CONFLICT (service_id, brand_variant_id) DO NOTHING;
END;
$$;
```

`ON CONFLICT DO NOTHING` satisfies the idempotency requirement — services already linked to the variant are silently skipped and the rest succeed.

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected output contains: `Applying migration 20260503120000_service_inventory_bulk_upsert.sql`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260503120000_service_inventory_bulk_upsert.sql
git commit -m "$(cat <<'EOF'
feat(db): add service_inventory_bulk_upsert RPC for atomic bulk linking

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Hook — useAddBulkServiceInventoryLinks

**Files:**
- Modify: `src/hooks/useInventory.ts`

- [ ] **Step 1: Locate the existing mutations block in useInventory.ts**

Open `src/hooks/useInventory.ts`. Find `useAddServiceInventoryLink` — the new mutation goes directly after it.

- [ ] **Step 2: Add the bulk mutation**

Insert after `useAddServiceInventoryLink`:

```typescript
export function useAddBulkServiceInventoryLinks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      serviceIds,
      brandVariantId,
      linkType = 'supply' as const,
      quantity = 1,
      warrantyMonths = 0,
    }: {
      serviceIds: string[]
      brandVariantId: string
      linkType?: 'supply' | 'consumable'
      quantity?: number
      warrantyMonths?: number
    }) => {
      const { error } = await supabase.rpc('service_inventory_bulk_upsert', {
        p_service_ids: serviceIds,
        p_brand_variant_id: brandVariantId,
        p_link_type: linkType,
        p_quantity: quantity,
        p_warranty_months: warrantyMonths,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-inventory-links'] })
    },
  })
}
```

Note: verify that `['service-inventory-links']` matches the `queryKey` used by `useAllServiceLinks` in this same file. If it differs, use the exact key from that query.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors referencing `useAddBulkServiceInventoryLinks` or the RPC call.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useInventory.ts
git commit -m "$(cat <<'EOF'
feat(services): add useAddBulkServiceInventoryLinks hook

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: ServiceLinksMasterList Component

**Files:**
- Create: `src/components/services/inventory/ServiceLinksMasterList.tsx`

This is the left panel: sticky search bar, stat bar, scrollable list of leaf services (grouped by top-level category when no search, flattened when searching).

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ServiceNode, ServiceInventoryLinkFull } from './serviceInventoryHelpers'

interface Props {
  leafServices: ServiceNode[]
  breadcrumbMap: Map<string, string>
  hasSupplySet: Set<string>
  activeId: string | null
  checkedIds: Set<string>
  onActivate: (id: string) => void
  onToggleCheck: (id: string) => void
  totalCount: number
  linkedCount: number
  noSupplyCount: number
}

export function ServiceLinksMasterList({
  leafServices,
  breadcrumbMap,
  hasSupplySet,
  activeId,
  checkedIds,
  onActivate,
  onToggleCheck,
  totalCount,
  linkedCount,
  noSupplyCount,
}: Props) {
  const [query, setQuery] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // CMD/CTRL+F focuses the search bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const trimmed = query.trim().toLowerCase()

  // Filtered flat list of leaf services
  const filteredLeaves = trimmed
    ? leafServices.filter(s => {
        const name = s.name_en.toLowerCase()
        const breadcrumb = (breadcrumbMap.get(s.id) ?? '').toLowerCase()
        return name.includes(trimmed) || breadcrumb.includes(trimmed)
      })
    : leafServices

  // Group by top-level category (first segment of breadcrumb)
  const groups = new Map<string, ServiceNode[]>()
  if (!trimmed) {
    for (const s of filteredLeaves) {
      const breadcrumb = breadcrumbMap.get(s.id) ?? s.name_en
      const cat = breadcrumb.split(' › ')[0]
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(s)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(i => Math.min(i + 1, filteredLeaves.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const s = filteredLeaves[focusedIdx]
      if (s) onActivate(s.id)
    } else if (e.key === ' ') {
      e.preventDefault()
      const s = filteredLeaves[focusedIdx]
      if (s) onToggleCheck(s.id)
    }
  }

  const renderRow = (service: ServiceNode, idx: number) => {
    const breadcrumb = breadcrumbMap.get(service.id) ?? ''
    const isActive = activeId === service.id
    const isChecked = checkedIds.has(service.id)
    const hasSupply = hasSupplySet.has(service.id)
    const isFocused = focusedIdx === filteredLeaves.indexOf(service)

    let rowCls =
      'group relative flex items-start gap-2 px-3 py-2 cursor-pointer select-none border-l-[3px] transition-colors'
    if (isActive) {
      rowCls += ' bg-blue-100 border-l-primary'
    } else if (isChecked) {
      rowCls += ' bg-blue-50 border-l-transparent'
    } else if (isFocused) {
      rowCls += ' bg-muted/40 border-l-transparent'
    } else {
      rowCls += ' border-l-transparent hover:bg-muted/40'
    }

    return (
      <div
        key={service.id}
        className={rowCls}
        onClick={() => onActivate(service.id)}
        role="option"
        aria-selected={isActive}
      >
        {/* Checkbox — visible on hover or when checked */}
        <div
          className={`mt-0.5 shrink-0 transition-opacity ${isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          onClick={e => { e.stopPropagation(); onToggleCheck(service.id) }}
        >
          <Checkbox checked={isChecked} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground leading-tight truncate">
            {breadcrumb.split(' › ').slice(0, -1).join(' › ')}
          </p>
          <p className="text-sm font-medium leading-snug break-words">
            {service.name_en}
          </p>
        </div>

        {/* Status dot */}
        <div className="mt-1 shrink-0">
          <span
            className={`inline-block w-2 h-2 rounded-full ${hasSupply ? 'bg-green-500' : 'bg-amber-400'}`}
            title={hasSupply ? 'Supply linked' : 'No supply'}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full border-r">
      {/* Search bar */}
      <div className="p-3 border-b sticky top-0 bg-background z-10">
        <Input
          ref={searchRef}
          placeholder={`Search ${totalCount} services…`}
          value={query}
          onChange={e => { setQuery(e.target.value); setFocusedIdx(0) }}
          onKeyDown={handleKeyDown}
          className="h-9"
        />
      </div>

      {/* Stat bar */}
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/30 shrink-0">
        <span className="font-medium text-foreground">{filteredLeaves.length}</span> services
        {' · '}
        <span className="text-green-600 font-medium">{linkedCount}</span> linked
        {' · '}
        <span className="text-amber-500 font-medium">{noSupplyCount}</span> no supply
      </div>

      {/* List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
        role="listbox"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {trimmed ? (
          // Flat search results
          filteredLeaves.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">No services match "{query}"</p>
          ) : (
            filteredLeaves.map((s, i) => renderRow(s, i))
          )
        ) : (
          // Grouped by category
          Array.from(groups.entries()).map(([cat, leaves]) => (
            <div key={cat}>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/20 sticky top-0">
                {cat}
                <span className="ml-1 font-normal normal-case">
                  ({leaves.length})
                </span>
              </div>
              {leaves.map((s, i) => renderRow(s, i))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `ServiceLinksMasterList.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/ServiceLinksMasterList.tsx
git commit -m "$(cat <<'EOF'
feat(services): add ServiceLinksMasterList — search, grouped list, keyboard nav

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: ServiceLinksZeroState Component

**Files:**
- Create: `src/components/services/inventory/ServiceLinksZeroState.tsx`

Shown in the right panel when nothing is selected. Displays a category-by-category horizontal bar chart (CSS, no chart library) and a prompt.

- [ ] **Step 1: Create the component**

```tsx
import { ServiceNode, ServiceInventoryLinkFull } from './serviceInventoryHelpers'

interface Props {
  leafServices: ServiceNode[]
  allLinks: ServiceInventoryLinkFull[]
  breadcrumbMap: Map<string, string>
  hasSupplySet: Set<string>
}

export function ServiceLinksZeroState({ leafServices, allLinks, breadcrumbMap, hasSupplySet }: Props) {
  // Build per-category stats
  const catStats = new Map<string, { total: number; linked: number }>()

  for (const s of leafServices) {
    const breadcrumb = breadcrumbMap.get(s.id) ?? s.name_en
    const cat = breadcrumb.split(' › ')[0]
    if (!catStats.has(cat)) catStats.set(cat, { total: 0, linked: 0 })
    const entry = catStats.get(cat)!
    entry.total++
    if (hasSupplySet.has(s.id)) entry.linked++
  }

  const rows = Array.from(catStats.entries())
    .sort((a, b) => b[1].total - a[1].total)

  const maxTotal = Math.max(...rows.map(([, v]) => v.total), 1)

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-12 gap-8">
      {/* Chart */}
      <div className="w-full max-w-md space-y-2">
        <p className="text-sm font-semibold text-foreground mb-3">Links by Category</p>
        {rows.map(([cat, { total, linked }]) => {
          const unlinked = total - linked
          const linkedPct = (linked / maxTotal) * 100
          const unlinkedPct = (unlinked / maxTotal) * 100
          return (
            <div key={cat} className="space-y-0.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="truncate max-w-[60%]">{cat}</span>
                <span>{linked}/{total}</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                {linked > 0 && (
                  <div
                    className="bg-green-500 transition-all"
                    style={{ width: `${linkedPct}%` }}
                  />
                )}
                {unlinked > 0 && (
                  <div
                    className="bg-amber-400 transition-all"
                    style={{ width: `${unlinkedPct}%` }}
                  />
                )}
              </div>
            </div>
          )
        })}

        {/* Legend */}
        <div className="flex gap-4 mt-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Linked
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            No supply
          </span>
        </div>
      </div>

      {/* Prompt */}
      <p className="text-sm text-muted-foreground text-center">
        Select a service on the left to view or edit its linked items.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `ServiceLinksZeroState.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/ServiceLinksZeroState.tsx
git commit -m "$(cat <<'EOF'
feat(services): add ServiceLinksZeroState — category link summary chart

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: ServiceLinksBulkPanel Component

**Files:**
- Create: `src/components/services/inventory/ServiceLinksBulkPanel.tsx`

Right panel for bulk-select mode (2+ checkboxes checked). Contains: selected-item picker (always visible), scrollable confirmation checklist (max-h-[300px]), progress states (button → spinner → checkmark → toast), and a link intersection summary.

- [ ] **Step 1: Read InventoryColumnPicker's props**

Open `src/components/services/inventory/InventoryColumnPicker.tsx` and note the exact prop names and types for:
- The trigger/open prop
- The `onSelect` callback signature (what arguments it passes back)

You will use those exact props in Step 2.

- [ ] **Step 2: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, Package } from 'lucide-react'
import { useAddBulkServiceInventoryLinks } from '@/hooks/useInventory'
import { ServiceNode, ServiceInventoryLinkFull } from './serviceInventoryHelpers'
// Import InventoryColumnPicker using the exact import path from ServiceLeafPanel.tsx
import { InventoryColumnPicker } from './InventoryColumnPicker'
import { toast } from 'sonner'

interface SelectedItem {
  brandVariantId: string
  displayName: string
}

interface VariantStat {
  displayName: string
  count: number
}

interface Props {
  checkedIds: Set<string>
  services: ServiceNode[]
  allLinks: ServiceInventoryLinkFull[]
  onClearAll: () => void
}

export function ServiceLinksBulkPanel({ checkedIds, services, allLinks, onClearAll }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)
  // Local copy of the checklist; pre-checked with all checkedIds
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  const bulkLink = useAddBulkServiceInventoryLinks()

  const checkedCount = checkedIds.size
  const checkedServices = services.filter(s => checkedIds.has(s.id))

  // When a new item is chosen, reset the checklist to all-checked
  const handleItemSelect = (brandVariantId: string, displayName: string) => {
    setSelectedItem({ brandVariantId, displayName })
    setConfirmedIds(new Set(checkedIds))
    setPickerOpen(false)
  }

  const toggleConfirm = (id: string) => {
    setConfirmedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleLink = async () => {
    if (!selectedItem || confirmedIds.size === 0) return
    setStatus('loading')
    try {
      await bulkLink.mutateAsync({
        serviceIds: Array.from(confirmedIds),
        brandVariantId: selectedItem.brandVariantId,
      })
      setStatus('success')
      toast.success(`Linked "${selectedItem.displayName}" to ${confirmedIds.size} service${confirmedIds.size !== 1 ? 's' : ''}`)
      setTimeout(() => {
        setStatus('idle')
        setSelectedItem(null)
        setConfirmedIds(new Set())
        onClearAll()
      }, 1500)
    } catch (err) {
      setStatus('idle')
      toast.error('Failed to link items. Please try again.')
    }
  }

  // Intersection summary: how many checked services have each variant linked
  const variantStats = new Map<string, VariantStat>()
  for (const link of allLinks) {
    if (!checkedIds.has(link.service_id)) continue
    const key = link.brand_variant_id
    const displayName = link.inventory_brand_variants
      ? `${link.inventory_brand_variants.inventory_items.name_en} — ${link.inventory_brand_variants.brand}`
      : key
    const existing = variantStats.get(key)
    if (existing) {
      existing.count++
    } else {
      variantStats.set(key, { displayName, count: 1 })
    }
  }
  const allLinkedVariants = Array.from(variantStats.values()).filter(v => v.count === checkedCount)
  const someLinkedVariants = Array.from(variantStats.values()).filter(v => v.count < checkedCount)

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {checkedCount} service{checkedCount !== 1 ? 's' : ''} selected
        </p>
        <Button variant="ghost" size="sm" onClick={onClearAll} className="text-muted-foreground h-7 px-2">
          Clear selection
        </Button>
      </div>

      {/* Add Inventory Item — always visible */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Add Inventory Item
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-left font-normal"
          onClick={() => setPickerOpen(true)}
        >
          <Package className="mr-2 h-4 w-4 shrink-0" />
          {selectedItem ? selectedItem.displayName : 'Choose an inventory item…'}
        </Button>
        {/* Pass the exact props InventoryColumnPicker expects — verify in InventoryColumnPicker.tsx */}
        <InventoryColumnPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={handleItemSelect}
        />
      </div>

      {/* Confirmation checklist — appears once an item is chosen */}
      {selectedItem && (
        <div className="space-y-2 border rounded-md p-3">
          <p className="text-xs text-muted-foreground">
            Link <span className="font-medium text-foreground">"{selectedItem.displayName}"</span> to:
          </p>

          {/* Scrollable checklist — height-capped so button stays visible */}
          <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
            {checkedServices.map(s => (
              <label
                key={s.id}
                className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/40 cursor-pointer"
              >
                <Checkbox
                  checked={confirmedIds.has(s.id)}
                  onCheckedChange={() => toggleConfirm(s.id)}
                />
                <span className="text-sm">{s.name_en}</span>
              </label>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="flex-1"
              disabled={confirmedIds.size === 0 || status === 'loading' || status === 'success'}
              onClick={handleLink}
            >
              {status === 'loading' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {status === 'success' && <CheckCircle2 className="mr-2 h-4 w-4" />}
              {status === 'idle' && `Link to ${confirmedIds.size} service${confirmedIds.size !== 1 ? 's' : ''}`}
              {status === 'loading' && 'Linking…'}
              {status === 'success' && 'Linked!'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setSelectedItem(null); setConfirmedIds(new Set()) }}
              disabled={status !== 'idle'}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Link Intersection Summary */}
      {variantStats.size > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Current Links Across Selection
          </p>

          {allLinkedVariants.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Linked to all {checkedCount}</p>
              {allLinkedVariants.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  {v.displayName}
                </div>
              ))}
            </div>
          )}

          {someLinkedVariants.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Linked to some</p>
              {someLinkedVariants.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="flex-1">{v.displayName}</span>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {v.count} of {checkedCount}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `ServiceLinksBulkPanel.tsx`. If `InventoryColumnPicker` has a different `onSelect` signature (e.g., only one argument), adjust `handleItemSelect` and the `displayName` derivation accordingly.

- [ ] **Step 4: Commit**

```bash
git add src/components/services/inventory/ServiceLinksBulkPanel.tsx
git commit -m "$(cat <<'EOF'
feat(services): add ServiceLinksBulkPanel — bulk link with checklist and intersection summary

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: ServiceLinksView — Wire New Layout

**Files:**
- Modify: `src/components/services/inventory/ServiceLinksView.tsx`

Replace the Miller-columns layout with the two-panel master-detail layout. The component already fetches all data needed; this task replaces the rendering only.

- [ ] **Step 1: Open ServiceLinksView.tsx and read the current render block**

Identify:
1. The exact names of the data variables: `services`, `allLinks` (or their actual names)
2. The exact names of the computed maps: `treeMap`, `breadcrumbMap`, `leafIds` / `leafIdSet` (or their actual names)
3. The `selectedLeafId` state and its setter
4. The `enabled` prop

- [ ] **Step 2: Add new state and derived values**

In the component body, add after the existing state declarations:

```typescript
const [activeId, setActiveId] = useState<string | null>(null)
const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

const handleToggleCheck = (id: string) => {
  setCheckedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

const handleClearAll = () => setCheckedIds(new Set())

// Derive leaf services array from the existing leafIds set and services list
// (use the actual variable names from Step 1)
const leafServices = (services ?? []).filter(s => leafIds.has(s.id))

// Which leaf services have at least one supply link
const hasSupplySet = new Set(
  (allLinks ?? [])
    .filter(l => l.link_type === 'supply' && leafIds.has(l.service_id))
    .map(l => l.service_id)
)

const linkedCount = hasSupplySet.size
const noSupplyCount = leafServices.length - linkedCount

// Determine right panel mode
const rightPanelMode: 'zero' | 'single' | 'bulk' =
  checkedIds.size >= 2 ? 'bulk' : activeId ? 'single' : 'zero'
```

- [ ] **Step 3: Replace the render return**

Replace the entire JSX return with:

```tsx
return (
  <div className="flex h-full">
    {/* Left panel — 40% */}
    <div className="w-[40%] shrink-0 flex flex-col h-full">
      <ServiceLinksMasterList
        leafServices={leafServices}
        breadcrumbMap={breadcrumbMap}
        hasSupplySet={hasSupplySet}
        activeId={activeId}
        checkedIds={checkedIds}
        onActivate={setActiveId}
        onToggleCheck={handleToggleCheck}
        totalCount={leafServices.length}
        linkedCount={linkedCount}
        noSupplyCount={noSupplyCount}
      />
    </div>

    {/* Right panel — 60% */}
    <div className="flex-1 h-full overflow-y-auto">
      {rightPanelMode === 'zero' && (
        <ServiceLinksZeroState
          leafServices={leafServices}
          allLinks={allLinks ?? []}
          breadcrumbMap={breadcrumbMap}
          hasSupplySet={hasSupplySet}
        />
      )}

      {rightPanelMode === 'single' && activeId && (
        // ServiceLeafPanel already accepts selectedLeafId — pass activeId as that prop.
        // Verify the exact prop name by reading ServiceLeafPanel.tsx.
        <ServiceLeafPanel
          selectedLeafId={activeId}
          services={services ?? []}
          allLinks={allLinks ?? []}
          breadcrumbMap={breadcrumbMap}
        />
      )}

      {rightPanelMode === 'bulk' && (
        <ServiceLinksBulkPanel
          checkedIds={checkedIds}
          services={services ?? []}
          allLinks={allLinks ?? []}
          onClearAll={handleClearAll}
        />
      )}
    </div>
  </div>
)
```

- [ ] **Step 4: Add missing imports at the top of ServiceLinksView.tsx**

```typescript
import { ServiceLinksMasterList } from './ServiceLinksMasterList'
import { ServiceLinksZeroState } from './ServiceLinksZeroState'
import { ServiceLinksBulkPanel } from './ServiceLinksBulkPanel'
```

Remove the import for `ServiceLinksColumnBrowser` (it is no longer used).

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. Common issues to fix:
- `ServiceLeafPanel` prop names differ from `selectedLeafId` — check the actual prop names in `ServiceLeafPanel.tsx` and correct accordingly
- The `services` / `allLinks` variable names inside `ServiceLinksView` differ from the names used in Step 2 — use the actual names from Step 1

- [ ] **Step 6: Open the browser and verify**

Navigate to `http://localhost:3000/master-data/services?subtab=service-links`.

Check:
- [ ] Left panel shows grouped list with category headers and full service names (no truncation)
- [ ] Search filters the list and flattens it (no category headers, breadcrumb visible on each row)
- [ ] Clicking a service row loads the right panel in single-select mode (ServiceLeafPanel)
- [ ] Zero state shows the bar chart when nothing is clicked
- [ ] Checking 2+ checkboxes switches the right panel to bulk mode (ServiceLinksBulkPanel)
- [ ] Status dots are green for linked services, amber for unlinked
- [ ] CMD/CTRL+F focuses the search bar
- [ ] Arrow keys move focus through the list; Enter activates; Space toggles checkbox

- [ ] **Step 7: Commit**

```bash
git add src/components/services/inventory/ServiceLinksView.tsx
git commit -m "$(cat <<'EOF'
feat(services): replace Miller columns with search-first master-detail layout

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Responsive Behaviour

**Files:**
- Modify: `src/components/services/inventory/ServiceLinksView.tsx`

On tablet (`md`, 640–1023px), the left panel takes full width and tapping a row opens the right panel as a bottom sheet. On mobile (`< sm`), the right panel is a full-screen sheet.

- [ ] **Step 1: Wrap panels in responsive containers**

Replace the outer `<div className="flex h-full">` with:

```tsx
<div className="flex h-full">
  {/* Left panel: full-width on mobile/tablet, 40% on desktop */}
  <div
    className={`
      h-full flex flex-col
      w-full lg:w-[40%] lg:shrink-0
      ${rightPanelMode !== 'zero' ? 'hidden lg:flex' : 'flex'}
    `}
  >
    <ServiceLinksMasterList ... />
  </div>

  {/* Right panel: hidden on mobile when nothing selected */}
  <div
    className={`
      flex-1 h-full overflow-y-auto
      ${rightPanelMode === 'zero' ? 'hidden lg:block' : 'block'}
    `}
  >
    ...
  </div>
</div>
```

Add a back button inside the right panel (visible only on `< lg`) to return to the list:

```tsx
{/* Back button — mobile/tablet only */}
<div className="lg:hidden border-b p-2">
  <Button variant="ghost" size="sm" onClick={() => { setActiveId(null); setCheckedIds(new Set()) }}>
    ← Back to list
  </Button>
</div>
```

Place the back button as the first child inside the right panel `<div>`, before the mode switch.

- [ ] **Step 2: Verify at multiple viewports**

Check at:
- 1280px (desktop): two panels side by side
- 768px (tablet): list shown; tapping a row hides list and shows right panel with back button
- 375px (mobile): same as tablet

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/ServiceLinksView.tsx
git commit -m "$(cat <<'EOF'
feat(services): responsive master-detail — bottom-sheet on tablet/mobile

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

| Spec Requirement | Covered By |
|---|---|
| Search bar with CMD+F shortcut | Task 3 — `ServiceLinksMasterList` |
| Flattened search results with breadcrumb | Task 3 — `filteredLeaves` + grouped fallback |
| Stat bar (total · linked · no supply) | Task 3 — stat bar |
| Row: breadcrumb + full name + status dot | Task 3 — `renderRow` |
| Row visual states (hover / checked / active / both) | Task 3 — `rowCls` logic |
| Zero state chart (links by category) | Task 4 — `ServiceLinksZeroState` |
| Single-select right panel | Task 6 — `ServiceLeafPanel` reused |
| Bulk-select: picker always visible | Task 5 — above checklist |
| Bulk-select: checklist max-h-[300px] | Task 5 — `max-h-[300px] overflow-y-auto` |
| Bulk-select: uncheck exceptions | Task 5 — `toggleConfirm` |
| Bulk-select: button label updates live | Task 5 — `confirmedIds.size` in button label |
| Bulk-select: spinner → checkmark → toast → clear | Task 5 — `status` state machine |
| Atomic bulk API call | Task 1 (RPC) + Task 2 (hook) |
| Idempotency — ON CONFLICT DO NOTHING | Task 1 — SQL |
| Intersection summary (all / some) | Task 5 — `variantStats` |
| Responsive: mobile/tablet back button | Task 7 |
| Keyboard nav (↑↓ Enter Space) | Task 3 — `handleKeyDown` |
