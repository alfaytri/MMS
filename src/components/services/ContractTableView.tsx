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
    />
  )
}
