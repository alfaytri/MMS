// src/components/master-data/subscriptions/ServicePickerTree.tsx
'use client'

import { useState, useMemo } from 'react'
import { Search, ChevronRight, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { buildTreeMap, collectDescendantIds } from '@/components/services/ServiceTree'
import type { PackageServiceEntry } from '@/hooks/useSubscriptionPackages'

// Re-export so consumers can import alongside this component if needed
export type { PackageServiceEntry }

type PickerService = {
  id: string
  name_en: string
  parent_id: string | null
  tree_type: string | null
}

function useAllServicesForPicker() {
  return useQuery({
    queryKey: ['services-all-picker'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('services')
        .select('id, name_en, parent_id, tree_type')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as PickerService[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Bi-state: checked = any descendant (or self for leaves) is selected.
function getCheckState(
  nodeId: string,
  treeMap: Map<string | null, PickerService[]>,
  selectedSet: Set<string>,
): 'checked' | 'unchecked' {
  const descendants = collectDescendantIds(nodeId, treeMap as any)
  if (descendants.size === 0) {
    return selectedSet.has(nodeId) ? 'checked' : 'unchecked'
  }
  return [...descendants].some((id) => selectedSet.has(id)) ? 'checked' : 'unchecked'
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ServicePickerTreeProps {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ServicePickerTree({
  selectedIds,
  onChange,
}: ServicePickerTreeProps) {
  const { data: services = [], isLoading, error } = useAllServicesForPicker()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const treeMap = useMemo(() => buildTreeMap(services as any), [services])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const filteredServices = useMemo(() => {
    if (!search.trim()) return services
    const q = search.toLowerCase()
    const parentMap = new Map(services.map((s) => [s.id, s.parent_id ?? null]))
    const directMatches = new Set(
      services.filter((s) => s.name_en.toLowerCase().includes(q)).map((s) => s.id),
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
    return services.filter((s) => keepIds.has(s.id))
  }, [services, search])

  const filteredTreeMap = useMemo(
    () => buildTreeMap(filteredServices as any),
    [filteredServices],
  )

  // -------------------------------------------------------------------------
  // Toggle a node — any-selected → deselect all; none → select all
  // -------------------------------------------------------------------------
  function toggleNode(nodeId: string) {
    const descendants = [...collectDescendantIds(nodeId, treeMap as any)]
    const isLeaf = descendants.length === 0
    const targets = isLeaf ? [nodeId] : descendants
    const anySelected = targets.some((id) => selectedSet.has(id))
    const next = new Set(selectedSet)
    if (anySelected) {
      targets.forEach((id) => next.delete(id))
    } else {
      targets.forEach((id) => next.add(id))
    }
    onChange([...next])
  }

  // -------------------------------------------------------------------------
  // Select all leaves under a branch (or globally)
  // -------------------------------------------------------------------------
  function selectBranch(nodeId: string | null) {
    const next = new Set(selectedSet)
    if (nodeId === null) {
      // global: all leaves
      services.forEach((s) => {
        if ((treeMap.get(s.id) ?? []).length === 0) next.add(s.id)
      })
    } else {
      const descendants = collectDescendantIds(nodeId, treeMap as any)
      const isLeaf = descendants.size === 0
      if (isLeaf) {
        next.add(nodeId)
      } else {
        descendants.forEach((id) => next.add(id))
      }
    }
    onChange([...next])
  }

  function clearAll() {
    onChange([])
  }

  // -------------------------------------------------------------------------
  // Recursive renderer
  // -------------------------------------------------------------------------
  function renderNode(service: PickerService, depth: number) {
    const children = filteredTreeMap.get(service.id) ?? []
    const checkState = getCheckState(service.id, treeMap as any, selectedSet)
    const isLeaf = (treeMap.get(service.id) ?? []).length === 0

    const isCollapsed = !isLeaf && collapsed.has(service.id)

    function toggleCollapse(e: React.MouseEvent) {
      e.preventDefault()
      setCollapsed((prev) => {
        const next = new Set(prev)
        next.has(service.id) ? next.delete(service.id) : next.add(service.id)
        return next
      })
    }

    return (
      <div key={service.id}>
        <div
          className="flex items-center gap-1 py-1 rounded hover:bg-muted/40 px-1 group"
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          {/* Collapse toggle — only for parent nodes */}
          {!isLeaf ? (
            <button
              type="button"
              onClick={toggleCollapse}
              className="text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              {isCollapsed
                ? <ChevronRight className="h-3 w-3" />
                : <ChevronDown className="h-3 w-3" />}
            </button>
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}
          <Checkbox
            id={`svc-${service.id}`}
            checked={checkState === 'checked'}
            onCheckedChange={() => toggleNode(service.id)}
          />
          <Label
            htmlFor={`svc-${service.id}`}
            className="text-xs cursor-pointer flex-1"
          >
            {service.name_en}
          </Label>
          {!isLeaf && (
            <button
              type="button"
              onClick={() => selectBranch(service.id)}
              className="hidden group-hover:inline text-[10px] text-primary px-1 hover:underline"
            >
              Select all
            </button>
          )}
        </div>
        {!isCollapsed && children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  const roots = filteredTreeMap.get(null) ?? []

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
        Loading services…
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (error) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-destructive">
        Failed to load services. Please try again.
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="border rounded-md overflow-hidden">
      {/* Search bar + bulk actions */}
      <div className="p-2 border-b space-y-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            className="h-7 text-xs pl-7"
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] text-primary"
            onClick={() => selectBranch(null)}
          >
            Select All
          </Button>
          <span className="text-muted-foreground text-[10px]">·</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] text-muted-foreground"
            onClick={clearAll}
          >
            Clear All
          </Button>
        </div>
      </div>

      {/* Tree */}
      <div className="max-h-56 overflow-y-auto p-1">
        {roots.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No services found.
          </p>
        ) : (
          roots.map((root) => renderNode(root, 0))
        )}
      </div>
    </div>
  )
}
