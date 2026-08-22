'use client'

import { useMemo } from 'react'
import { ServiceTree, type ReorderArgs } from './ServiceTree'
import { useServiceTree, useReorderServices, type Service } from '@/hooks/useServices'

interface ContractTableViewProps {
  typeFilter: 'all' | 'preventive' | 'area' | 'general'
  divisionFilter: string[]
  searchQuery: string
  linkageFilter: string[]
  dragMode: boolean
  enabled: boolean
  onEdit: (node: Service) => void
  onAddChild: (parentId: string) => void
  onShowHistory: (serviceId: string, serviceName: string) => void
}

export function ContractTableView({
  typeFilter,
  divisionFilter,
  searchQuery,
  linkageFilter,
  dragMode,
  enabled,
  onEdit,
  onAddChild,
  onShowHistory,
}: ContractTableViewProps) {
  const { data = [], isLoading, error } = useServiceTree('contract', divisionFilter, enabled)
  const reorder = useReorderServices()

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return data
    const directMatches = new Set(
      data.filter((s) => s.contract_type === typeFilter).map((s) => s.id),
    )
    if (directMatches.size === 0) return []
    const parentMap = new Map(data.map((s) => [s.id, s.parent_id ?? null]))
    const keepIds = new Set(directMatches)
    function addAncestors(id: string) {
      const parent = parentMap.get(id)
      if (parent && !keepIds.has(parent)) {
        keepIds.add(parent)
        addAncestors(parent)
      }
    }
    directMatches.forEach((id) => addAncestors(id))
    return data.filter((s) => keepIds.has(s.id))
  }, [data, typeFilter])

  return (
    <ServiceTree
      data={filtered}
      isLoading={isLoading}
      error={error ?? null}
      treeType="contract"
      searchQuery={searchQuery}
      linkageFilter={linkageFilter}
      dragMode={dragMode}
      onEdit={onEdit}
      onAddChild={onAddChild}
      onReorder={(args: ReorderArgs) => reorder.mutate(args)}
      onShowHistory={onShowHistory}
    />
  )
}
