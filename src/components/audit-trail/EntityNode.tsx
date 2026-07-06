'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ChangeEntry } from './ChangeEntry'
import type { ActivityLog } from '@/hooks/useActivityLog'

interface EntityNodeProps {
  entityId: string
  entityName: string
  entityType: string
  entries: ActivityLog[]
  defaultOpen?: boolean
  searchTerm?: string
}

export function EntityNode({
  entityName, entityType, entries, defaultOpen = false, searchTerm,
}: EntityNodeProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="ml-4 border-l border-border/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-1.5 pl-3 pr-2 text-left hover:bg-muted/50 rounded-r-md transition-colors"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-sm font-medium truncate">{entityName}</span>
        <Badge variant="outline" className="text-[10px] shrink-0">{entityType}</Badge>
        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          {entries.length} {entries.length === 1 ? 'change' : 'changes'}
        </span>
      </button>

      {open && (
        <div className="ml-4 pl-3 border-l border-border/30">
          {entries.map((entry) => (
            <ChangeEntry key={entry.id} entry={entry} searchTerm={searchTerm} />
          ))}
        </div>
      )}
    </div>
  )
}
