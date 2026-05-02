// src/components/services/inventory/ServiceLinksColumnBrowser.tsx
'use client'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  buildParentIdSet,
  type ServiceNode,
  type ServiceInventoryLinkFull,
} from './serviceInventoryHelpers'

// ─── ColumnPanel ──────────────────────────────────────────────────────────────

interface ColumnPanelProps {
  colIdx: number
  nodes: ServiceNode[]
  selectedBranchId: string | undefined   // which branch is active in this column
  selectedLeafId: string | null          // which leaf is open (may be in any column)
  isLeaf: (id: string) => boolean
  linksByService: Map<string, ServiceInventoryLinkFull[]>
  onSelect: (colIdx: number, id: string) => void
  isLastColumn: boolean                  // last column gets extra width for long leaf names
}

const ColumnPanel = React.memo(function ColumnPanel({
  colIdx,
  nodes,
  selectedBranchId,
  selectedLeafId,
  isLeaf,
  linksByService,
  onSelect,
  isLastColumn,
}: ColumnPanelProps) {
  if (nodes.length === 0) return null

  return (
    <div className={cn(
      'shrink-0 border-r border-border overflow-y-auto flex flex-col bg-background',
      isLastColumn ? 'w-80' : 'w-52',
    )}>
      {nodes.map((node) => {
        const leaf = isLeaf(node.id)
        const isActive = leaf
          ? selectedLeafId === node.id
          : selectedBranchId === node.id
        const links = leaf ? (linksByService.get(node.id) ?? []) : []
        const hasSupply = links.some((l) => l.link_type === 'supply')

        return (
          <button
            key={node.id}
            onClick={() => onSelect(colIdx, node.id)}
            aria-label={
              leaf
                ? `${node.name_en} — ${hasSupply ? 'supply item linked' : 'no supply item'}`
                : node.name_en
            }
            className={cn(
              'w-full text-left px-3 py-2.5 flex items-center justify-between gap-2',
              'border-b border-border/30 hover:bg-muted/30 transition-colors',
              isActive && 'bg-primary/10 text-primary',
            )}
          >
            <span
              className={cn(
                'flex-1 truncate text-xs leading-snug',
                isActive ? 'font-semibold' : 'font-normal text-foreground',
              )}
            >
              {node.name_en}
            </span>

            <span className="shrink-0 flex items-center">
              {leaf ? (
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    hasSupply ? 'bg-emerald-500' : 'bg-amber-400',
                  )}
                  title={hasSupply ? 'Supply item linked' : 'No supply item'}
                />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
})

// ─── ServiceLinksColumnBrowser ────────────────────────────────────────────────

interface ColumnBrowserProps {
  services: ServiceNode[]
  treeMap: Map<string | null, ServiceNode[]>
  linksByService: Map<string, ServiceInventoryLinkFull[]>
  selectedLeafId: string | null
  onLeafSelect: (id: string | null) => void
}

export function ServiceLinksColumnBrowser({
  services,
  treeMap,
  linksByService,
  selectedLeafId,
  onLeafSelect,
}: ColumnBrowserProps) {
  // selectedPath[k] = the branch ID selected in column k
  const [selectedPath, setSelectedPath] = useState<string[]>([])

  const parentIds = useMemo(() => buildParentIdSet(services), [services])

  // Reset path and leaf selection when the services list reference changes
  const prevServicesRef = React.useRef(services)
  useEffect(() => {
    if (prevServicesRef.current !== services) {
      prevServicesRef.current = services
      setSelectedPath([])
      onLeafSelect(null)
    }
  }, [services, onLeafSelect])

  const isLeaf = useCallback((id: string) => !parentIds.has(id), [parentIds])

  const handleSelect = useCallback(
    (colIdx: number, nodeId: string) => {
      if (isLeaf(nodeId)) {
        // Toggle leaf selection; trim path to this column
        onLeafSelect(selectedLeafId === nodeId ? null : nodeId)
        setSelectedPath((prev) => prev.slice(0, colIdx))
      } else {
        // Navigate into branch; close any open leaf
        setSelectedPath((prev) => [...prev.slice(0, colIdx), nodeId])
        onLeafSelect(null)
      }
    },
    [isLeaf, onLeafSelect, selectedLeafId],
  )

  // Build column list:
  // Column 0 = root children (treeMap.get(null))
  // Column k = children of selectedPath[k-1]
  // Use stable keys so React doesn't reuse wrong column on navigation
  const columns: { key: string; nodes: ServiceNode[]; selectedBranchId: string | undefined }[] = []

  const roots = treeMap.get(null) ?? []
  columns.push({ key: 'root', nodes: roots, selectedBranchId: selectedPath[0] })

  for (let k = 0; k < selectedPath.length; k++) {
    const children = treeMap.get(selectedPath[k]) ?? []
    if (children.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ColumnBrowser] Branch node has no children in treeMap:', selectedPath[k])
      }
      break
    }
    columns.push({
      key: selectedPath[k],
      nodes: children,
      selectedBranchId: selectedPath[k + 1],
    })
  }

  return (
    <div className="flex flex-1 overflow-x-auto min-w-0">
      {columns.map((col, colIdx) => (
        <ColumnPanel
          key={col.key}
          colIdx={colIdx}
          nodes={col.nodes}
          selectedBranchId={col.selectedBranchId}
          selectedLeafId={selectedLeafId}
          isLeaf={isLeaf}
          linksByService={linksByService}
          onSelect={handleSelect}
          isLastColumn={colIdx === columns.length - 1}
        />
      ))}

      {/* Hint shown when no leaf is selected */}
      {selectedLeafId === null && (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground px-8 text-center select-none">
          Select a service to manage its inventory links
        </div>
      )}
    </div>
  )
}
