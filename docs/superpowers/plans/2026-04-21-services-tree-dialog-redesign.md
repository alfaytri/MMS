# Services Hub — Tree Redesign & Edit Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the service tree with a 7-column fixed-width table layout, a sticky header, and per-row archive support; rebuild `ServiceEditDialog` with all DB fields, catalog image upload, and archive (soft-delete).

**Architecture:** `ServiceTree.tsx` becomes an orchestrator (sticky header + recursive map). Row logic lives in `ServiceTreeRow.tsx` (owns archive AlertDialog + `useArchiveService`). Form section components + Zod schema live in `ServiceEditSections.tsx`; the dialog shell + submit logic live in `ServiceEditDialog.tsx`. The `featureFilters` system is removed — the new fixed columns make it redundant.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase (browser `createClient()`) · TanStack Query v5 · shadcn/ui · Tailwind CSS · Zod · react-hook-form · Lucide icons · Sonner toasts

**Design spec:** `docs/superpowers/specs/2026-04-21-services-tree-dialog-redesign-design.md`

---

## ⚠️ Critical DB Facts

| Item | Detail |
|---|---|
| `services.service_type` | Enum — `"standard" \| "configurable"` |
| `services.division` | Enum — `"maintenance" \| "cleaning" \| "kitchen" \| "pest-control"` |
| `services.status` | Enum — `"active" \| "inactive"` |
| `services.contract_type` | Enum — `"preventive" \| "area" \| "general"` |
| `activity_log.module` | Not in TS types — always cast `supabase.from('activity_log') as any` |
| `divisions.slug` | Matches `services.division` enum values — use as filter key |

---

## File Map

```
supabase/migrations/
  20260421000001_services_additions.sql     NEW

src/types/
  database.types.ts                         EDIT — add 4 new columns to services Row/Insert/Update

src/hooks/
  useServices.ts                            EDIT — deleted_at filter + useArchiveService

src/components/services/
  ServiceTreeRow.tsx                        NEW — 7-column row anatomy + archive AlertDialog
  ServiceTree.tsx                           REWRITE — sticky header + orchestrator, remove featureFilters
  ServiceTableView.tsx                      EDIT — remove featureFilters prop
  ContractTableView.tsx                     EDIT — remove featureFilters from ServiceTree call
  ServiceEditSections.tsx                   NEW — Zod schema + toDefaults + 9 section components
  ServiceEditDialog.tsx                     REWRITE — form shell + image upload + parent combobox

src/app/(dashboard)/master-data/services/
  page.tsx                                  EDIT — remove featureFilters state + filter buttons
```

---

## Task 1: DB Migration + Storage Bucket + Types

**Files:**
- Create: `supabase/migrations/20260421000001_services_additions.sql`
- Modify: `src/types/database.types.ts`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260421000001_services_additions.sql

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS deleted_at        timestamptz,
  ADD COLUMN IF NOT EXISTS catalog_image_url text,
  ADD COLUMN IF NOT EXISTS legacy_service_id text,
  ADD COLUMN IF NOT EXISTS qc_items          jsonb;

-- Partial index — active service lookups skip archived rows without full scans
CREATE INDEX IF NOT EXISTS idx_services_active
  ON services (tree_type, deleted_at)
  WHERE deleted_at IS NULL;

-- Storage bucket for catalog images
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-photos', 'service-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "service_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'service-photos');

CREATE POLICY "service_photos_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'service-photos');

CREATE POLICY "service_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'service-photos');
```

- [ ] **Step 2: Apply the migration**

```bash
cd D:/MMS && npx supabase db push
```

Expected: migration applied without errors.

- [ ] **Step 3: Add new columns to `database.types.ts`**

Open `src/types/database.types.ts`. Find the `services:` table definition (search for `services: {`). In the `Row` block, add these four lines after `inventory_items: Json | null`:

```ts
          catalog_image_url: string | null
          deleted_at: string | null
          legacy_service_id: string | null
          qc_items: Json | null
```

In the `Insert` block, add after `inventory_items?: Json | null`:

```ts
          catalog_image_url?: string | null
          deleted_at?: string | null
          legacy_service_id?: string | null
          qc_items?: Json | null
```

In the `Update` block, add after `inventory_items?: Json | null`:

```ts
          catalog_image_url?: string | null
          deleted_at?: string | null
          legacy_service_id?: string | null
          qc_items?: Json | null
```

- [ ] **Step 4: Verify TypeScript is clean**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260421000001_services_additions.sql src/types/database.types.ts
git commit -m "feat(services): add deleted_at, catalog_image_url, legacy_service_id, qc_items columns + service-photos bucket"
```

---

## Task 2: useServices Hook Updates

**Files:**
- Modify: `src/hooks/useServices.ts`

- [ ] **Step 1: Add `deleted_at` filter to `useServiceTree`**

In `src/hooks/useServices.ts`, find `useServiceTree`. After `.order('sort_order', { ascending: true })` add:

```ts
      query = query.is('deleted_at', null)
```

The full `queryFn` should now read:

```ts
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from('services') as any)
        .select('*')
        .eq('tree_type', treeType)
        .order('sort_order', { ascending: true })
      query = query.is('deleted_at', null)
      if (divisionSlugs.length > 0) {
        query = query.in('division', divisionSlugs)
      }
      const { data, error } = await query
      if (error) throw error
      return data as Service[]
    },
```

- [ ] **Step 2: Add `useArchiveService` mutation at the end of the file**

Append to `src/hooks/useServices.ts`:

```ts
export function useArchiveService() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      treeType,
    }: {
      id: string
      treeType: string
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('services')
        .update({
          deleted_at: new Date().toISOString(),
          status: 'inactive',
        })
        .eq('id', id)
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('activity_log') as any).insert({
        action: 'services/service-archived',
        module: 'services',
        entity_type: 'service',
        entity_id: id,
        details: JSON.stringify({ archived_at: new Date().toISOString() }),
      })
      return { treeType }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['services', data.treeType] })
    },
  })
}
```

- [ ] **Step 3: Verify TypeScript is clean**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useServices.ts
git commit -m "feat(services): add deleted_at filter to useServiceTree, add useArchiveService mutation"
```

---

## Task 3: ServiceTreeRow Component

**Files:**
- Create: `src/components/services/ServiceTreeRow.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/services/ServiceTreeRow.tsx
'use client'

import { useState } from 'react'
import {
  ChevronRight, ChevronDown, ArrowUp, ArrowDown,
  Plus, Pencil, Settings2, Bell, Shield, Clock, Archive,
} from 'lucide-react'
import { Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/formatters'
import { useArchiveService, type Service } from '@/hooks/useServices'
import type { ReorderArgs } from './ServiceTree'

const LEVEL_COLORS: Record<number, string> = {
  0: 'bg-blue-100 text-blue-700',
  1: 'bg-green-100 text-green-700',
  2: 'bg-amber-100 text-amber-700',
}

interface ServiceTreeRowProps {
  service: Service
  depth: number
  isExpanded: boolean
  hasChildren: boolean
  isFirst: boolean
  isLast: boolean
  treeType: string
  onToggleExpand: (id: string) => void
  onEdit: (node: Service) => void
  onAddChild: (parentId: string) => void
  onReorder: (args: ReorderArgs) => void
}

export function ServiceTreeRow({
  service,
  depth,
  isExpanded,
  hasChildren,
  isFirst,
  isLast,
  treeType,
  onToggleExpand,
  onEdit,
  onAddChild,
  onReorder,
}: ServiceTreeRowProps) {
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archiveService = useArchiveService()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = service as any
  const isBranch = hasChildren
  const level = depth
  const levelLabel = `L${level + 1}`
  const levelColor = LEVEL_COLORS[Math.min(level, 2)] ?? 'bg-slate-100 text-slate-700'

  function handleRowClick() {
    if (isBranch) {
      onToggleExpand(service.id)
    } else {
      onEdit(service)
    }
  }

  function handleArchiveConfirm() {
    archiveService.mutate(
      { id: service.id, treeType },
      {
        onSuccess: () => toast.success(`"${service.name_en}" archived`),
        onError: () => toast.error('Failed to archive service'),
      },
    )
    setArchiveOpen(false)
  }

  return (
    <>
      <div
        className={cn(
          'flex items-center min-h-[40px] border-b border-border/50 hover:bg-muted/30 cursor-pointer',
          isBranch && 'bg-muted/20',
        )}
        onClick={handleRowClick}
      >
        {/* 1. Order — w-10 */}
        <div className="w-10 flex flex-col items-center justify-center gap-0 shrink-0">
          {isFirst && isLast ? (
            <span className="text-[10px] text-muted-foreground select-none">—</span>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 disabled:opacity-30"
                disabled={isFirst}
                onClick={(e) => {
                  e.stopPropagation()
                  onReorder({ movedId: service.id, parentId: service.parent_id ?? null, direction: 'up', treeType })
                }}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 disabled:opacity-30"
                disabled={isLast}
                onClick={(e) => {
                  e.stopPropagation()
                  onReorder({ movedId: service.id, parentId: service.parent_id ?? null, direction: 'down', treeType })
                }}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>

        {/* 2. Service — w-[260px] */}
        <div
          className="w-[260px] flex items-center gap-1 min-w-0 shrink-0"
          style={{ paddingLeft: 12 + depth * 20 }}
        >
          <span className="w-4 h-4 flex items-center justify-center shrink-0">
            {isBranch
              ? isExpanded
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              : null}
          </span>
          <Badge className={cn('text-[9px] px-1 py-0 h-4 shrink-0 border-0', levelColor)}>
            {levelLabel}
          </Badge>
          {svc.service_type === 'configurable' && (
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 h-4 gap-0.5 text-primary border-primary shrink-0"
            >
              <Settings2 className="h-2 w-2" />Config
            </Badge>
          )}
          <div className="min-w-0 flex-1">
            <div className={cn('text-xs truncate text-foreground', isBranch ? 'font-semibold' : 'font-normal')}>
              {service.name_en}
            </div>
            {service.name_ar && (
              <div className="text-[10px] truncate text-muted-foreground">{service.name_ar}</div>
            )}
          </div>
        </div>

        {/* 3. Invoice Text — w-[200px] */}
        <div className="w-[200px] shrink-0 px-2">
          {!isBranch && (svc.invoice_text_en || svc.invoice_text_ar) ? (
            <>
              <div className="text-[11px] truncate text-foreground">{svc.invoice_text_en ?? '—'}</div>
              <div className="text-[10px] truncate text-muted-foreground">{svc.invoice_text_ar ?? ''}</div>
            </>
          ) : !isBranch ? (
            <span className="text-[11px] text-muted-foreground/40">—</span>
          ) : null}
        </div>

        {/* 4. Pricing / Unit — w-[160px] */}
        <div className="w-[160px] shrink-0 px-2">
          {!isBranch && (
            svc.service_type === 'configurable' ? (
              <div className="flex items-center gap-1 text-[11px] text-primary">
                <Settings2 className="h-3 w-3" />Configurable
              </div>
            ) : service.price != null ? (
              <div>
                <div className="text-xs font-semibold">
                  Reg: {formatCurrency(service.price)} QAR
                </div>
                {service.price_unit && (
                  <div className="text-[9px] text-muted-foreground">/ {service.price_unit}</div>
                )}
                {service.emergency_price != null && (
                  <div className="text-[11px] text-destructive">
                    Emg: {formatCurrency(service.emergency_price)} QAR
                  </div>
                )}
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground/40">—</span>
            )
          )}
        </div>

        {/* 5. Reminders — w-[100px] */}
        <div className="w-[100px] shrink-0 px-2">
          {!isBranch && service.reminder_days != null ? (
            <div className="flex items-center gap-1 text-[11px]">
              <Bell className="h-3 w-3 text-yellow-500" />
              {service.reminder_days}d
            </div>
          ) : !isBranch ? (
            <span className="text-[11px] text-muted-foreground/40">—</span>
          ) : null}
        </div>

        {/* 6. Details — w-[130px] */}
        <div className="w-[130px] shrink-0 px-2 flex items-center gap-1.5">
          {!isBranch && (
            <>
              <div className={cn(
                'flex items-center gap-0.5 text-[10px]',
                svc.warranty ? 'text-foreground' : 'text-muted-foreground/40',
              )}>
                <Shield className="h-3 w-3" />{svc.warranty ?? 0}m
              </div>
              <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground w-[38px]">
                <Clock className="h-3 w-3" />{svc.duration ?? 0}m
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px] px-1 py-0 h-3.5 gap-0.5',
                  svc.spare_parts
                    ? 'border-green-500 text-green-600'
                    : 'border-muted text-muted-foreground/40',
                )}
              >
                <Wrench className="h-2 w-2" />Parts
              </Badge>
            </>
          )}
        </div>

        {/* 7. Actions — w-[70px] */}
        <div className="w-[70px] shrink-0 flex items-center justify-end gap-0.5 px-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => { e.stopPropagation(); onAddChild(service.id) }}
          >
            <Plus className="h-3.5 w-3.5 text-primary" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => { e.stopPropagation(); onEdit(service) }}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => { e.stopPropagation(); setArchiveOpen(true) }}
          >
            <Archive className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Archive confirmation */}
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Service</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive &ldquo;{service.name_en}&rdquo;? It will be
              deactivated and hidden from active lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleArchiveConfirm}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript is clean**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/ServiceTreeRow.tsx
git commit -m "feat(services): add ServiceTreeRow — 7-column anatomy, archive AlertDialog"
```

---

## Task 4: ServiceTree Rewrite

**Files:**
- Rewrite: `src/components/services/ServiceTree.tsx`

> Remove `featureFilters`, `ExtraColumn`, and old row rendering. Add sticky header, delegate rows to `ServiceTreeRow`.

- [ ] **Step 1: Replace the full file content**

```tsx
// src/components/services/ServiceTree.tsx
'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ServiceTreeRow } from './ServiceTreeRow'
import type { Service } from '@/hooks/useServices'

export interface ReorderArgs {
  movedId: string
  parentId: string | null
  direction: 'up' | 'down'
  treeType: string
}

export function buildTreeMap(flat: Service[]): Map<string | null, Service[]> {
  const map = new Map<string | null, Service[]>()
  for (const s of flat) {
    const key = s.parent_id ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return map
}

export function collectDescendantIds(
  nodeId: string,
  treeMap: Map<string | null, Service[]>,
): Set<string> {
  const result = new Set<string>()
  const visited = new Set<string>()
  function recurse(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const children = treeMap.get(id) ?? []
    for (const child of children) {
      result.add(child.id)
      recurse(child.id)
    }
  }
  recurse(nodeId)
  return result
}

const COLUMNS = [
  { label: 'Order', width: 'w-10' },
  { label: 'Service', width: 'w-[260px]' },
  { label: 'Invoice Text', width: 'w-[200px]' },
  { label: 'Pricing / Unit', width: 'w-[160px]' },
  { label: 'Reminders', width: 'w-[100px]' },
  { label: 'Details', width: 'w-[130px]' },
  { label: 'Actions', width: 'w-[70px]' },
]

interface ServiceTreeProps {
  data: Service[]
  isLoading: boolean
  error: Error | null
  treeType: string
  onEdit: (node: Service) => void
  onAddChild: (parentId: string) => void
  onReorder: (args: ReorderArgs) => void
}

export function ServiceTree({
  data,
  isLoading,
  error,
  treeType,
  onEdit,
  onAddChild,
  onReorder,
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
        Failed to load: {error.message}
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

  function renderNode(service: Service, depth: number): React.ReactNode {
    const children = treeMap.get(service.id) ?? []
    const hasChildren = children.length > 0
    const isExpanded = expanded.has(service.id)
    const siblings = treeMap.get(service.parent_id ?? null) ?? []
    const idx = siblings.findIndex((s) => s.id === service.id)

    return (
      <div key={service.id}>
        <ServiceTreeRow
          service={service}
          depth={depth}
          isExpanded={isExpanded}
          hasChildren={hasChildren}
          isFirst={idx === 0}
          isLast={idx === siblings.length - 1}
          treeType={treeType}
          onToggleExpand={toggleExpand}
          onEdit={onEdit}
          onAddChild={onAddChild}
          onReorder={onReorder}
        />
        {hasChildren && isExpanded && children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center bg-muted/50 border-b">
        {COLUMNS.map((col) => (
          <div
            key={col.label}
            className={cn(col.width, 'px-2 py-1.5 shrink-0 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground')}
          >
            {col.label}
          </div>
        ))}
      </div>
      {/* Tree rows */}
      <div>{roots.map((root) => renderNode(root, 0))}</div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript is clean**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/ServiceTree.tsx
git commit -m "feat(services): rewrite ServiceTree — sticky header, delegate rows to ServiceTreeRow, remove featureFilters"
```

---

## Task 5: ServiceTableView + ContractTableView Cleanup

**Files:**
- Modify: `src/components/services/ServiceTableView.tsx`
- Modify: `src/components/services/ContractTableView.tsx`

- [ ] **Step 1: Replace `ServiceTableView.tsx`**

Remove `featureFilters` prop and its pass-through:

```tsx
// src/components/services/ServiceTableView.tsx
'use client'

import { ServiceTree, type ReorderArgs } from './ServiceTree'
import { useServiceTree, useReorderServices, type Service } from '@/hooks/useServices'

interface ServiceTableViewProps {
  serviceType: 'normal' | 'mobile'
  divisionFilter: string[]
  enabled: boolean
  onEdit: (node: Service) => void
  onAddChild: (parentId: string) => void
}

export function ServiceTableView({
  serviceType,
  divisionFilter,
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
      treeType={serviceType}
      onEdit={onEdit}
      onAddChild={onAddChild}
      onReorder={(args: ReorderArgs) => reorder.mutate(args)}
    />
  )
}
```

- [ ] **Step 2: Replace `ContractTableView.tsx`**

Remove `featureFilters` and `extraColumns` (pricing now comes from the fixed Pricing cell):

```tsx
// src/components/services/ContractTableView.tsx
'use client'

import { useMemo } from 'react'
import { ServiceTree, type ReorderArgs } from './ServiceTree'
import { useServiceTree, useReorderServices, type Service } from '@/hooks/useServices'

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
    () => (typeFilter === 'all' ? data : data.filter((s) => s.contract_type === typeFilter)),
    [data, typeFilter],
  )

  return (
    <ServiceTree
      data={filtered}
      isLoading={isLoading}
      error={error ?? null}
      treeType="contract"
      onEdit={onEdit}
      onAddChild={onAddChild}
      onReorder={(args: ReorderArgs) => reorder.mutate(args)}
    />
  )
}
```

- [ ] **Step 3: Verify TypeScript is clean**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (page.tsx will fail until Task 8 — that's expected).

- [ ] **Step 4: Commit**

```bash
git add src/components/services/ServiceTableView.tsx src/components/services/ContractTableView.tsx
git commit -m "feat(services): remove featureFilters from ServiceTableView and ContractTableView"
```

---

## Task 6: ServiceEditSections

**Files:**
- Create: `src/components/services/ServiceEditSections.tsx`

> This file owns the Zod schema, `toDefaults` helper, and all 9 section components. They are exported for use only by `ServiceEditDialog.tsx`.

- [ ] **Step 1: Create the file — schema, types, toDefaults**

```tsx
// src/components/services/ServiceEditSections.tsx
'use client'

import { useWatch, useFieldArray, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { Upload, X, ImageIcon, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useDivisions } from '@/hooks/useDivisions'
import type { Service } from '@/hooks/useServices'

export const serviceSchema = z.object({
  name_en: z.string().min(1, 'Name (EN) is required'),
  name_ar: z.string().min(1, 'Name (AR) is required'),
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
  // Duration & Warranty
  duration: z.coerce.number().nullable(),
  warranty: z.coerce.number().nullable(),
  // Invoice text
  invoice_text_en: z.string().nullable(),
  invoice_text_ar: z.string().nullable(),
  // Feature toggles
  has_inventory: z.boolean(),
  inventory_items_list: z.array(
    z.object({ name: z.string().min(1), qty: z.coerce.number().min(0) }),
  ),
  has_reminders: z.boolean(),
  reminder_days: z.coerce.number().nullable(),
  qc_checklist: z.boolean(),
  spare_parts: z.boolean(),
  service_type: z.enum(['standard', 'configurable']),
  legacy_service_id: z.string().nullable(),
  qc_items: z.array(
    z.object({ label: z.string().min(1), max_score: z.coerce.number().min(0) }),
  ),
})

export type ServiceFormValues = z.infer<typeof serviceSchema>

export function toDefaults(
  node: Service | null,
  type: 'normal' | 'contract' | 'mobile',
  parentId: string | null,
): ServiceFormValues {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = node as any
  return {
    name_en: s?.name_en ?? '',
    name_ar: s?.name_ar ?? '',
    code: s?.code ?? null,
    status: (s?.status as 'active' | 'inactive') ?? 'active',
    division: (s?.division as ServiceFormValues['division']) ?? 'maintenance',
    parent_id: s?.parent_id ?? parentId,
    price: s?.price ?? null,
    emergency_price: s?.emergency_price ?? null,
    discount: s?.discount ?? null,
    price_unit: s?.price_unit ?? null,
    contract_type: (s?.contract_type as ServiceFormValues['contract_type']) ?? null,
    duration: s?.duration ?? null,
    warranty: s?.warranty ?? null,
    invoice_text_en: s?.invoice_text_en ?? null,
    invoice_text_ar: s?.invoice_text_ar ?? null,
    has_inventory: Array.isArray(s?.inventory_items)
      ? s.inventory_items.length > 0
      : !!s?.inventory_items,
    inventory_items_list: Array.isArray(s?.inventory_items) ? s.inventory_items : [],
    has_reminders: s?.reminder_days != null,
    reminder_days: s?.reminder_days ?? null,
    qc_checklist: s?.qc_checklist ?? false,
    spare_parts: s?.spare_parts ?? false,
    service_type: (s?.service_type as 'standard' | 'configurable') ?? 'standard',
    legacy_service_id: s?.legacy_service_id ?? null,
    qc_items: Array.isArray(s?.qc_items) ? s.qc_items : [],
  }
}
```

- [ ] **Step 2: Add CoreSection**

Append to `ServiceEditSections.tsx`:

```tsx
export function CoreSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField control={form.control} name="name_en" render={({ field }) => (
        <FormItem>
          <FormLabel>Name (English) <span className="text-destructive">*</span></FormLabel>
          <FormControl><Input {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="name_ar" render={({ field }) => (
        <FormItem>
          <FormLabel>Name (Arabic) <span className="text-destructive">*</span></FormLabel>
          <FormControl><Input {...field} dir="rtl" /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
    </div>
  )
}
```

- [ ] **Step 3: Add CatalogImageSection**

Append to `ServiceEditSections.tsx`:

```tsx
interface CatalogImageSectionProps {
  pendingFile: File | null
  currentUrl: string | null
  onFileChange: (f: File | null) => void
}

export function CatalogImageSection({ pendingFile, currentUrl, onFileChange }: CatalogImageSectionProps) {
  const thumbSrc = pendingFile ? URL.createObjectURL(pendingFile) : currentUrl

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB')
      return
    }
    onFileChange(file)
  }

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-sm">
        <ImageIcon className="h-3.5 w-3.5" />Catalog Image
      </Label>
      {thumbSrc ? (
        <div className="flex items-center gap-3">
          <img src={thumbSrc} alt="Service" className="h-16 w-16 rounded border object-cover" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => onFileChange(null)}
          >
            <X className="h-3 w-3" />Remove
          </Button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed rounded cursor-pointer hover:bg-muted/30 transition-colors">
          <Upload className="h-4 w-4 text-muted-foreground mb-1" />
          <span className="text-xs text-muted-foreground">Click to upload image (max 5 MB)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add StatusSection and DivisionSection**

Append to `ServiceEditSections.tsx`:

```tsx
export function StatusSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <FormField control={form.control} name="status" render={({ field }) => (
      <FormItem>
        <FormLabel>Status</FormLabel>
        <Select onValueChange={field.onChange} value={field.value}>
          <FormControl><SelectTrigger className="h-8"><SelectValue /></SelectTrigger></FormControl>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <FormMessage />
      </FormItem>
    )} />
  )
}

interface DivisionSectionProps {
  form: UseFormReturn<ServiceFormValues>
  mode: 'new' | 'edit'
  hasParent: boolean
}

export function DivisionSection({ form, mode, hasParent }: DivisionSectionProps) {
  const { data: divisions = [] } = useDivisions()
  const inherited = mode === 'new' && hasParent

  return (
    <FormField control={form.control} name="division" render={({ field }) => (
      <FormItem>
        <FormLabel>Division <span className="text-destructive">*</span></FormLabel>
        <Select onValueChange={field.onChange} value={field.value} disabled={inherited}>
          <FormControl>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={inherited ? '(inherited)' : 'Select division'} />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            {divisions.map((d) => (
              <SelectItem key={d.slug} value={d.slug}>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: d.color ?? '#94a3b8' }}
                  />
                  {d.name}
                  {d.short_name && (
                    <span className="text-muted-foreground text-xs">({d.short_name})</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {inherited && (
          <p className="text-[11px] text-muted-foreground">Inherited from parent service</p>
        )}
        <FormMessage />
      </FormItem>
    )} />
  )
}
```

- [ ] **Step 5: Add ContractSection and PricingSection**

Append to `ServiceEditSections.tsx`:

```tsx
export function ContractSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  const contractType = useWatch({ control: form.control, name: 'contract_type' })

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Contract Type
      </h4>
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
          <FormMessage />
        </FormItem>
      )} />
      {contractType === 'area' && (
        <FormField control={form.control} name="price_unit" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Price Unit (e.g. sqm)</FormLabel>
            <FormControl>
              <Input className="h-8 text-xs" {...field} value={field.value ?? ''} />
            </FormControl>
          </FormItem>
        )} />
      )}
    </div>
  )
}

interface PricingSectionProps {
  form: UseFormReturn<ServiceFormValues>
  type: 'normal' | 'contract' | 'mobile'
}

export function PricingSection({ form, type }: PricingSectionProps) {
  const contractType = useWatch({ control: form.control, name: 'contract_type' })
  const isGeneralContract = type === 'contract' && contractType === 'general'
  const isPreventiveContract = type === 'contract' && contractType === 'preventive'
  const emergencyLabel = isPreventiveContract ? 'Price per Visit (QAR)' : 'Emergency Price (QAR)'

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pricing</h4>
      <div className="grid grid-cols-2 gap-3">
        <FormField control={form.control} name="price" render={({ field }) => (
          <FormItem>
            <FormLabel>Price (QAR)</FormLabel>
            <FormControl>
              <Input
                type="number" step="0.01" {...field}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
              />
            </FormControl>
          </FormItem>
        )} />
        {isGeneralContract ? (
          <FormField control={form.control} name="discount" render={({ field }) => (
            <FormItem>
              <FormLabel>Discount %</FormLabel>
              <FormControl>
                <Input
                  type="number" step="0.1" {...field}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
                />
              </FormControl>
            </FormItem>
          )} />
        ) : (
          <FormField control={form.control} name="emergency_price" render={({ field }) => (
            <FormItem>
              <FormLabel>{emergencyLabel}</FormLabel>
              <FormControl>
                <Input
                  type="number" step="0.01" {...field}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
                />
              </FormControl>
            </FormItem>
          )} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Add DurationWarrantySection and InvoiceTextSection**

Append to `ServiceEditSections.tsx`:

```tsx
export function DurationWarrantySection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Duration &amp; Warranty
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <FormField control={form.control} name="duration" render={({ field }) => (
          <FormItem>
            <FormLabel>Duration (minutes)</FormLabel>
            <FormControl>
              <Input
                type="number" {...field}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
              />
            </FormControl>
          </FormItem>
        )} />
        <FormField control={form.control} name="warranty" render={({ field }) => (
          <FormItem>
            <FormLabel>Warranty (months)</FormLabel>
            <FormControl>
              <Input
                type="number" {...field}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
              />
            </FormControl>
          </FormItem>
        )} />
      </div>
    </div>
  )
}

export function InvoiceTextSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Invoice Text
      </h4>
      <div className="grid grid-cols-2 gap-3">
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
    </div>
  )
}
```

- [ ] **Step 7: Add FeatureFieldsSection**

Append to `ServiceEditSections.tsx`:

```tsx
export function FeatureFieldsSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  const { fields: inventoryFields, append: appendItem, remove: removeItem } = useFieldArray({
    control: form.control,
    name: 'inventory_items_list',
  })
  const { fields: qcFields, append: appendQc, remove: removeQc } = useFieldArray({
    control: form.control,
    name: 'qc_items',
  })
  const hasInventory = useWatch({ control: form.control, name: 'has_inventory' })
  const hasReminders = useWatch({ control: form.control, name: 'has_reminders' })
  const serviceType = useWatch({ control: form.control, name: 'service_type' })

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Features</h4>

      <FormField control={form.control} name="qc_checklist" render={({ field }) => (
        <FormItem className="flex items-center justify-between">
          <FormLabel className="text-sm font-normal">QC Checklist</FormLabel>
          <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
        </FormItem>
      )} />

      <FormField control={form.control} name="spare_parts" render={({ field }) => (
        <FormItem className="flex items-center justify-between">
          <FormLabel className="text-sm font-normal">Spare Parts Included</FormLabel>
          <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
        </FormItem>
      )} />

      {/* Inventory */}
      <div className="space-y-2">
        <FormField control={form.control} name="has_inventory" render={({ field }) => (
          <FormItem className="flex items-center justify-between">
            <FormLabel className="text-sm font-normal">Inventory Items</FormLabel>
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
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => removeItem(idx)}>
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
            <FormLabel className="text-sm font-normal">Reminders</FormLabel>
            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
          </FormItem>
        )} />
        {hasReminders && (
          <div className="ml-4 border-l-2 border-border pl-3">
            <FormField control={form.control} name="reminder_days" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Remind every N days</FormLabel>
                <FormControl>
                  <Input type="number" className="h-8 text-xs w-32" {...field}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
                  />
                </FormControl>
              </FormItem>
            )} />
          </div>
        )}
      </div>

      {/* Service Type */}
      <FormField control={form.control} name="service_type" render={({ field }) => (
        <FormItem>
          <FormLabel className="text-sm font-normal">Service Type</FormLabel>
          <div className="flex gap-2 mt-1">
            {(['standard', 'configurable'] as const).map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={field.value === t ? 'default' : 'outline'}
                className="h-7 text-[11px] capitalize"
                onClick={() => field.onChange(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
        </FormItem>
      )} />

      {serviceType === 'configurable' && (
        <FormField control={form.control} name="legacy_service_id" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Legacy Service ID</FormLabel>
            <FormControl>
              <Input className="h-8 text-xs" {...field} value={field.value ?? ''} />
            </FormControl>
          </FormItem>
        )} />
      )}

      {/* QC Items */}
      <div className="space-y-2">
        <h5 className="text-xs font-medium text-foreground">QC Items</h5>
        {qcFields.map((f, idx) => (
          <div key={f.id} className="flex gap-2 items-end">
            <FormField control={form.control} name={`qc_items.${idx}.label`} render={({ field }) => (
              <FormItem className="flex-1">
                {idx === 0 && <FormLabel className="text-xs">Label</FormLabel>}
                <FormControl><Input className="h-8 text-xs" {...field} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name={`qc_items.${idx}.max_score`} render={({ field }) => (
              <FormItem className="w-24">
                {idx === 0 && <FormLabel className="text-xs">Max Score</FormLabel>}
                <FormControl><Input type="number" className="h-8 text-xs" {...field} /></FormControl>
              </FormItem>
            )} />
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => removeQc(idx)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1"
          onClick={() => appendQc({ label: '', max_score: 10 })}>
          <Plus className="h-3 w-3" />Add QC Item
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Verify TypeScript is clean**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (ServiceEditDialog.tsx may still fail until Task 7).

- [ ] **Step 9: Commit**

```bash
git add src/components/services/ServiceEditSections.tsx
git commit -m "feat(services): add ServiceEditSections — Zod schema, toDefaults, 9 form section components"
```

---

## Task 7: ServiceEditDialog Rewrite

**Files:**
- Rewrite: `src/components/services/ServiceEditDialog.tsx`

- [ ] **Step 1: Replace the full file content**

```tsx
// src/components/services/ServiceEditDialog.tsx
'use client'

import { useState, useEffect, useMemo, type Resolver } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Form } from '@/components/ui/form'
import { cn } from '@/lib/utils'
import { useServiceTree, useCreateService, useUpdateService, type Service } from '@/hooks/useServices'
import { collectDescendantIds, buildTreeMap } from './ServiceTree'
import {
  serviceSchema, toDefaults, type ServiceFormValues,
  CoreSection, CatalogImageSection, StatusSection, DivisionSection,
  ContractSection, PricingSection, DurationWarrantySection,
  InvoiceTextSection, FeatureFieldsSection,
} from './ServiceEditSections'

interface ServiceEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'new' | 'edit'
  type: 'normal' | 'contract' | 'mobile'
  node: Service | null
  parentId: string | null
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
  const [parentOpen, setParentOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const createService = useCreateService()
  const updateService = useUpdateService()
  const { data: treeData = [] } = useServiceTree(type, [], open)

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema) as Resolver<ServiceFormValues>,
    defaultValues: toDefaults(node, type, parentId),
  })

  useEffect(() => {
    if (open) {
      form.reset(toDefaults(node, type, parentId))
      setPendingFile(null)
    }
  }, [open, node, parentId, type]) // eslint-disable-line react-hooks/exhaustive-deps

  // Parent combobox items — excludes the node itself and all its descendants
  const parentComboItems = useMemo(() => {
    const treeMap = buildTreeMap(treeData)
    const excludeIds = new Set<string>()
    if (node) {
      excludeIds.add(node.id)
      collectDescendantIds(node.id, treeMap).forEach((id) => excludeIds.add(id))
    }
    type ComboItem = {
      id: string; name_en: string; name_ar: string | null; depth: number; breadcrumb: string
    }
    function traverse(key: string | null, depth: number, breadcrumb: string): ComboItem[] {
      const children = treeMap.get(key) ?? []
      const result: ComboItem[] = []
      for (const child of children) {
        if (excludeIds.has(child.id)) continue
        result.push({ id: child.id, name_en: child.name_en, name_ar: child.name_ar, depth, breadcrumb })
        const next = breadcrumb ? `${breadcrumb} > ${child.name_en}` : child.name_en
        result.push(...traverse(child.id, depth + 1, next))
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

  async function onSubmit(values: ServiceFormValues) {
    try {
      const supabase = createClient()
      const serviceId = mode === 'edit' && node ? node.id : crypto.randomUUID()

      let catalogImageUrl: string | undefined
      if (pendingFile) {
        const ext = pendingFile.name.split('.').pop() ?? 'jpg'
        const path = `catalog/${serviceId}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('service-photos')
          .upload(path, pendingFile, { upsert: true })
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage
          .from('service-photos')
          .getPublicUrl(path)
        catalogImageUrl = publicUrl
      }

      const payload = {
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
        duration: values.duration,
        warranty: values.warranty,
        invoice_text_en: type !== 'contract' ? values.invoice_text_en || null : null,
        invoice_text_ar: type !== 'contract' ? values.invoice_text_ar || null : null,
        instructions: false,
        reminder_days: values.has_reminders ? values.reminder_days : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inventory_items: values.has_inventory ? (values.inventory_items_list as any) : null,
        qc_checklist: type !== 'contract' ? values.qc_checklist : null,
        spare_parts: type !== 'contract' ? values.spare_parts : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service_type: type !== 'contract' ? (values.service_type as any) : null,
        legacy_service_id: values.service_type === 'configurable' ? values.legacy_service_id || null : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        qc_items: type !== 'contract' && values.qc_items.length > 0 ? (values.qc_items as any) : null,
        ...(catalogImageUrl !== undefined && { catalog_image_url: catalogImageUrl }),
      }

      if (mode === 'new') {
        await createService.mutateAsync({ ...payload, id: serviceId, sort_order: 0, treeType: type })
      } else {
        const changedFields = Object.keys(form.formState.dirtyFields)
        await updateService.mutateAsync({ id: serviceId, ...payload, treeType: type, changedFields })
      }
      toast.success('Service saved')
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to save service')
      console.error(err)
    }
  }

  const isSaving = createService.isPending || updateService.isPending
  const title = mode === 'new'
    ? `New ${type === 'contract' ? 'Contract ' : type === 'mobile' ? 'Mobile App ' : ''}Service`
    : 'Edit Service'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentImageUrl = (node as any)?.catalog_image_url ?? null

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto sm:rounded-lg rounded-none">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              <CoreSection form={form} />
              <CatalogImageSection
                pendingFile={pendingFile}
                currentUrl={currentImageUrl}
                onFileChange={setPendingFile}
              />
              <div className="grid grid-cols-2 gap-3">
                <StatusSection form={form} />
                <DivisionSection form={form} mode={mode} hasParent={parentId !== null} />
              </div>

              {/* Parent service combobox */}
              <div>
                <label className="text-sm font-medium">Parent Service (optional)</label>
                <Popover open={parentOpen} onOpenChange={setParentOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal h-9 text-sm mt-1.5"
                    >
                      {parentComboItems.find((i) => i.id === form.watch('parent_id'))?.name_en ?? 'None (root level)'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[420px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search services…" />
                      <CommandList className="max-h-60">
                        <CommandEmpty>No services found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="__none__"
                            onSelect={() => {
                              form.setValue('parent_id', null, { shouldDirty: true })
                              setParentOpen(false)
                            }}
                          >
                            <Check className={cn('mr-2 h-4 w-4', form.watch('parent_id') === null ? 'opacity-100' : 'opacity-0')} />
                            <span className="text-sm text-muted-foreground italic">None (root level)</span>
                          </CommandItem>
                          {parentComboItems.map((item) => (
                            <CommandItem
                              key={item.id}
                              value={`${item.breadcrumb} ${item.name_en}`}
                              onSelect={() => {
                                form.setValue('parent_id', item.id, { shouldDirty: true })
                                setParentOpen(false)
                              }}
                            >
                              <Check className={cn('mr-2 h-4 w-4 shrink-0', form.watch('parent_id') === item.id ? 'opacity-100' : 'opacity-0')} />
                              <div style={{ paddingInlineStart: item.depth * 16 }}>
                                {item.breadcrumb && (
                                  <div className="text-[10px] text-muted-foreground leading-tight">{item.breadcrumb}</div>
                                )}
                                <div className="text-xs">
                                  {item.name_en}
                                  {item.name_ar && (
                                    <span className="text-muted-foreground ml-1.5">{item.name_ar}</span>
                                  )}
                                </div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {type === 'contract' && <ContractSection form={form} />}
              <PricingSection form={form} type={type} />
              <DurationWarrantySection form={form} />
              {type !== 'contract' && <InvoiceTextSection form={form} />}
              {type !== 'contract' && <FeatureFieldsSection form={form} />}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Unsaved-changes guard */}
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

- [ ] **Step 2: Verify TypeScript is clean**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (page.tsx may still error until Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/components/services/ServiceEditDialog.tsx
git commit -m "feat(services): rewrite ServiceEditDialog — all DB fields, image upload, parent combobox"
```

---

## Task 8: page.tsx — Remove featureFilters

**Files:**
- Modify: `src/app/(dashboard)/master-data/services/page.tsx`

- [ ] **Step 1: Replace the full file content**

```tsx
// src/app/(dashboard)/master-data/services/page.tsx
'use client'

import { useState } from 'react'
import {
  ListTree, FileText, Smartphone, Bell, Package, Tag,
  Filter, Plus, Ruler, Percent,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
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
    setContractTypeFilter('all')
    setVisitedTabs((prev) => new Set([...prev, t]))
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
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/master-data/services/page.tsx
git commit -m "feat(services): remove featureFilters from ServicesPage, clean up filter bar"
```

---

## Task 9: Integration Test + PROGRESS.md

- [ ] **Step 1: Full TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 2: Run tests**

```bash
cd D:/MMS && npm test -- --passWithNoTests 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3: Build**

```bash
cd D:/MMS && npm run build 2>&1 | tail -20
```

Expected: build succeeds. Confirm `/master-data/services` appears in the route list.

- [ ] **Step 4: Smoke test in browser**

Start dev server: `npm run dev`

Verify:
- [ ] `/master-data/services` loads — 7 tabs visible, sticky header with 7 columns appears
- [ ] Normal Services tab: tree rows render with Level badges (L1/L2/L3), pricing, reminders, details cells
- [ ] Branch row click → expands/collapses children
- [ ] Leaf row click → opens `ServiceEditDialog`
- [ ] Hover on any row → Order up/down + Plus + Pencil + Archive buttons visible in Actions cell
- [ ] Archive button → AlertDialog with service name → Confirm → row disappears
- [ ] Plus button → dialog opens with `parentId` pre-set (parent_id field shows the parent)
- [ ] New Service button → blank dialog opens
- [ ] Dialog: Names, Catalog Image upload zone, Status, Division, Pricing, Duration/Warranty, Invoice Text, Features all render
- [ ] Catalog Image: pick a file → thumbnail appears; Remove → zone reappears
- [ ] Contract tab: Contract Type pills appear; Area → price unit field; General → Discount field
- [ ] Division filter (DivisionMultiSelect) → narrows tree rows
- [ ] Other pages (purchase, sales, master-data) still have correct `p-6` padding via PageWrapper

- [ ] **Step 5: Update PROGRESS.md and commit**

In `PROGRESS.md`, add to `## ✅ Completed`:

```
- [2026-04-21] **Services Hub — Tree & Dialog Redesign** — `supabase/migrations/20260421000001_services_additions.sql`, `src/hooks/useServices.ts`, `src/components/services/ServiceTreeRow.tsx`, `src/components/services/ServiceTree.tsx`, `src/components/services/ServiceEditSections.tsx`, `src/components/services/ServiceEditDialog.tsx`, `src/components/services/ServiceTableView.tsx`, `src/components/services/ContractTableView.tsx`, `src/app/(dashboard)/master-data/services/page.tsx` — 7-column fixed-width tree, sticky header, level badges, archive soft-delete, full edit dialog with image upload and all DB fields
```

Update `## 🔄 In Progress` to the next plan.

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — Services Hub Tree & Dialog Redesign complete"
```
