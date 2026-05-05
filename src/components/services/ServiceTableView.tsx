'use client'

import { ServiceTree, type ReorderArgs } from './ServiceTree'
import { useServiceTree, useReorderServices, type Service } from '@/hooks/useServices'

interface ServiceTableViewProps {
  serviceType: 'normal' | 'mobile'
  divisionFilter: string[]
  searchQuery: string
  linkageFilter: string[]
  dragMode: boolean
  enabled: boolean
  onEdit: (node: Service) => void
  onAddChild: (parentId: string) => void
}

export function ServiceTableView({
  serviceType,
  divisionFilter,
  searchQuery,
  linkageFilter,
  dragMode,
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
      searchQuery={searchQuery}
      linkageFilter={linkageFilter}
      dragMode={dragMode}
      onEdit={onEdit}
      onAddChild={onAddChild}
      onReorder={(args: ReorderArgs) => reorder.mutate(args)}
    />
  )
}
