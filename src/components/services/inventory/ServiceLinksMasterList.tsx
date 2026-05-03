'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ServiceNode } from './serviceInventoryHelpers'

interface Props {
  leafServices: ServiceNode[]
  breadcrumbMap: Map<string, string>
  hasSupplySet: Set<string>
  activeId: string | null
  checkedIds: Set<string>
  onActivate: (id: string) => void
  onToggleCheck: (id: string) => void
  totalCount: number
  linkedCount: number
  noSupplyCount: number
}

export function ServiceLinksMasterList({
  leafServices,
  breadcrumbMap,
  hasSupplySet,
  activeId,
  checkedIds,
  onActivate,
  onToggleCheck,
  totalCount,
  linkedCount,
  noSupplyCount,
}: Props) {
  const [query, setQuery] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

  const trimmed = query.trim().toLowerCase()

  // Filtered flat list of leaf services
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

  // O(1) index lookup — avoids O(n²) indexOf calls in the grouped render
  const idxMap = useMemo(
    () => new Map(filteredLeaves.map((s, i) => [s.id, i])),
    [filteredLeaves],
  )

  // Stat bar counts — update with the current filter
  const filteredLinkedCount = useMemo(
    () => filteredLeaves.filter((s) => hasSupplySet.has(s.id)).length,
    [filteredLeaves, hasSupplySet],
  )
  const filteredNoSupplyCount = filteredLeaves.length - filteredLinkedCount

  // Group by top-level category (first segment of breadcrumb)
  const groups = useMemo(() => {
    if (trimmed) return new Map<string, ServiceNode[]>()
    const map = new Map<string, ServiceNode[]>()
    for (const s of filteredLeaves) {
      const breadcrumb = breadcrumbMap.get(s.id) ?? s.name_en
      const cat = breadcrumb.split(' › ')[0]
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(s)
    }
    return map
  }, [filteredLeaves, breadcrumbMap, trimmed])

  function toggleCollapse(cat: string) {
    setCollapsedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

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

  const renderRow = (service: ServiceNode, flatIdx: number) => {
    const breadcrumb = breadcrumbMap.get(service.id) ?? ''
    const isActive = activeId === service.id
    const isChecked = checkedIds.has(service.id)
    const hasSupply = hasSupplySet.has(service.id)
    const isFocused = focusedIdx === flatIdx

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

        {/* Text */}
        <div className="flex-1 min-w-0">
          {(() => {
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

      {/* Stat bar — counts update with the active filter */}
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
        onKeyDown={handleKeyDown}
      >
        {trimmed ? (
          // Flat search results
          filteredLeaves.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No services match &quot;{query}&quot;
            </p>
          ) : (
            filteredLeaves.map((s, i) => renderRow(s, i))
          )
        ) : (
          // Grouped by category with collapsible headers
          Array.from(groups.entries()).map(([cat, leaves]) => {
            const isCollapsed = collapsedCats.has(cat)
            const catLinkedCount = leaves.filter((s) => hasSupplySet.has(s.id)).length
            return (
              <div key={cat}>
                <button
                  onClick={() => toggleCollapse(cat)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/20 sticky top-0 z-10 hover:bg-muted/40 transition-colors"
                >
                  {isCollapsed
                    ? <ChevronRight className="h-3 w-3 shrink-0" />
                    : <ChevronDown className="h-3 w-3 shrink-0" />
                  }
                  <span className="flex-1 text-left">{cat}</span>
                  <span className="font-normal normal-case">
                    {leaves.length} · <span className="text-green-600">{catLinkedCount}</span> linked
                  </span>
                </button>
                {!isCollapsed && leaves.map((s) => renderRow(s, idxMap.get(s.id) ?? 0))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
