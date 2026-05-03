'use client'

import { useEffect, useRef, useState } from 'react'
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
  const filteredLeaves = trimmed
    ? leafServices.filter(s => {
        const name = s.name_en.toLowerCase()
        const breadcrumb = (breadcrumbMap.get(s.id) ?? '').toLowerCase()
        return name.includes(trimmed) || breadcrumb.includes(trimmed)
      })
    : leafServices

  // Group by top-level category (first segment of breadcrumb)
  const groups = new Map<string, ServiceNode[]>()
  if (!trimmed) {
    for (const s of filteredLeaves) {
      const breadcrumb = breadcrumbMap.get(s.id) ?? s.name_en
      const cat = breadcrumb.split(' › ')[0]
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(s)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(i => Math.min(i + 1, filteredLeaves.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const s = filteredLeaves[focusedIdx]
      if (s) onActivate(s.id)
    } else if (e.key === ' ') {
      e.preventDefault()
      const s = filteredLeaves[focusedIdx]
      if (s) onToggleCheck(s.id)
    }
  }

  const renderRow = (service: ServiceNode) => {
    const breadcrumb = breadcrumbMap.get(service.id) ?? ''
    const isActive = activeId === service.id
    const isChecked = checkedIds.has(service.id)
    const hasSupply = hasSupplySet.has(service.id)
    const isFocused = focusedIdx === filteredLeaves.indexOf(service)

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
          onClick={e => { e.stopPropagation(); onToggleCheck(service.id) }}
        >
          <Checkbox checked={isChecked} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground leading-tight truncate">
            {breadcrumb.split(' › ').slice(0, -1).join(' › ')}
          </p>
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
          onChange={e => { setQuery(e.target.value); setFocusedIdx(0) }}
          onKeyDown={handleKeyDown}
          className="h-9"
        />
      </div>

      {/* Stat bar */}
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/30 shrink-0">
        <span className="font-medium text-foreground">{filteredLeaves.length}</span> services
        {' · '}
        <span className="text-green-600 font-medium">{linkedCount}</span> linked
        {' · '}
        <span className="text-amber-500 font-medium">{noSupplyCount}</span> no supply
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
            <p className="p-4 text-sm text-muted-foreground text-center">No services match &quot;{query}&quot;</p>
          ) : (
            filteredLeaves.map(s => renderRow(s))
          )
        ) : (
          // Grouped by category
          Array.from(groups.entries()).map(([cat, leaves]) => (
            <div key={cat}>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/20 sticky top-0 z-10">
                {cat}
                <span className="ml-1 font-normal normal-case">
                  ({leaves.length})
                </span>
              </div>
              {leaves.map(s => renderRow(s))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
