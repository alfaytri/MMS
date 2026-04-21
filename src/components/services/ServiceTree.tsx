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
