'use client'

import { useMemo } from 'react'
import { SectionNode, groupByEntity } from './SectionNode'
import type { ActivityLog } from '@/hooks/useActivityLog'
import { useAuditEntityNames } from '@/hooks/useAuditEntityNames'
import { Loader2, SearchX } from 'lucide-react'

interface AuditTreeProps {
  logs: ActivityLog[]
  isLoading: boolean
  searchTerm?: string
}

export function AuditTree({ logs, isLoading, searchTerm }: AuditTreeProps) {
  const { data: nameLookup } = useAuditEntityNames(logs)

  const sections = useMemo(() => {
    const map = new Map<string, ActivityLog[]>()
    for (const log of logs) {
      const mod = log.module ?? 'unknown'
      if (!map.has(mod)) map.set(mod, [])
      map.get(mod)!.push(log)
    }
    return Array.from(map.entries()).map(([module, entries]) => ({
      module,
      entities: groupByEntity(entries, nameLookup),
      totalCount: entries.length,
    }))
  }, [logs, nameLookup])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading audit trail…
      </div>
    )
  }

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <SearchX className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">No audit entries found</p>
        <p className="text-xs mt-1">Try adjusting your filters or date range</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <SectionNode
          key={section.module}
          module={section.module}
          entities={section.entities}
          totalCount={section.totalCount}
          defaultOpen={!!searchTerm}
          searchTerm={searchTerm}
        />
      ))}
    </div>
  )
}
