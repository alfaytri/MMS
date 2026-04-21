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

export function buildTreeMap(flat: Service[]): Map<string | null, Service[]> {
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
    if (result.has(id)) return // cycle guard
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
