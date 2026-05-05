// src/components/services/ServiceTree.tsx
'use client'

import { useState, useMemo } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { ServiceTreeRow } from './ServiceTreeRow'
import { ServiceEditDialog } from './ServiceEditDialog'
import { useDivisions } from '@/hooks/useDivisions'
import { useAllServiceInstructionLinks, useReorderServicesBulk } from '@/hooks/useServices'
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

function applyFilters(
  flat: Service[],
  searchQuery: string,
  linkageFilter: string[],
  instructionServiceIds: Set<string>,
): Service[] {
  let result = flat

  if (searchQuery.trim()) {
    const lower = searchQuery.toLowerCase()
    const parentMap = new Map(flat.map((s) => [s.id, s.parent_id ?? null]))
    const directMatches = new Set(
      flat
        .filter(
          (s) =>
            s.name_en.toLowerCase().includes(lower) ||
            (s.name_ar && s.name_ar.toLowerCase().includes(lower)),
        )
        .map((s) => s.id),
    )
    const keepIds = new Set(directMatches)
    function addAncestors(id: string) {
      const parent = parentMap.get(id)
      if (parent && !keepIds.has(parent)) {
        keepIds.add(parent)
        addAncestors(parent)
      }
    }
    directMatches.forEach((id) => addAncestors(id))
    result = result.filter((s) => keepIds.has(s.id))
  }

  if (linkageFilter.length > 0) {
    const linkMatches = new Set(
      result
        .filter((s) => {
          if (
            linkageFilter.includes('inventory') &&
            !(Array.isArray(s.inventory_items) && (s.inventory_items as unknown[]).length > 0)
          )
            return false
          if (linkageFilter.includes('reminders') && s.reminder_days == null) return false
          if (linkageFilter.includes('instructions') && !instructionServiceIds.has(s.id))
            return false
          if (
            linkageFilter.includes('qc') &&
            !(
              s.qc_checklist ||
              (Array.isArray(s.qc_items) && (s.qc_items as unknown[]).length > 0)
            )
          )
            return false
          if (linkageFilter.includes('parts') && !s.spare_parts) return false
          return true
        })
        .map((s) => s.id),
    )
    const parentMap = new Map(flat.map((s) => [s.id, s.parent_id ?? null]))
    const keepIds = new Set(linkMatches)
    function addAncestors(id: string) {
      const parent = parentMap.get(id)
      if (parent && !keepIds.has(parent)) {
        keepIds.add(parent)
        addAncestors(parent)
      }
    }
    linkMatches.forEach((id) => addAncestors(id))
    result = result.filter((s) => keepIds.has(s.id))
  }

  return result
}

const COLUMNS = [
  { label: 'Order', width: 'w-10' },
  { label: 'Service', width: 'w-[600px]' },
  { label: 'Division', width: 'w-[110px]' },
  { label: 'Invoice Text', width: 'w-[170px]' },
  { label: 'Pricing / Unit', width: 'w-[150px]' },
  { label: 'Reminders', width: 'w-[80px]' },
  { label: 'Details', width: 'w-[120px]' },
  { label: 'Linked', width: 'w-[100px]' },
  { label: 'Actions', width: 'w-[96px]' },
]

interface ServiceTreeProps {
  data: Service[]
  isLoading: boolean
  error: Error | null
  treeType: string
  searchQuery?: string
  linkageFilter?: string[]
  dragMode?: boolean
  onEdit: (node: Service) => void
  onAddChild: (parentId: string) => void
  onReorder: (args: ReorderArgs) => void
}

export function ServiceTree({
  data,
  isLoading,
  error,
  treeType,
  searchQuery = '',
  linkageFilter = [],
  dragMode = false,
  onEdit,
  onAddChild,
  onReorder,
}: ServiceTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [viewNode, setViewNode] = useState<Service | null>(null)

  const { data: divisions = [] } = useDivisions()
  const { data: instructionLinks = [] } = useAllServiceInstructionLinks()
  const reorderBulk = useReorderServicesBulk()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const divisionMap = useMemo(
    () => new Map(divisions.map((d) => [d.slug, d.short_name ?? d.name])),
    [divisions],
  )

  const instructionServiceIds = useMemo(
    () => new Set(instructionLinks.map((l) => l.service_id)),
    [instructionLinks],
  )

  const filteredData = useMemo(
    () => applyFilters(data, searchQuery, linkageFilter, instructionServiceIds),
    [data, searchQuery, linkageFilter, instructionServiceIds],
  )

  const treeMap = useMemo(() => buildTreeMap(filteredData), [filteredData])

  // Flat ordered list of all visible IDs for SortableContext
  const allVisibleIds = useMemo(() => filteredData.map((s) => s.id), [filteredData])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeService = filteredData.find((s) => s.id === active.id)
    const overService = filteredData.find((s) => s.id === over.id)
    if (!activeService || !overService) return

    // Only allow reorder within the same parent
    const activeParent = activeService.parent_id ?? null
    const overParent = overService.parent_id ?? null
    if (activeParent !== overParent) return

    // Get all siblings sorted by current sort_order
    const siblings = filteredData
      .filter((s) => (s.parent_id ?? null) === activeParent)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    const oldIdx = siblings.findIndex((s) => s.id === active.id)
    const newIdx = siblings.findIndex((s) => s.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return

    const reordered = arrayMove(siblings, oldIdx, newIdx)
    const updates = reordered.map((s, i) => ({ id: s.id, sort_order: i * 10 }))
    reorderBulk.mutate({ updates, treeType })
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

  const activeService = activeId ? filteredData.find((s) => s.id === activeId) : null

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
          dragMode={dragMode}
          divisionMap={divisionMap}
          instructionServiceIds={instructionServiceIds}
          onToggleExpand={toggleExpand}
          onEdit={onEdit}
          onView={setViewNode}
          onAddChild={onAddChild}
          onReorder={onReorder}
        />
        {hasChildren && isExpanded && children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  const header = (
    <div className="sticky top-0 z-10 flex items-center bg-muted/50 border-b">
      {dragMode && <div className="w-8 shrink-0" />}
      {COLUMNS.map((col) => (
        <div
          key={col.label}
          className={cn(
            col.width,
            'px-2 py-1.5 shrink-0 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground',
          )}
        >
          {col.label}
        </div>
      ))}
    </div>
  )

  const viewSheet = (
    <ServiceEditDialog
      open={viewNode !== null}
      onOpenChange={(v) => { if (!v) setViewNode(null) }}
      mode="edit"
      type={treeType as 'normal' | 'contract' | 'mobile'}
      node={viewNode}
      parentId={null}
      readOnly
    />
  )

  if (dragMode) {
    return (
      <>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={allVisibleIds} strategy={verticalListSortingStrategy}>
            {header}
            <div>{roots.map((root) => renderNode(root, 0))}</div>
          </SortableContext>
          <DragOverlay>
            {activeService ? (
              <div className="flex items-center min-h-[40px] bg-card border border-primary/40 rounded shadow-lg opacity-90 px-3 gap-2">
                <span className="text-xs font-medium truncate">{activeService.name_en}</span>
                {activeService.name_ar && (
                  <span className="text-[10px] text-muted-foreground truncate">{activeService.name_ar}</span>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        {viewSheet}
      </>
    )
  }

  return (
    <>
      <div>
        {header}
        <div>{roots.map((root) => renderNode(root, 0))}</div>
      </div>
      {viewSheet}
    </>
  )
}
