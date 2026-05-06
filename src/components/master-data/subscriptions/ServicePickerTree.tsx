// src/components/master-data/subscriptions/ServicePickerTree.tsx
'use client'

import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
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
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as PickerService[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// IndeterminateCheckbox — uses Base UI's native indeterminate prop directly.
// ---------------------------------------------------------------------------
function IndeterminateCheckbox({
  id,
  checked,
  indeterminate,
  onCheckedChange,
}: {
  id: string
  checked: boolean
  indeterminate: boolean
  onCheckedChange: () => void
}) {
  return (
    <Checkbox
      id={id}
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={onCheckedChange}
    />
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCheckState(
  nodeId: string,
  treeMap: Map<string | null, PickerService[]>,
  selectedSet: Set<string>,
): 'checked' | 'unchecked' | 'indeterminate' {
  const descendants = collectDescendantIds(nodeId, treeMap as any)
  if (descendants.size === 0) {
    return selectedSet.has(nodeId) ? 'checked' : 'unchecked'
  }
  const selectedCount = [...descendants].filter((id) => selectedSet.has(id)).length
  if (selectedCount === 0) return 'unchecked'
  if (selectedCount === descendants.size) return 'checked'
  return 'indeterminate'
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ServicePickerTreeProps {
  selectedIds: string[]
  overrides: Record<string, number | null>
  onChange: (ids: string[], overrides: Record<string, number | null>) => void
  packageDiscountPercent: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ServicePickerTree({
  selectedIds,
  overrides,
  onChange,
  packageDiscountPercent,
}: ServicePickerTreeProps) {
  const { data: services = [], isLoading, error } = useAllServicesForPicker()
  const [search, setSearch] = useState('')

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
  // Toggle a node — for branches, toggles all leaf descendants
  // -------------------------------------------------------------------------
  function toggleNode(nodeId: string) {
    const descendants = [...collectDescendantIds(nodeId, treeMap as any)]
    const isLeaf = descendants.length === 0
    const targets = isLeaf ? [nodeId] : descendants
    const allSelected = targets.every((id) => selectedSet.has(id))
    let next: Set<string>
    if (allSelected) {
      next = new Set(selectedSet)
      targets.forEach((id) => next.delete(id))
    } else {
      next = new Set(selectedSet)
      targets.forEach((id) => next.add(id))
    }
    const nextOverrides = { ...overrides }
    if (allSelected) targets.forEach((id) => delete nextOverrides[id])
    onChange([...next], nextOverrides)
  }

  // -------------------------------------------------------------------------
  // Per-service discount override
  // -------------------------------------------------------------------------
  function setOverride(serviceId: string, value: string) {
    if (value === '') {
      onChange(selectedIds, { ...overrides, [serviceId]: null })
      return
    }
    const parsed = parseFloat(value)
    if (isNaN(parsed) || parsed < 0 || parsed > 100) return
    onChange(selectedIds, { ...overrides, [serviceId]: parsed })
  }

  // -------------------------------------------------------------------------
  // Recursive renderer
  // -------------------------------------------------------------------------
  function renderNode(service: PickerService, depth: number) {
    const children = filteredTreeMap.get(service.id) ?? []
    const checkState = getCheckState(service.id, treeMap as any, selectedSet)
    const isLeaf = (treeMap.get(service.id) ?? []).length === 0
    const isSelected = selectedSet.has(service.id)

    return (
      <div key={service.id}>
        <div
          className="flex items-center gap-2 py-1 rounded hover:bg-muted/40 px-1"
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          <IndeterminateCheckbox
            id={`svc-${service.id}`}
            checked={checkState === 'checked'}
            indeterminate={checkState === 'indeterminate'}
            onCheckedChange={() => toggleNode(service.id)}
          />
          <Label
            htmlFor={`svc-${service.id}`}
            className="text-xs cursor-pointer flex-1"
          >
            {service.name_en}
          </Label>
          {isLeaf && isSelected && (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="h-5 w-16 text-[10px] px-1"
                placeholder={`${packageDiscountPercent}% (pkg)`}
                value={overrides[service.id] ?? ''}
                onChange={(e) => setOverride(service.id, e.target.value)}
              />
              <span className="text-[10px] text-muted-foreground">%</span>
            </div>
          )}
        </div>
        {children.map((child) => renderNode(child, depth + 1))}
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
      {/* Search bar */}
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            className="h-7 text-xs pl-7"
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
