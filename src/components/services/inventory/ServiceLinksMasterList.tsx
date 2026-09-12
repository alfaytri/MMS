'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronsDown, ChevronsUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ServiceNode } from './serviceInventoryHelpers'

type LeafStatus = 'linked' | 'noitems' | 'needs'
type FilterKey = LeafStatus | 'all'

interface Props {
  allServices: ServiceNode[]
  treeMap: Map<string | null, ServiceNode[]>
  leafIdSet: Set<string>
  breadcrumbMap: Map<string, string>
  hasSupplySet: Set<string>
  noItemsSet: Set<string>
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
  noItemsSet,
  activeId,
  checkedIds,
  onActivate,
  onToggleCheck,
}: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
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

  // All branch (non-leaf) node IDs — used for global expand/collapse all
  const allBranchIds = useMemo(() => {
    const ids = new Set<string>()
    function collect(nodeId: string) {
      if (leafIdSet.has(nodeId)) return
      const children = treeMap.get(nodeId) ?? []
      if (children.length === 0) return
      ids.add(nodeId)
      for (const child of children) collect(child.id)
    }
    for (const root of treeMap.get(null) ?? []) collect(root.id)
    return ids
  }, [treeMap, leafIdSet])

  // Precompute leaf-count and linked-count per branch node (for header badges)
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

  // Status of a single leaf: green (linked) > grey (no items needed) > amber (needs supply)
  const statusOf = (id: string): LeafStatus =>
    hasSupplySet.has(id) ? 'linked' : noItemsSet.has(id) ? 'noitems' : 'needs'

  // Global queue sizes — shown on the filter chips, independent of the search text
  const counts = useMemo(() => {
    let linked = 0, noitems = 0, needs = 0
    for (const s of leafServices) {
      if (hasSupplySet.has(s.id)) linked++
      else if (noItemsSet.has(s.id)) noitems++
      else needs++
    }
    return { linked, noitems, needs, all: leafServices.length }
  }, [leafServices, hasSupplySet, noItemsSet])

  // Flat list — used whenever a status filter is active or a search is typed.
  // Apply the status filter first, then narrow by the search text.
  const filteredLeaves = useMemo(() => {
    let out = leafServices
    if (filter !== 'all') {
      out = out.filter((s) => {
        const st: LeafStatus = hasSupplySet.has(s.id)
          ? 'linked'
          : noItemsSet.has(s.id)
            ? 'noitems'
            : 'needs'
        return st === filter
      })
    }
    if (trimmed) {
      out = out.filter((s) => {
        const name = s.name_en.toLowerCase()
        const breadcrumb = (breadcrumbMap.get(s.id) ?? '').toLowerCase()
        return name.includes(trimmed) || breadcrumb.includes(trimmed)
      })
    }
    return out
  }, [leafServices, breadcrumbMap, trimmed, filter, hasSupplySet, noItemsSet])

  // Flat list whenever searching or a specific status filter is active;
  // the browsable tree only makes sense for the unfiltered "All" view.
  const flatMode = trimmed.length > 0 || filter !== 'all'

  // O(1) index lookup for keyboard focus state
  const idxMap = useMemo(
    () => new Map(filteredLeaves.map((s, i) => [s.id, i])),
    [filteredLeaves],
  )

  // Global expand/collapse all
  const allExpanded = allBranchIds.size > 0 && [...allBranchIds].every((id) => expandedIds.has(id))

  function expandAll() {
    setExpandedIds(new Set(allBranchIds))
  }
  function collapseAll() {
    setExpandedIds(new Set())
  }

  // Collect all branch IDs in a node's subtree (not including the node itself)
  function getSubtreeBranchIds(nodeId: string): string[] {
    const ids: string[] = []
    function collect(id: string) {
      const children = treeMap.get(id) ?? []
      for (const child of children) {
        if (!leafIdSet.has(child.id) && (treeMap.get(child.id)?.length ?? 0) > 0) {
          ids.push(child.id)
          collect(child.id)
        }
      }
    }
    collect(nodeId)
    return ids
  }

  function toggleSubtree(nodeId: string, e: React.MouseEvent) {
    e.stopPropagation()
    const descendants = getSubtreeBranchIds(nodeId)
    // Include the node itself
    const all = [nodeId, ...descendants]
    const subtreeAllExpanded = all.every((id) => expandedIds.has(id))
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (subtreeAllExpanded) {
        for (const id of all) next.delete(id)
      } else {
        for (const id of all) next.add(id)
      }
      return next
    })
  }

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
    const status = statusOf(service.id)
    const isFocused = flatMode && focusedIdx === flatIdx

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

        {/* Text — breadcrumb only shown in flat (search/filter) mode */}
        <div className="flex-1 min-w-0">
          {flatMode && (() => {
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

        {/* Status dot — green linked · grey no-items · amber needs supply */}
        <div className="mt-1 shrink-0">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              status === 'linked'
                ? 'bg-green-500'
                : status === 'noitems'
                  ? 'bg-gray-300'
                  : 'bg-amber-400'
            }`}
            title={
              status === 'linked'
                ? 'Supply linked'
                : status === 'noitems'
                  ? 'No items needed'
                  : 'Needs supply'
            }
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
      const pl = 8 + level * 12

      // Whether all branch descendants are expanded (for subtree toggle icon)
      const subtreeBranches = getSubtreeBranchIds(node.id)
      const subtreeAllExpanded =
        expandedIds.has(node.id) &&
        subtreeBranches.every((id) => expandedIds.has(id))

      return (
        <div key={node.id}>
          <div
            className="flex items-center bg-muted/20 hover:bg-muted/30 transition-colors sticky top-0 z-10 border-b border-border/20 group/header"
          >
            {/* Main chevron — toggles this node only */}
            <button
              style={{ paddingLeft: `${pl}px` }}
              onClick={() => toggleExpanded(node.id)}
              className="flex-1 flex items-center gap-1.5 pr-1 py-1.5 text-xs font-semibold text-muted-foreground min-w-0"
            >
              {isExpanded
                ? <ChevronDown className="h-3 w-3 shrink-0" />
                : <ChevronRight className="h-3 w-3 shrink-0" />
              }
              <span className="flex-1 text-left uppercase tracking-wide truncate">
                {node.name_en}
              </span>
            </button>

            {/* Expand/collapse all subtree button — only shown when node has branch descendants */}
            {subtreeBranches.length > 0 && (
              <button
                onClick={(e) => toggleSubtree(node.id, e)}
                title={subtreeAllExpanded ? 'Collapse all inside' : 'Expand all inside'}
                className="shrink-0 p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover/header:opacity-100 transition-opacity"
              >
                {subtreeAllExpanded
                  ? <ChevronsUp className="h-3 w-3" />
                  : <ChevronsDown className="h-3 w-3" />
                }
              </button>
            )}

            {/* Stats */}
            <span className="text-xs font-normal text-muted-foreground shrink-0 pr-3">
              {nodeTotal} · <span className="text-success">{nodeLinked}</span>
            </span>
          </div>
          {isExpanded && renderTree(children, level + 1)}
        </div>
      )
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const CHIPS: { key: FilterKey; label: string; count: number; dot: string }[] = [
    { key: 'needs', label: 'Needs supply', count: counts.needs, dot: 'bg-amber-400' },
    { key: 'linked', label: 'Linked', count: counts.linked, dot: 'bg-green-500' },
    { key: 'noitems', label: 'No items', count: counts.noitems, dot: 'bg-gray-300' },
    { key: 'all', label: 'All', count: counts.all, dot: '' },
  ]

  return (
    <div className="flex flex-col h-full border-r">
      {/* Search bar + filter chips */}
      <div className="p-3 pb-2 border-b sticky top-0 bg-background z-20 space-y-2">
        <Input
          ref={searchRef}
          placeholder={`Search ${totalCount} services…`}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setFocusedIdx(0) }}
          onKeyDown={handleSearchKeyDown}
          className="h-9"
        />

        {/* Filter chips — status queues */}
        <div className="flex items-center gap-1.5 overflow-x-auto -mx-0.5 px-0.5 pb-0.5">
          {CHIPS.map((chip) => {
            const active = filter === chip.key
            return (
              <button
                key={chip.key}
                onClick={() => { setFilter(chip.key); setFocusedIdx(0) }}
                className={[
                  'flex items-center gap-1.5 shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-foreground font-medium'
                    : 'border-border text-muted-foreground hover:bg-muted/50',
                ].join(' ')}
              >
                {chip.dot && (
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${chip.dot}`} />
                )}
                {chip.label}
                <span className={active ? 'text-foreground' : 'text-muted-foreground/70'}>
                  {chip.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Count / expand-collapse line */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/30 shrink-0">
        <span>
          {flatMode ? (
            <>Showing <span className="font-medium text-foreground">{filteredLeaves.length}</span></>
          ) : (
            <><span className="font-medium text-foreground">{counts.all}</span> services</>
          )}
        </span>
        {!flatMode && allBranchIds.size > 0 && (
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>

      {/* List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
        role="listbox"
        tabIndex={0}
        onKeyDown={flatMode ? handleKeyDown : undefined}
      >
        {flatMode ? (
          filteredLeaves.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              {trimmed ? (
                <>No services match &quot;{query}&quot;</>
              ) : (
                'No services in this filter'
              )}
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
