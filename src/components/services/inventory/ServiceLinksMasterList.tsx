'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ServiceNode } from './serviceInventoryHelpers'

interface Props {
  allServices: ServiceNode[]
  treeMap: Map<string | null, ServiceNode[]>
  leafIdSet: Set<string>
  breadcrumbMap: Map<string, string>
  hasSupplySet: Set<string>
  activeId: string | null
  checkedIds: Set<string>
  onActivate: (id: string) => void
  onToggleCheck: (id: string) => void
}

export function ServiceLinksMasterList({
  allServices,
  treeMap,
  leafIdSet,
  breadcrumbMap,
  hasSupplySet,
  activeId,
  checkedIds,
  onActivate,
  onToggleCheck,
}: Props) {
  const [query, setQuery] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const didInit = useRef(false)

  // Auto-expand root nodes once data loads
  useEffect(() => {
    if (didInit.current) return
    const roots = treeMap.get(null) ?? []
    if (roots.length === 0) return
    setExpandedIds(new Set(roots.map((r) => r.id)))
    didInit.current = true
  }, [treeMap])

  // CMD/CTRL+F focuses the search bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const leafServices = useMemo(
    () => allServices.filter((s) => leafIdSet.has(s.id)),
    [allServices, leafIdSet],
  )

  const totalCount = leafServices.length

  // Precompute leaf-count and linked-count for every branch node (for header badges)
  const nodeStats = useMemo(() => {
    const total = new Map<string, number>()
    const linked = new Map<string, number>()

    function recurse(nodeId: string): [number, number] {
      if (total.has(nodeId)) return [total.get(nodeId)!, linked.get(nodeId)!]
      const children = treeMap.get(nodeId) ?? []
      if (leafIdSet.has(nodeId) || children.length === 0) {
        const l = hasSupplySet.has(nodeId) ? 1 : 0
        total.set(nodeId, 1)
        linked.set(nodeId, l)
        return [1, l]
      }
      let t = 0, l = 0
      for (const child of children) {
        const [ct, cl] = recurse(child.id)
        t += ct; l += cl
      }
      total.set(nodeId, t)
      linked.set(nodeId, l)
      return [t, l]
    }

    for (const root of treeMap.get(null) ?? []) recurse(root.id)
    return { total, linked }
  }, [treeMap, leafIdSet, hasSupplySet])

  const trimmed = query.trim().toLowerCase()

  // Flat filtered list for search mode
  const filteredLeaves = useMemo(
    () =>
      trimmed
        ? leafServices.filter((s) => {
            const name = s.name_en.toLowerCase()
            const breadcrumb = (breadcrumbMap.get(s.id) ?? '').toLowerCase()
            return name.includes(trimmed) || breadcrumb.includes(trimmed)
          })
        : leafServices,
    [leafServices, breadcrumbMap, trimmed],
  )

  // O(1) index lookup for keyboard focus state
  const idxMap = useMemo(
    () => new Map(filteredLeaves.map((s, i) => [s.id, i])),
    [filteredLeaves],
  )

  // Stat bar — reflects current search filter
  const filteredLinkedCount = useMemo(
    () => filteredLeaves.filter((s) => hasSupplySet.has(s.id)).length,
    [filteredLeaves, hasSupplySet],
  )
  const filteredNoSupplyCount = filteredLeaves.length - filteredLinkedCount

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Keyboard handlers (search mode only) ──────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx((i) => Math.min(i + 1, filteredLeaves.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const s = filteredLeaves[focusedIdx]
      if (s) onActivate(s.id)
    } else if (e.key === ' ') {
      e.preventDefault()
      const s = filteredLeaves[focusedIdx]
      if (s) onToggleCheck(s.id)
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setQuery('')
      setFocusedIdx(0)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(0)
      listRef.current?.focus()
      return
    }
    handleKeyDown(e)
  }

  // ── Row renderer (leaf services) ──────────────────────────────────────────

  const renderRow = (service: ServiceNode, flatIdx: number) => {
    const breadcrumb = breadcrumbMap.get(service.id) ?? ''
    const isActive = activeId === service.id
    const isChecked = checkedIds.has(service.id)
    const hasSupply = hasSupplySet.has(service.id)
    const isFocused = trimmed && focusedIdx === flatIdx

    let rowCls =
      'group relative flex items-start gap-2 px-3 py-2 cursor-pointer select-none border-l-[3px] transition-colors'
    if (isActive) {
      rowCls += ' bg-blue-100 border-l-primary'
    } else if (isChecked) {
      rowCls += ' bg-blue-50 border-l-transparent'
    } else if (isFocused) {
      rowCls += ' bg-muted/40 border-l-transparent'
    } else {
      rowCls += ' border-l-transparent hover:bg-muted/40'
    }

    return (
      <div
        key={service.id}
        className={rowCls}
        onClick={() => onActivate(service.id)}
        role="option"
        aria-selected={isActive}
      >
        {/* Checkbox — visible on hover or when checked */}
        <div
          className={`mt-0.5 shrink-0 transition-opacity ${isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          onClick={(e) => { e.stopPropagation(); onToggleCheck(service.id) }}
        >
          <Checkbox
            checked={isChecked}
            onCheckedChange={() => onToggleCheck(service.id)}
          />
        </div>

        {/* Text — breadcrumb only shown in search mode (tree gives context in normal mode) */}
        <div className="flex-1 min-w-0">
          {trimmed && (() => {
            const parentCrumb = breadcrumb.split(' › ').slice(0, -1).join(' › ')
            return parentCrumb ? (
              <p className="text-xs text-muted-foreground leading-tight truncate">
                {parentCrumb}
              </p>
            ) : null
          })()}
          <p className="text-sm font-medium leading-snug break-words">
            {service.name_en}
          </p>
        </div>

        {/* Status dot */}
        <div className="mt-1 shrink-0">
          <span
            className={`inline-block w-2 h-2 rounded-full ${hasSupply ? 'bg-green-500' : 'bg-amber-400'}`}
            title={hasSupply ? 'Supply linked' : 'No supply'}
          />
        </div>
      </div>
    )
  }

  // ── Tree renderer (normal mode) ───────────────────────────────────────────

  function renderTree(nodes: ServiceNode[], level: number): React.ReactNode {
    return nodes.map((node) => {
      const isLeaf = leafIdSet.has(node.id)

      if (isLeaf) {
        return renderRow(node, idxMap.get(node.id) ?? 0)
      }

      const children = treeMap.get(node.id) ?? []
      const isExpanded = expandedIds.has(node.id)
      const nodeTotal = nodeStats.total.get(node.id) ?? 0
      const nodeLinked = nodeStats.linked.get(node.id) ?? 0
      // Indent increases per level; root level 0 = full left
      const pl = 8 + level * 12

      return (
        <div key={node.id}>
          <button
            style={{ paddingLeft: `${pl}px` }}
            onClick={() => toggleExpanded(node.id)}
            className="w-full flex items-center gap-1.5 pr-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/20 hover:bg-muted/40 transition-colors sticky top-0 z-10 border-b border-border/20"
          >
            {isExpanded
              ? <ChevronDown className="h-3 w-3 shrink-0" />
              : <ChevronRight className="h-3 w-3 shrink-0" />
            }
            <span className="flex-1 text-left uppercase tracking-wide truncate">
              {node.name_en}
            </span>
            <span className="font-normal normal-case shrink-0">
              {nodeTotal} · <span className="text-green-600">{nodeLinked}</span>
            </span>
          </button>
          {isExpanded && renderTree(children, level + 1)}
        </div>
      )
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full border-r">
      {/* Search bar */}
      <div className="p-3 border-b sticky top-0 bg-background z-20">
        <Input
          ref={searchRef}
          placeholder={`Search ${totalCount} services…`}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setFocusedIdx(0) }}
          onKeyDown={handleSearchKeyDown}
          className="h-9"
        />
      </div>

      {/* Stat bar */}
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/30 shrink-0">
        <span className="font-medium text-foreground">{filteredLeaves.length}</span> services
        {' · '}
        <span className="text-green-600 font-medium">{filteredLinkedCount}</span> linked
        {' · '}
        <span className="text-amber-500 font-medium">{filteredNoSupplyCount}</span> no supply
      </div>

      {/* List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
        role="listbox"
        tabIndex={0}
        onKeyDown={trimmed ? handleKeyDown : undefined}
      >
        {trimmed ? (
          filteredLeaves.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No services match &quot;{query}&quot;
            </p>
          ) : (
            filteredLeaves.map((s, i) => renderRow(s, i))
          )
        ) : (
          renderTree(treeMap.get(null) ?? [], 0)
        )}
      </div>
    </div>
  )
}
