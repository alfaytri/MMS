'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EntityNode } from './EntityNode'
import { humanizeModule } from '@/lib/utils/auditPermissionMap'
import type { ActivityLog } from '@/hooks/useActivityLog'

interface EntityGroup {
  entityId: string
  entityName: string
  entityType: string
  entries: ActivityLog[]
}

interface SectionNodeProps {
  module: string
  entities: EntityGroup[]
  totalCount: number
  defaultOpen?: boolean
  searchTerm?: string
}

const NAME_KEYS = [
  'name', 'name_en', 'name_ar', 'full_name', 'brand',
  'po_number', 'order_number', 'so_number',
  'bill_number', 'invoice_number', 'return_number', 'rcv_number',
  'code', 'label', 'reference', 'title', 'sku',
]

function extractName(data: Record<string, unknown> | null): string | null {
  if (!data) return null
  for (const key of NAME_KEYS) {
    const val = data[key]
    if (val != null && val !== '') return String(val)
  }
  return null
}

function resolveEntityType(entry: ActivityLog): string {
  return entry.entity_type?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? '—'
}

export function groupByEntity(
  entries: ActivityLog[],
  nameLookup?: Map<string, string>,
): EntityGroup[] {
  const map = new Map<string, EntityGroup>()
  for (const entry of entries) {
    const key = entry.entity_id
    if (!map.has(key)) {
      map.set(key, {
        entityId: key,
        entityName: key.slice(0, 8),
        entityType: resolveEntityType(entry),
        entries: [],
      })
    }
    map.get(key)!.entries.push(entry)
  }

  for (const group of map.values()) {
    let bestName: string | null = null
    for (const entry of group.entries) {
      bestName = extractName(entry.new_data as Record<string, unknown> | null)
        ?? extractName(entry.old_data as Record<string, unknown> | null)
      if (bestName) break
    }
    if (!bestName && nameLookup) {
      bestName = nameLookup.get(group.entityId) ?? null
    }
    if (!bestName) {
      for (const entry of group.entries) {
        if (entry.details) { bestName = entry.details; break }
      }
    }
    if (bestName) group.entityName = bestName
  }

  return Array.from(map.values())
}

export function SectionNode({
  module, entities, totalCount, defaultOpen = false, searchTerm,
}: SectionNodeProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full py-3 px-4 text-left hover:bg-muted/50 transition-colors"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="font-semibold text-sm">{humanizeModule(module)}</span>
        <Badge variant="secondary" className="ml-auto text-xs">
          {totalCount} {totalCount === 1 ? 'change' : 'changes'}
        </Badge>
      </button>

      {open && (
        <div className="pb-2">
          {entities.map((entity) => (
            <EntityNode
              key={entity.entityId}
              entityId={entity.entityId}
              entityName={entity.entityName}
              entityType={entity.entityType}
              entries={entity.entries}
              defaultOpen={!!searchTerm}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  )
}
