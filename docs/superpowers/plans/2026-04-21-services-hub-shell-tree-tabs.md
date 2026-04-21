# Services Hub — Shell, Tree Tabs & Edit Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/master-data/services` — the page shell, three tree-based tabs (Normal / Contract / Mobile App), the recursive `ServiceTree` renderer, and the full-featured `ServiceEditDialog`, plus a dashboard layout refactor that enables full-bleed hub pages.

**Architecture:** Recursive `ServiceTree` component (Option B from brainstorm) — takes a flat `Service[]` from Supabase, builds a `parentId → children[]` map client-side, renders rows recursively. Three tabs share the same renderer. A new `PageWrapper` shared component replaces the removed `p-6` from the dashboard layout. All mutations write to `activity_log` for audit trail.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase (browser `createClient()`) · TanStack Query v5 · shadcn/ui · Tailwind CSS · Zod · react-hook-form · Lucide icons · Sonner toasts

**Design spec:** `docs/superpowers/specs/2026-04-21-services-hub-shell-tree-tabs-design.md`

---

## ⚠️ Critical DB Facts (read before writing any query)

| Item | Detail |
|---|---|
| `services.division` | Enum type — values: `"maintenance" \| "cleaning" \| "kitchen" \| "pest-control"`. When filtering, pass slug strings and cast: `.in('division', slugs as any)` |
| `services.qc_checklist` | Already exists as `boolean \| null` — **do NOT add this column in migration** |
| `services.spare_parts` | Already exists as `boolean \| null` — **do NOT add this column in migration** |
| `services.contract_type` | Enum — `"preventive" \| "area" \| "general"` |
| `services.status` | Enum — `"active" \| "inactive"` |
| `activity_log.module` | Exists in DB but **not in TypeScript types** — always cast `supabase.from('activity_log') as any` when inserting |
| `divisions.slug` | Use this as the filter value that matches `services.division` enum values |

---

## File Map

```
supabase/migrations/
  20260421000000_services_feature_flags.sql     NEW — indexes only (columns already exist)

src/components/shared/
  PageWrapper.tsx                               NEW
  DivisionMultiSelect.tsx                       NEW

src/hooks/
  useServices.ts                                NEW

src/components/services/                        NEW FOLDER
  ServiceTree.tsx
  ServiceTableView.tsx
  ContractTableView.tsx
  ServiceEditDialog.tsx

src/app/(dashboard)/
  layout.tsx                                    EDIT — remove p-6 from <main>
  page.tsx                                      EDIT — wrap in PageWrapper
  master-data/services/page.tsx                 NEW

src/app/(dashboard)/master-data/
  inventory/page.tsx                            EDIT — wrap in PageWrapper
  suppliers/page.tsx                            EDIT — wrap in PageWrapper
  users/page.tsx                                EDIT — wrap in PageWrapper
  audit-trail/page.tsx                          EDIT — wrap in PageWrapper
  import/page.tsx                               EDIT — wrap in PageWrapper
  admin/page.tsx                                EDIT — wrap in PageWrapper
  admin/companies/page.tsx                      EDIT — wrap in PageWrapper
  admin/warehouses/page.tsx                     EDIT — wrap in PageWrapper
  admin/brand-groups/page.tsx                   EDIT — wrap in PageWrapper
  admin/reason-lists/page.tsx                   EDIT — wrap in PageWrapper

src/app/(dashboard)/purchase/
  approvals/page.tsx                            EDIT — wrap in PageWrapper
  bills/page.tsx                                EDIT — wrap in PageWrapper
  dead-stock/page.tsx                           EDIT — wrap in PageWrapper
  landed-costs/page.tsx                         EDIT — wrap in PageWrapper
  orders/page.tsx                               EDIT — wrap in PageWrapper
  payments/page.tsx                             EDIT — wrap in PageWrapper
  receivals/page.tsx                            EDIT — wrap in PageWrapper
  rfq/page.tsx                                  EDIT — wrap in PageWrapper
  shipments/page.tsx                            EDIT — wrap in PageWrapper

src/app/(dashboard)/sales/
  credit-notes/page.tsx                         EDIT — wrap in PageWrapper
  deliveries/page.tsx                           EDIT — wrap in PageWrapper
  invoices/page.tsx                             EDIT — wrap in PageWrapper
  orders/page.tsx                               EDIT — wrap in PageWrapper
  payments/page.tsx                             EDIT — wrap in PageWrapper
  returns/page.tsx                              EDIT — wrap in PageWrapper

src/components/layout/
  nav-config.ts                                 EDIT — remove comingSoon from Services
```

---

## Task 1: DB Migration — Indexes

**Files:**
- Create: `supabase/migrations/20260421000000_services_feature_flags.sql`

> Note: `qc_checklist` and `spare_parts` columns already exist in the DB (`database.types.ts` confirms). This migration only adds performance indexes.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260421000000_services_feature_flags.sql

-- Tree lookups filter by tree_type + parent_id on every tab load.
-- Without this, each tab load does a full table scan as the catalog grows.
CREATE INDEX IF NOT EXISTS idx_services_tree_type_parent
  ON services (tree_type, parent_id);

-- Division filter is applied on every tree tab via .in('division', slugs).
CREATE INDEX IF NOT EXISTS idx_services_division
  ON services (division);
```

- [ ] **Step 2: Apply the migration to local Supabase**

```bash
npx supabase db push
```

Expected: migration applied without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260421000000_services_feature_flags.sql
git commit -m "feat(services): add tree_type+parent_id and division indexes for tree performance"
```

---

## Task 2: PageWrapper Component + Dashboard Layout Change

**Files:**
- Create: `src/components/shared/PageWrapper.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

> This change removes `p-6` from the dashboard `<main>` so that hub pages (Services, Warehouses) can go full-height. All standard pages will get their padding back via `<PageWrapper>` in the next task.

- [ ] **Step 1: Create PageWrapper**

```tsx
// src/components/shared/PageWrapper.tsx
export function PageWrapper({ children }: { children: React.ReactNode }) {
  return <div className="p-6 space-y-6">{children}</div>
}
```

- [ ] **Step 2: Update the dashboard layout**

Open `src/app/(dashboard)/layout.tsx`. Change the `<main>` line:

```tsx
// Before:
<main className="flex-1 p-6">

// After:
<main className="flex-1 overflow-hidden flex flex-col">
```

The full file should look like:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopNav } from '@/components/layout/TopNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <TopNav />
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript is clean**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (pages will look unstyled but types are fine).

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/PageWrapper.tsx src/app/(dashboard)/layout.tsx
git commit -m "feat(layout): add PageWrapper, remove p-6 from dashboard main to support full-bleed hub pages"
```

---

## Task 3: Wrap All Standard Pages in PageWrapper

**Files:** ~20 page files (see File Map above)

> Pattern for every page: add `import { PageWrapper } from '@/components/shared/PageWrapper'` then wrap the root return element.

- [ ] **Step 1: Wrap the dashboard home page**

`src/app/(dashboard)/page.tsx` — find the root `return (` and wrap:

```tsx
import { PageWrapper } from '@/components/shared/PageWrapper'

// In the return:
return (
  <PageWrapper>
    {/* existing content unchanged */}
  </PageWrapper>
)
```

- [ ] **Step 2: Wrap all master-data pages**

Apply the same pattern to each of these files — add the import, wrap the root element:
- `src/app/(dashboard)/master-data/inventory/page.tsx`
- `src/app/(dashboard)/master-data/suppliers/page.tsx`
- `src/app/(dashboard)/master-data/users/page.tsx`
- `src/app/(dashboard)/master-data/audit-trail/page.tsx`
- `src/app/(dashboard)/master-data/import/page.tsx`
- `src/app/(dashboard)/master-data/admin/page.tsx`
- `src/app/(dashboard)/master-data/admin/companies/page.tsx`
- `src/app/(dashboard)/master-data/admin/warehouses/page.tsx`
- `src/app/(dashboard)/master-data/admin/brand-groups/page.tsx`
- `src/app/(dashboard)/master-data/admin/reason-lists/page.tsx`

- [ ] **Step 3: Wrap all purchase pages**

Apply to each:
- `src/app/(dashboard)/purchase/approvals/page.tsx`
- `src/app/(dashboard)/purchase/bills/page.tsx`
- `src/app/(dashboard)/purchase/dead-stock/page.tsx`
- `src/app/(dashboard)/purchase/landed-costs/page.tsx`
- `src/app/(dashboard)/purchase/orders/page.tsx`
- `src/app/(dashboard)/purchase/payments/page.tsx`
- `src/app/(dashboard)/purchase/receivals/page.tsx`
- `src/app/(dashboard)/purchase/rfq/page.tsx`
- `src/app/(dashboard)/purchase/shipments/page.tsx`

> Skip `purchase/create-po`, `purchase/edit-po/[id]`, and `purchase/warehouses` — these are already full-page layouts that manage their own spacing.

- [ ] **Step 4: Wrap all sales pages**

Apply to each:
- `src/app/(dashboard)/sales/credit-notes/page.tsx`
- `src/app/(dashboard)/sales/deliveries/page.tsx`
- `src/app/(dashboard)/sales/invoices/page.tsx`
- `src/app/(dashboard)/sales/orders/page.tsx`
- `src/app/(dashboard)/sales/payments/page.tsx`
- `src/app/(dashboard)/sales/returns/page.tsx`

> Skip `sales/create-so` and `sales/edit-so/[id]` — same reason as above.

- [ ] **Step 5: Verify TypeScript is clean**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/page.tsx \
  src/app/(dashboard)/master-data \
  src/app/(dashboard)/purchase/approvals \
  src/app/(dashboard)/purchase/bills \
  src/app/(dashboard)/purchase/dead-stock \
  src/app/(dashboard)/purchase/landed-costs \
  src/app/(dashboard)/purchase/orders \
  src/app/(dashboard)/purchase/payments \
  src/app/(dashboard)/purchase/receivals \
  src/app/(dashboard)/purchase/rfq \
  src/app/(dashboard)/purchase/shipments \
  src/app/(dashboard)/sales
git commit -m "feat(layout): wrap all standard pages in PageWrapper to restore p-6 spacing"
```

---

## Task 4: useServices Hook

**Files:**
- Create: `src/hooks/useServices.ts`

- [ ] **Step 1: Create the hook file with types and useServiceTree**

```ts
// src/hooks/useServices.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type Service = DBTable<'services'>
export type ServiceInsert = DBInsert<'services'>
export type ServiceUpdate = DBUpdate<'services'>
export type Instruction = DBTable<'instructions'>

export function useServiceTree(
  treeType: string,
  divisionSlugs: string[],
  enabled = true,
) {
  return useQuery({
    queryKey: ['services', treeType, divisionSlugs],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from('services') as any)
        .select('*')
        .eq('tree_type', treeType)
        .order('sort_order', { ascending: true })
      if (divisionSlugs.length > 0) {
        query = query.in('division', divisionSlugs)
      }
      const { data, error } = await query
      if (error) throw error
      return data as Service[]
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 2: Add useInstructions**

```ts
export function useInstructions(enabled = true) {
  return useQuery({
    queryKey: ['instructions'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('instructions')
        .select('id, name_en, name_ar')
        .order('name_en')
      if (error) throw error
      return data as Pick<Instruction, 'id' | 'name_en' | 'name_ar'>[]
    },
    enabled,
    staleTime: 10 * 60 * 1000,
  })
}
```

- [ ] **Step 3: Add useCreateService**

```ts
export function useCreateService() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: ServiceInsert & { treeType: string }) => {
      const supabase = createClient()
      const { treeType, ...payload } = values
      const { data, error } = await supabase
        .from('services')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('activity_log') as any).insert({
        action: 'services/service-created',
        module: 'services',
        entity_type: 'service',
        entity_id: data.id,
        details: JSON.stringify({
          name_en: data.name_en,
          tree_type: data.tree_type,
          parent_id: data.parent_id,
        }),
      })
      return { ...data, treeType }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['services', data.treeType] })
    },
  })
}
```

- [ ] **Step 4: Add useUpdateService**

```ts
export function useUpdateService() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      values: ServiceUpdate & { id: string; treeType: string; changedFields: string[] },
    ) => {
      const supabase = createClient()
      const { id, treeType, changedFields, ...payload } = values
      const { data, error } = await supabase
        .from('services')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('activity_log') as any).insert({
        action: 'services/service-updated',
        module: 'services',
        entity_type: 'service',
        entity_id: id,
        details: JSON.stringify({ changed_fields: changedFields }),
      })
      return { ...data, treeType }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['services', data.treeType] })
    },
  })
}
```

- [ ] **Step 5: Add useReorderServices**

```ts
export function useReorderServices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      movedId,
      parentId,
      direction,
      treeType,
    }: {
      movedId: string
      parentId: string | null
      direction: 'up' | 'down'
      treeType: string
    }) => {
      const supabase = createClient()
      // Re-fetch live siblings to handle sort_order gaps from concurrent inserts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let siblingsQuery = (supabase.from('services') as any)
        .select('id, sort_order')
        .eq('tree_type', treeType)
        .order('sort_order', { ascending: true })
      if (parentId) {
        siblingsQuery = siblingsQuery.eq('parent_id', parentId)
      } else {
        siblingsQuery = siblingsQuery.is('parent_id', null)
      }
      const { data: siblings, error: fetchErr } = await siblingsQuery
      if (fetchErr) throw fetchErr

      const idx = (siblings as { id: string; sort_order: number }[]).findIndex(
        (s) => s.id === movedId,
      )
      if (idx === -1) throw new Error('Service not found in siblings')
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= siblings.length) return null // boundary

      const moved = siblings[idx] as { id: string; sort_order: number }
      const sibling = siblings[targetIdx] as { id: string; sort_order: number }

      await Promise.all([
        supabase.from('services').update({ sort_order: sibling.sort_order }).eq('id', moved.id),
        supabase.from('services').update({ sort_order: moved.sort_order }).eq('id', sibling.id),
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('activity_log') as any).insert({
        action: 'services/service-reordered',
        module: 'services',
        entity_type: 'service',
        entity_id: movedId,
        details: JSON.stringify({
          direction,
          from_sort_order: moved.sort_order,
          to_sort_order: sibling.sort_order,
          swapped_with_id: sibling.id,
        }),
      })

      return { treeType }
    },
    onSuccess: (result) => {
      if (result) {
        queryClient.invalidateQueries({ queryKey: ['services', result.treeType] })
      }
    },
  })
}
```

- [ ] **Step 6: Verify TypeScript is clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useServices.ts
git commit -m "feat(services): add useServices hook (useServiceTree, useInstructions, useCreateService, useUpdateService, useReorderServices)"
```

---

## Task 5: DivisionMultiSelect Shared Component

**Files:**
- Create: `src/components/shared/DivisionMultiSelect.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/shared/DivisionMultiSelect.tsx
'use client'

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDivisions } from '@/hooks/useDivisions'

interface DivisionMultiSelectProps {
  value: string[]
  onChange: (slugs: string[]) => void
  className?: string
}

export function DivisionMultiSelect({ value, onChange, className }: DivisionMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const { data: divisions = [] } = useDivisions()

  function toggle(slug: string) {
    onChange(value.includes(slug) ? value.filter((s) => s !== slug) : [...value, slug])
  }

  const label =
    value.length === 0
      ? 'All Divisions'
      : `${value.length} division${value.length > 1 ? 's' : ''}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-7 w-[200px] text-[11px] justify-between font-normal', className)}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 ml-1 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-1" align="start">
        <div className="max-h-48 overflow-y-auto">
          {divisions.map((div) => (
            <button
              key={div.slug}
              onClick={() => toggle(div.slug)}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-accent rounded text-left"
            >
              <Check
                className={cn('h-3 w-3 shrink-0', value.includes(div.slug) ? 'opacity-100' : 'opacity-0')}
              />
              {div.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Verify TypeScript is clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/DivisionMultiSelect.tsx
git commit -m "feat(shared): add DivisionMultiSelect reusable component"
```

---

## Task 6: ServiceTree Component

**Files:**
- Create: `src/components/services/ServiceTree.tsx`

> This is the core recursive tree renderer shared by all three tree tabs. Create the `src/components/services/` folder first.

- [ ] **Step 1: Create the component**

```tsx
// src/components/services/ServiceTree.tsx
'use client'

import { useState, useMemo } from 'react'
import {
  ChevronRight, Package, Bell, FileText, ClipboardCheck,
  Wrench, ArrowUp, ArrowDown, Plus, Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Service } from '@/hooks/useServices'

export interface ReorderArgs {
  movedId: string
  parentId: string | null
  direction: 'up' | 'down'
  treeType: string
}

export interface ExtraColumn {
  key: string
  cell: (service: Service) => React.ReactNode
}

interface ServiceTreeProps {
  data: Service[]
  isLoading: boolean
  error: Error | null
  featureFilters: Set<string>
  treeType: string
  onEdit: (node: Service) => void
  onAddChild: (parentId: string) => void
  onReorder: (args: ReorderArgs) => void
  extraColumns?: ExtraColumn[]
}

function buildTreeMap(flat: Service[]): Map<string | null, Service[]> {
  const map = new Map<string | null, Service[]>()
  for (const s of flat) {
    const key = s.parent_id ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return map
}

// Exported for use by ServiceEditDialog circular-reference guard
export function collectDescendantIds(
  nodeId: string,
  treeMap: Map<string | null, Service[]>,
): Set<string> {
  const result = new Set<string>()
  function recurse(id: string) {
    const children = treeMap.get(id) ?? []
    for (const child of children) {
      result.add(child.id)
      recurse(child.id)
    }
  }
  recurse(nodeId)
  return result
}

export function ServiceTree({
  data,
  isLoading,
  error,
  featureFilters,
  treeType,
  onEdit,
  onAddChild,
  onReorder,
  extraColumns = [],
}: ServiceTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const treeMap = useMemo(() => buildTreeMap(data), [data])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-32 items-center justify-center px-4 text-sm text-destructive">
        Failed to load this section: {error.message}
      </div>
    )
  }

  const roots = treeMap.get(null) ?? []
  if (roots.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No services found
      </div>
    )
  }

  function renderNode(service: Service, depth: number) {
    const children = treeMap.get(service.id) ?? []
    const hasChildren = children.length > 0
    const isExpanded = expanded.has(service.id)
    const siblings = treeMap.get(service.parent_id ?? null) ?? []
    const siblingIdx = siblings.findIndex((s) => s.id === service.id)
    const isFirst = siblingIdx === 0
    const isLast = siblingIdx === siblings.length - 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = service as any

    return (
      <div key={service.id}>
        {/* Outer div: full width, group for hover, relative for absolute actions */}
        <div className="group relative flex items-center px-4 py-1.5 hover:bg-accent min-h-[32px]">
          {/* Inner name wrapper: only this gets the indent (RTL-safe logical property) */}
          <div
            className="flex items-center gap-1 min-w-0 flex-1"
            style={{ paddingInlineStart: depth * 20 }}
          >
            {hasChildren ? (
              <button
                onClick={() => toggleExpand(service.id)}
                className="flex-shrink-0 p-0.5 rounded hover:bg-accent-foreground/10"
              >
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 text-muted-foreground transition-transform duration-150',
                    isExpanded && 'rotate-90',
                  )}
                />
              </button>
            ) : (
              <span className="w-4 flex-shrink-0" />
            )}

            <span className="text-xs font-medium truncate">{service.name_en}</span>
            {service.name_ar && (
              <span className="text-[11px] text-muted-foreground ml-1.5 truncate hidden sm:inline">
                {service.name_ar}
              </span>
            )}

            {/* Feature badges — hidden on mobile, shown on md+ when filter is active */}
            {featureFilters.has('inventory') &&
              (Array.isArray(svc.inventory_items)
                ? svc.inventory_items.length > 0
                : !!svc.inventory_items) && (
                <Badge variant="secondary" className="text-[10px] gap-1 ml-2 hidden md:flex">
                  <Package className="h-3 w-3" />
                </Badge>
              )}
            {featureFilters.has('reminders') && service.reminder_days != null && (
              <Badge variant="secondary" className="text-[10px] gap-1 ml-1 hidden md:flex">
                <Bell className="h-3 w-3" />
              </Badge>
            )}
            {featureFilters.has('instructions') && service.instructions && (
              <Badge variant="secondary" className="text-[10px] gap-1 ml-1 hidden md:flex">
                <FileText className="h-3 w-3" />
              </Badge>
            )}
            {featureFilters.has('qc') && svc.qc_checklist && (
              <Badge variant="secondary" className="text-[10px] gap-1 ml-1 hidden md:flex">
                <ClipboardCheck className="h-3 w-3" />
              </Badge>
            )}
            {featureFilters.has('parts') && svc.spare_parts && (
              <Badge variant="secondary" className="text-[10px] gap-1 ml-1 hidden md:flex">
                <Wrench className="h-3 w-3" />
              </Badge>
            )}

            {extraColumns.map((col) => (
              <span key={col.key} className="ml-3 text-[11px] text-muted-foreground hidden md:inline">
                {col.cell(service)}
              </span>
            ))}
          </div>

          {/* Hover actions: absolute right, z-10 ensures they clear sticky header */}
          <div className="opacity-0 group-hover:opacity-100 absolute right-4 flex items-center gap-1 z-10 bg-accent/80 rounded px-1">
            {!isFirst && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 min-h-[44px] sm:min-h-0"
                onClick={() =>
                  onReorder({
                    movedId: service.id,
                    parentId: service.parent_id ?? null,
                    direction: 'up',
                    treeType,
                  })
                }
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
            )}
            {!isLast && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 min-h-[44px] sm:min-h-0"
                onClick={() =>
                  onReorder({
                    movedId: service.id,
                    parentId: service.parent_id ?? null,
                    direction: 'down',
                    treeType,
                  })
                }
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 min-h-[44px] sm:min-h-0"
              onClick={() => onAddChild(service.id)}
            >
              <Plus className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 min-h-[44px] sm:min-h-0"
              onClick={() => onEdit(service)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {hasChildren && isExpanded && children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  return <div className="py-1">{roots.map((root) => renderNode(root, 0))}</div>
}
```

- [ ] **Step 2: Verify TypeScript is clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/services/ServiceTree.tsx
git commit -m "feat(services): add ServiceTree recursive renderer with feature badges, reorder, add-child"
```

---

## Task 7: ServiceTableView + ContractTableView

**Files:**
- Create: `src/components/services/ServiceTableView.tsx`
- Create: `src/components/services/ContractTableView.tsx`

- [ ] **Step 1: Create ServiceTableView**

```tsx
// src/components/services/ServiceTableView.tsx
'use client'

import { ServiceTree, type ReorderArgs } from './ServiceTree'
import { useServiceTree, useReorderServices, type Service } from '@/hooks/useServices'

interface ServiceTableViewProps {
  serviceType: 'normal' | 'mobile'
  divisionFilter: string[]
  featureFilters: Set<string>
  enabled: boolean
  onEdit: (node: Service) => void
  onAddChild: (parentId: string) => void
}

export function ServiceTableView({
  serviceType,
  divisionFilter,
  featureFilters,
  enabled,
  onEdit,
  onAddChild,
}: ServiceTableViewProps) {
  const { data = [], isLoading, error } = useServiceTree(serviceType, divisionFilter, enabled)
  const reorder = useReorderServices()

  return (
    <ServiceTree
      data={data}
      isLoading={isLoading}
      error={error ?? null}
      featureFilters={featureFilters}
      treeType={serviceType}
      onEdit={onEdit}
      onAddChild={onAddChild}
      onReorder={(args: ReorderArgs) => reorder.mutate(args)}
    />
  )
}
```

- [ ] **Step 2: Create ContractTableView**

```tsx
// src/components/services/ContractTableView.tsx
'use client'

import { useMemo } from 'react'
import { ServiceTree, type ReorderArgs } from './ServiceTree'
import { useServiceTree, useReorderServices, type Service } from '@/hooks/useServices'
import { formatCurrency } from '@/lib/utils/formatters'

interface ContractTableViewProps {
  typeFilter: 'all' | 'preventive' | 'area' | 'general'
  divisionFilter: string[]
  enabled: boolean
  onEdit: (node: Service) => void
  onAddChild: (parentId: string) => void
}

export function ContractTableView({
  typeFilter,
  divisionFilter,
  enabled,
  onEdit,
  onAddChild,
}: ContractTableViewProps) {
  const { data = [], isLoading, error } = useServiceTree('contract', divisionFilter, enabled)
  const reorder = useReorderServices()

  const filtered = useMemo(
    () =>
      typeFilter === 'all'
        ? data
        : data.filter((s) => s.contract_type === typeFilter),
    [data, typeFilter],
  )

  const extraColumns =
    typeFilter === 'area'
      ? [
          {
            key: 'price_per_area',
            cell: (s: Service) =>
              s.price != null
                ? `${formatCurrency(s.price)}${s.price_unit ? `/${s.price_unit}` : ''}`
                : '—',
          },
        ]
      : []

  return (
    <ServiceTree
      data={filtered}
      isLoading={isLoading}
      error={error ?? null}
      featureFilters={new Set()}
      treeType="contract"
      onEdit={onEdit}
      onAddChild={onAddChild}
      onReorder={(args: ReorderArgs) => reorder.mutate(args)}
      extraColumns={extraColumns}
    />
  )
}
```

- [ ] **Step 3: Verify TypeScript is clean**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/components/services/ServiceTableView.tsx src/components/services/ContractTableView.tsx
git commit -m "feat(services): add ServiceTableView and ContractTableView wrapper components"
```

---

## Task 8: ServiceEditDialog

**Files:**
- Create: `src/components/services/ServiceEditDialog.tsx`

> This is the most complex component. It uses react-hook-form + Zod and covers all service types. Read the full task before starting.

- [ ] **Step 1: Install missing shadcn components if needed**

Check that `alert-dialog` is available:

```bash
ls src/components/ui/alert-dialog.tsx 2>/dev/null || npx shadcn@latest add alert-dialog
```

- [ ] **Step 2: Create the file with Zod schema and types**

```tsx
// src/components/services/ServiceEditDialog.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, ChevronsUpDown, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useDivisions } from '@/hooks/useDivisions'
import {
  useServiceTree, useCreateService, useUpdateService, useInstructions,
  type Service,
} from '@/hooks/useServices'
import { collectDescendantIds, buildTreeMap } from './ServiceTree'

const serviceSchema = z.object({
  name_en: z.string().min(1, 'Name (EN) is required'),
  name_ar: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']),
  division: z.enum(['maintenance', 'cleaning', 'kitchen', 'pest-control']),
  parent_id: z.string().nullable(),
  // Pricing
  price: z.coerce.number().nullable(),
  emergency_price: z.coerce.number().nullable(),
  discount: z.coerce.number().nullable(),
  price_unit: z.string().nullable(),
  // Contract
  contract_type: z.enum(['preventive', 'area', 'general']).nullable(),
  // Feature toggles
  has_inventory: z.boolean(),
  inventory_items_list: z.array(z.object({ name: z.string().min(1), qty: z.coerce.number().min(0) })),
  has_reminders: z.boolean(),
  reminder_days: z.coerce.number().nullable(),
  has_instructions: z.boolean(),
  linked_instruction_ids: z.array(z.string()),
  qc_checklist: z.boolean(),
  spare_parts: z.boolean(),
  // Invoice text
  invoice_text_en: z.string().nullable(),
  invoice_text_ar: z.string().nullable(),
})

type ServiceFormValues = z.infer<typeof serviceSchema>

interface ServiceEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'new' | 'edit'
  type: 'normal' | 'contract' | 'mobile'
  node: Service | null
  parentId: string | null
}
```

- [ ] **Step 3: Add buildTreeMap export to ServiceTree.tsx**

Open `src/components/services/ServiceTree.tsx` and add `export` to `buildTreeMap`:

```tsx
// Change:
function buildTreeMap(flat: Service[]): Map<string | null, Service[]> {
// To:
export function buildTreeMap(flat: Service[]): Map<string | null, Service[]> {
```

- [ ] **Step 4: Add the default values helper and component shell to ServiceEditDialog.tsx**

Append after the schema definition in `ServiceEditDialog.tsx`:

```tsx
function toDefaults(node: Service | null, type: string, parentId: string | null): ServiceFormValues {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = node as any
  return {
    name_en: s?.name_en ?? '',
    name_ar: s?.name_ar ?? null,
    code: s?.code ?? null,
    status: (s?.status as 'active' | 'inactive') ?? 'active',
    division: (s?.division as ServiceFormValues['division']) ?? 'maintenance',
    parent_id: s?.parent_id ?? parentId,
    price: s?.price ?? null,
    emergency_price: s?.emergency_price ?? null,
    discount: s?.discount ?? null,
    price_unit: s?.price_unit ?? null,
    contract_type: (s?.contract_type as ServiceFormValues['contract_type']) ?? null,
    has_inventory: Array.isArray(s?.inventory_items)
      ? s.inventory_items.length > 0
      : !!s?.inventory_items,
    inventory_items_list: Array.isArray(s?.inventory_items) ? s.inventory_items : [],
    has_reminders: s?.reminder_days != null,
    reminder_days: s?.reminder_days ?? null,
    has_instructions: s?.instructions ?? false,
    linked_instruction_ids: [],
    qc_checklist: s?.qc_checklist ?? false,
    spare_parts: s?.spare_parts ?? false,
    invoice_text_en: s?.invoice_text_en ?? null,
    invoice_text_ar: s?.invoice_text_ar ?? null,
  }
}

export function ServiceEditDialog({
  open,
  onOpenChange,
  mode,
  type,
  node,
  parentId,
}: ServiceEditDialogProps) {
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const createService = useCreateService()
  const updateService = useUpdateService()

  // Fetch tree for parent combobox
  const { data: treeData = [] } = useServiceTree(type, [], open)
  // Fetch instructions for Instructions sub-field
  const { data: allInstructions = [] } = useInstructions(open)
  const { data: divisions = [] } = useDivisions()

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: toDefaults(node, type, parentId),
  })

  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      form.reset(toDefaults(node, type, parentId))
    }
  }, [open, node, parentId, type]) // eslint-disable-line react-hooks/exhaustive-deps

  const { fields: inventoryFields, append: appendItem, remove: removeItem } = useFieldArray({
    control: form.control,
    name: 'inventory_items_list',
  })

  const hasInventory = useWatch({ control: form.control, name: 'has_inventory' })
  const hasReminders = useWatch({ control: form.control, name: 'has_reminders' })
  const hasInstructions = useWatch({ control: form.control, name: 'has_instructions' })
  const contractType = useWatch({ control: form.control, name: 'contract_type' })

  // Build parent combobox items (pre-order, excluding node + descendants)
  const parentComboItems = useMemo(() => {
    const treeMap = buildTreeMap(treeData)
    const excludeIds = new Set<string>()
    if (node) {
      excludeIds.add(node.id)
      collectDescendantIds(node.id, treeMap).forEach((id) => excludeIds.add(id))
    }

    type ComboItem = { id: string; name_en: string; name_ar: string | null; depth: number; breadcrumb: string }

    function traverse(
      parentIdKey: string | null,
      depth: number,
      breadcrumb: string,
    ): ComboItem[] {
      const children = treeMap.get(parentIdKey) ?? []
      const result: ComboItem[] = []
      for (const child of children) {
        if (excludeIds.has(child.id)) continue
        result.push({ id: child.id, name_en: child.name_en, name_ar: child.name_ar, depth, breadcrumb })
        result.push(...traverse(child.id, depth + 1, breadcrumb ? `${breadcrumb} > ${child.name_en}` : child.name_en))
      }
      return result
    }
    return traverse(null, 0, '')
  }, [treeData, node])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && form.formState.isDirty) {
      setConfirmDiscardOpen(true)
      return
    }
    onOpenChange(nextOpen)
  }

  function buildServicePayload(values: ServiceFormValues) {
    return {
      name_en: values.name_en,
      name_ar: values.name_ar || null,
      code: values.code || null,
      status: values.status,
      division: values.division,
      parent_id: values.parent_id,
      tree_type: type,
      price: values.price,
      emergency_price: type !== 'contract' ? values.emergency_price : null,
      discount: type === 'contract' ? values.discount : null,
      price_unit: values.contract_type === 'area' ? values.price_unit : null,
      contract_type: type === 'contract' ? values.contract_type : null,
      instructions: values.has_instructions,
      reminder_days: values.has_reminders ? values.reminder_days : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inventory_items: values.has_inventory ? (values.inventory_items_list as any) : null,
      qc_checklist: values.qc_checklist,
      spare_parts: values.spare_parts,
      invoice_text_en: values.invoice_text_en || null,
      invoice_text_ar: values.invoice_text_ar || null,
    }
  }

  async function onSubmit(values: ServiceFormValues) {
    try {
      const payload = buildServicePayload(values)
      if (mode === 'new') {
        await createService.mutateAsync({
          ...payload,
          sort_order: 0,
          treeType: type,
        })
      } else if (node) {
        const changedFields = Object.keys(form.formState.dirtyFields)
        await updateService.mutateAsync({
          id: node.id,
          ...payload,
          treeType: type,
          changedFields,
        })
      }
      toast.success('Service saved')
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to save service')
      console.error(err)
    }
  }
```

- [ ] **Step 5: Add the JSX return to ServiceEditDialog.tsx**

Append the return statement to the `ServiceEditDialog` function:

```tsx
  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto sm:rounded-lg rounded-none">
          <DialogHeader>
            <DialogTitle>
              {mode === 'new' ? `New ${type === 'contract' ? 'Contract' : type === 'mobile' ? 'Mobile App' : ''} Service` : 'Edit Service'}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

              {/* CORE SECTION */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="name_en" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name (EN)</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="name_ar" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name (AR)</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} dir="rtl" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="division" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Division</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {divisions.map((d) => (
                            <SelectItem key={d.slug} value={d.slug}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Status</FormLabel>
                      <div className="flex items-center gap-2 pt-2">
                        <Switch
                          checked={field.value === 'active'}
                          onCheckedChange={(checked) => field.onChange(checked ? 'active' : 'inactive')}
                        />
                        <span className="text-sm">{field.value === 'active' ? 'Active' : 'Inactive'}</span>
                      </div>
                    </FormItem>
                  )} />
                </div>

                {/* Parent service combobox */}
                <FormField control={form.control} name="parent_id" render={({ field }) => {
                  const [parentOpen, setParentOpen] = useState(false)
                  const selected = parentComboItems.find((i) => i.id === field.value)
                  return (
                    <FormItem>
                      <FormLabel>Parent Service (optional)</FormLabel>
                      <Popover open={parentOpen} onOpenChange={setParentOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9 text-sm">
                              {selected ? selected.name_en : 'None (root level)'}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[420px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search services…" />
                            <CommandList className="max-h-60">
                              <CommandEmpty>No services found.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  value="__none__"
                                  onSelect={() => { field.onChange(null); setParentOpen(false) }}
                                >
                                  <Check className={cn('mr-2 h-4 w-4', field.value === null ? 'opacity-100' : 'opacity-0')} />
                                  <span className="text-sm text-muted-foreground italic">None (root level)</span>
                                </CommandItem>
                                {parentComboItems.map((item) => (
                                  <CommandItem
                                    key={item.id}
                                    value={`${item.breadcrumb} ${item.name_en}`}
                                    onSelect={() => { field.onChange(item.id); setParentOpen(false) }}
                                  >
                                    <Check className={cn('mr-2 h-4 w-4 shrink-0', field.value === item.id ? 'opacity-100' : 'opacity-0')} />
                                    <div style={{ paddingInlineStart: item.depth * 16 }}>
                                      {item.breadcrumb && (
                                        <div className="text-[10px] text-muted-foreground leading-tight">{item.breadcrumb}</div>
                                      )}
                                      <div className="text-xs">{item.name_en}{item.name_ar && <span className="text-muted-foreground ml-1.5">{item.name_ar}</span>}</div>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </FormItem>
                  )
                }} />
              </div>

              {/* PRICING SECTION */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pricing</h4>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="price" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)} /></FormControl>
                    </FormItem>
                  )} />
                  {type !== 'contract' && (
                    <FormField control={form.control} name="emergency_price" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Emergency Price</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)} /></FormControl>
                      </FormItem>
                    )} />
                  )}
                  {type === 'contract' && (
                    <FormField control={form.control} name="discount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount %</FormLabel>
                        <FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)} /></FormControl>
                      </FormItem>
                    )} />
                  )}
                </div>
                {type === 'contract' && contractType === 'area' && (
                  <FormField control={form.control} name="price_unit" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price Unit (e.g. sqm)</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                    </FormItem>
                  )} />
                )}
              </div>

              {/* CONTRACT TYPE SECTION */}
              {type === 'contract' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contract Type</h4>
                  <FormField control={form.control} name="contract_type" render={({ field }) => (
                    <FormItem>
                      <div className="flex gap-2">
                        {(['preventive', 'area', 'general'] as const).map((t) => (
                          <Button
                            key={t}
                            type="button"
                            size="sm"
                            variant={field.value === t ? 'default' : 'outline'}
                            className="h-7 text-[11px] capitalize"
                            onClick={() => field.onChange(field.value === t ? null : t)}
                          >
                            {t === 'area' ? 'Area-Based' : t.charAt(0).toUpperCase() + t.slice(1)}
                          </Button>
                        ))}
                      </div>
                    </FormItem>
                  )} />
                </div>
              )}

              {/* FEATURES SECTION (normal + mobile only) */}
              {type !== 'contract' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Features</h4>

                  {/* Inventory */}
                  <div className="space-y-2">
                    <FormField control={form.control} name="has_inventory" render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm">Inventory Items</Label>
                        </div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    {hasInventory && (
                      <div className="ml-4 space-y-2 border-l-2 border-border pl-3">
                        {inventoryFields.map((f, idx) => (
                          <div key={f.id} className="flex gap-2 items-end">
                            <FormField control={form.control} name={`inventory_items_list.${idx}.name`} render={({ field }) => (
                              <FormItem className="flex-1">
                                {idx === 0 && <FormLabel className="text-xs">Item Name</FormLabel>}
                                <FormControl><Input className="h-8 text-xs" {...field} /></FormControl>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name={`inventory_items_list.${idx}.qty`} render={({ field }) => (
                              <FormItem className="w-20">
                                {idx === 0 && <FormLabel className="text-xs">Qty</FormLabel>}
                                <FormControl><Input type="number" className="h-8 text-xs" {...field} /></FormControl>
                              </FormItem>
                            )} />
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 mb-0" onClick={() => removeItem(idx)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                          onClick={() => appendItem({ name: '', qty: 1 })}>
                          <Plus className="h-3 w-3" />Add Item
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Reminders */}
                  <div className="space-y-2">
                    <FormField control={form.control} name="has_reminders" render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <Label className="text-sm">Reminders</Label>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    {hasReminders && (
                      <div className="ml-4 border-l-2 border-border pl-3">
                        <FormField control={form.control} name="reminder_days" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Remind every N days</FormLabel>
                            <FormControl><Input type="number" className="h-8 text-xs w-32" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)} /></FormControl>
                          </FormItem>
                        )} />
                      </div>
                    )}
                  </div>

                  {/* Instructions */}
                  <div className="space-y-2">
                    <FormField control={form.control} name="has_instructions" render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <Label className="text-sm">Instructions</Label>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    {hasInstructions && (
                      <div className="ml-4 border-l-2 border-border pl-3">
                        <FormField control={form.control} name="linked_instruction_ids" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Link instructions</FormLabel>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {allInstructions.map((instr) => (
                                <label key={instr.id} className="flex items-center gap-2 text-xs cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={field.value.includes(instr.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        field.onChange([...field.value, instr.id])
                                      } else {
                                        field.onChange(field.value.filter((id) => id !== instr.id))
                                      }
                                    }}
                                    className="h-3 w-3"
                                  />
                                  {instr.name_en}
                                  {instr.name_ar && <span className="text-muted-foreground">{instr.name_ar}</span>}
                                </label>
                              ))}
                            </div>
                          </FormItem>
                        )} />
                      </div>
                    )}
                  </div>

                  {/* QC Checklist */}
                  <FormField control={form.control} name="qc_checklist" render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <Label className="text-sm">QC Checklist</Label>
                      <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />

                  {/* Spare Parts */}
                  <FormField control={form.control} name="spare_parts" render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <Label className="text-sm">Spare Parts</Label>
                      <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              )}

              {/* INVOICE TEXT SECTION */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice Text</h4>
                <FormField control={form.control} name="invoice_text_en" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Text (EN)</FormLabel>
                    <FormControl><Textarea rows={2} {...field} value={field.value ?? ''} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="invoice_text_ar" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Text (AR)</FormLabel>
                    <FormControl><Textarea rows={2} dir="rtl" {...field} value={field.value ?? ''} /></FormControl>
                  </FormItem>
                )} />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createService.isPending || updateService.isPending}>
                  {createService.isPending || updateService.isPending ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Unsaved changes guard */}
      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. They will be lost if you close now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmDiscardOpen(false); onOpenChange(false) }}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

- [ ] **Step 6: Verify TypeScript is clean**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 7: Commit**

```bash
git add src/components/services/ServiceEditDialog.tsx src/components/services/ServiceTree.tsx
git commit -m "feat(services): add ServiceEditDialog with all feature flags, unsaved-changes guard, parent combobox"
```

---

## Task 9: Services Page Shell

**Files:**
- Create: `src/app/(dashboard)/master-data/services/page.tsx`

- [ ] **Step 1: Create the page file**

```tsx
// src/app/(dashboard)/master-data/services/page.tsx
'use client'

import { useState } from 'react'
import {
  ListTree, FileText, Smartphone, Bell, Package, Tag,
  Filter, Plus, Ruler, Percent, ClipboardCheck, Wrench,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DivisionMultiSelect } from '@/components/shared/DivisionMultiSelect'
import { ServiceTableView } from '@/components/services/ServiceTableView'
import { ContractTableView } from '@/components/services/ContractTableView'
import { ServiceEditDialog } from '@/components/services/ServiceEditDialog'
import type { Service } from '@/hooks/useServices'

type TabKey = 'normal' | 'contract' | 'mobile' | 'reminders' | 'instructions' | 'inventory' | 'promotions'

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'normal', label: 'Normal Services', icon: ListTree },
  { key: 'contract', label: 'Contract Services', icon: FileText },
  { key: 'mobile', label: 'Mobile App Services', icon: Smartphone },
  { key: 'reminders', label: 'Notifications', icon: Bell },
  { key: 'instructions', label: 'Instructions', icon: FileText },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'promotions', label: 'Promotions', icon: Tag },
]

const FEATURE_FILTERS = [
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'reminders', label: 'Reminders', icon: Bell },
  { key: 'instructions', label: 'Instr', icon: FileText },
  { key: 'qc', label: 'QC', icon: ClipboardCheck },
  { key: 'parts', label: 'Parts', icon: Wrench },
]

const CONTRACT_TYPES = [
  { key: 'preventive', label: 'Preventive', icon: FileText },
  { key: 'area', label: 'Area-Based', icon: Ruler },
  { key: 'general', label: 'General', icon: Percent },
]

const FILTER_BAR_HIDDEN_TABS: TabKey[] = ['reminders', 'instructions', 'inventory']

export default function ServicesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('normal')
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(new Set(['normal']))
  const [divisionFilter, setDivisionFilter] = useState<string[]>([])
  const [featureFilters, setFeatureFilters] = useState<Set<string>>(new Set())
  const [contractTypeFilter, setContractTypeFilter] = useState<'all' | 'preventive' | 'area' | 'general'>('all')
  const [editDialog, setEditDialog] = useState<{
    open: boolean
    mode: 'new' | 'edit'
    type: 'normal' | 'contract' | 'mobile'
    node: Service | null
    parentId: string | null
  }>({ open: false, mode: 'new', type: 'normal', node: null, parentId: null })

  function handleTabChange(tab: string) {
    const t = tab as TabKey
    setActiveTab(t)
    setDivisionFilter([])
    setFeatureFilters(new Set())
    setContractTypeFilter('all')
    setVisitedTabs((prev) => new Set([...prev, t]))
  }

  function toggleFeatureFilter(key: string) {
    setFeatureFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openNew() {
    const type = activeTab === 'contract' ? 'contract' : activeTab === 'mobile' ? 'mobile' : 'normal'
    setEditDialog({ open: true, mode: 'new', type, node: null, parentId: null })
  }

  function openEdit(node: Service) {
    const type = activeTab === 'contract' ? 'contract' : activeTab === 'mobile' ? 'mobile' : 'normal'
    setEditDialog({ open: true, mode: 'edit', type, node, parentId: null })
  }

  function openAddChild(parentId: string) {
    const type = activeTab === 'contract' ? 'contract' : activeTab === 'mobile' ? 'mobile' : 'normal'
    setEditDialog({ open: true, mode: 'new', type, node: null, parentId })
  }

  const showFilterBar = !FILTER_BAR_HIDDEN_TABS.includes(activeTab)
  const isTreeTab = ['normal', 'contract', 'mobile'].includes(activeTab)

  const newButtonLabel =
    activeTab === 'contract' ? 'New Contract Service' :
    activeTab === 'mobile' ? 'New Mobile Service' :
    'New Service'

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
      {/* TAB BAR */}
      <div className="px-4 pt-2 border-b border-border bg-card">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="h-9 w-full justify-start bg-transparent p-0 gap-0 overflow-x-auto flex-nowrap">
            {TABS.map(({ key, label, icon: Icon }) => (
              <TabsTrigger
                key={key}
                value={key}
                className="px-3 py-2 text-xs gap-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* FILTER BAR */}
      {showFilterBar && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card overflow-x-auto flex-nowrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">Filter by:</span>

          {/* Normal + Mobile: feature toggles */}
          {(activeTab === 'normal' || activeTab === 'mobile') && (
            <>
              {FEATURE_FILTERS.map(({ key, label, icon: Icon }) => (
                <Button
                  key={key}
                  variant={featureFilters.has(key) ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-[11px] gap-1 shrink-0"
                  onClick={() => toggleFeatureFilter(key)}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </Button>
              ))}
              {/* Active filter chips */}
              {featureFilters.size > 0 && Array.from(featureFilters).map((key) => {
                const f = FEATURE_FILTERS.find((ff) => ff.key === key)
                if (!f) return null
                return (
                  <Badge
                    key={key}
                    variant="secondary"
                    className="text-[10px] gap-1 cursor-pointer shrink-0"
                    onClick={() => toggleFeatureFilter(key)}
                  >
                    ✓ {f.label} ✕
                  </Badge>
                )
              })}
            </>
          )}

          {/* Contract: type filter */}
          {activeTab === 'contract' && CONTRACT_TYPES.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant={contractTypeFilter === key ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-[11px] gap-1 shrink-0"
              onClick={() =>
                setContractTypeFilter((prev) => (prev === key ? 'all' : key as typeof contractTypeFilter))
              }
            >
              <Icon className="h-3 w-3" />
              {label}
            </Button>
          ))}

          {/* Right cluster */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {activeTab !== 'promotions' && (
              <DivisionMultiSelect value={divisionFilter} onChange={setDivisionFilter} />
            )}
            {isTreeTab && (
              <Button size="sm" className="h-7 text-[11px] gap-1" onClick={openNew}>
                <Plus className="h-3.5 w-3.5" />
                {newButtonLabel}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT */}
      <div className="flex-1 overflow-auto bg-card">
        {activeTab === 'normal' && (
          <ServiceTableView
            serviceType="normal"
            divisionFilter={divisionFilter}
            featureFilters={featureFilters}
            enabled={visitedTabs.has('normal')}
            onEdit={openEdit}
            onAddChild={openAddChild}
          />
        )}
        {activeTab === 'contract' && (
          <ContractTableView
            typeFilter={contractTypeFilter}
            divisionFilter={divisionFilter}
            enabled={visitedTabs.has('contract')}
            onEdit={openEdit}
            onAddChild={openAddChild}
          />
        )}
        {activeTab === 'mobile' && (
          <ServiceTableView
            serviceType="mobile"
            divisionFilter={divisionFilter}
            featureFilters={featureFilters}
            enabled={visitedTabs.has('mobile')}
            onEdit={openEdit}
            onAddChild={openAddChild}
          />
        )}
        {(activeTab === 'reminders' || activeTab === 'instructions' || activeTab === 'inventory' || activeTab === 'promotions') && (
          <div className="p-8 text-sm text-muted-foreground text-center">
            Coming in next plan
          </div>
        )}
      </div>

      {/* EDIT DIALOG — shared by all tree tabs */}
      <ServiceEditDialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog((s) => ({ ...s, open }))}
        mode={editDialog.mode}
        type={editDialog.type}
        node={editDialog.node}
        parentId={editDialog.parentId}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript is clean**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/master-data/services/page.tsx
git commit -m "feat(services): add Services page shell — 7 tabs, filter bar, tree tab content, lazy loading"
```

---

## Task 10: Navigation Wire-up + PROGRESS.md

**Files:**
- Modify: `src/components/layout/nav-config.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: Remove comingSoon from Services nav entry**

In `src/components/layout/nav-config.ts`, change:

```ts
// Before:
{ label: 'Service List', href: '/master-data/services', comingSoon: true },

// After:
{ label: 'Services', href: '/master-data/services' },
```

- [ ] **Step 2: Update PROGRESS.md**

In `PROGRESS.md`, update `## 🔄 In Progress` to reflect Task 11 (integration test) is next, and add a new completed section entry for this plan once Task 11 passes.

- [ ] **Step 3: Commit nav change**

```bash
git add src/components/layout/nav-config.ts
git commit -m "feat(nav): activate Services nav entry, remove comingSoon"
```

---

## Task 11: Integration Test + PROGRESS.md Update

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 2: Run existing tests**

```bash
npm test -- --passWithNoTests 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds, no route errors. Confirm `/master-data/services` appears in the route list.

- [ ] **Step 4: Smoke test in browser**

Start dev server:
```bash
npm run dev
```

Verify:
- [ ] Navigate to `/master-data/services` — page loads with 7 tab bar
- [ ] "Normal Services" tab shows loading spinner then empty state or tree
- [ ] Click another tab (e.g. Contract) — loads lazily, doesn't refetch Normal
- [ ] DivisionMultiSelect opens, shows division list, selection updates filter
- [ ] Feature toggle buttons appear on Normal/Mobile tabs, chips appear when active
- [ ] Contract type buttons appear on Contract tab, mutually exclusive
- [ ] "New Service" button opens ServiceEditDialog
- [ ] Edit dialog: all sections render, feature toggles expand sub-fields
- [ ] Unsaved changes guard: fill a field, click backdrop → AlertDialog appears
- [ ] "Keep Editing" returns to form; "Discard" closes dialog
- [ ] All other pages (inventory, suppliers, purchase, sales) still have correct padding

- [ ] **Step 5: Update PROGRESS.md and commit**

Add to `## ✅ Completed`:
```
- [2026-04-21] **Services Hub — Shell, Tree Tabs & Edit Dialog** — `supabase/migrations/20260421000000_services_feature_flags.sql`, `src/hooks/useServices.ts`, `src/components/shared/DivisionMultiSelect.tsx`, `src/components/shared/PageWrapper.tsx`, `src/components/services/ServiceTree.tsx`, `src/components/services/ServiceTableView.tsx`, `src/components/services/ContractTableView.tsx`, `src/components/services/ServiceEditDialog.tsx`, `src/app/(dashboard)/master-data/services/page.tsx` — recursive tree renderer, 7-tab page shell, full-featured edit dialog with feature flags, layout refactor for hub pages
```

Update `## 🔄 In Progress` to the next sub-plan.

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — Services Hub Shell & Tree Tabs complete"
```
