'use client'

import { useState, useMemo, useEffect } from 'react'
import { Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InventoryTreeNode } from '@/hooks/useInventoryTree'
import type { InventoryCategory } from '@/hooks/useInventory'

// ─── Props ───────────────────────────────────────────────────────────────────

interface CascadeCategoryMenuProps {
  tree: InventoryTreeNode[]
  flat: InventoryCategory[]
  selectedId: string | null
  breadcrumb: (id: string) => string
  onSelect: (cat: InventoryCategory) => void
  onCreateNew: () => void
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const itemCls =
  'flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none select-none cursor-default hover:bg-accent hover:text-accent-foreground'

const colCls = 'min-w-[11rem] overflow-y-auto max-h-60 p-1 shrink-0'

// ─── Touch detection ────────────────────────────────────────────────────────

function useIsTouch() {
  const [isTouch, setIsTouch] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  )
  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)')
    setIsTouch(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isTouch
}

// ─── Recursive leaf list for level 3+ with indentation ──────────────────────

function DeepNodeList({
  nodes,
  selectedId,
  onSelect,
  depth = 0,
}: {
  nodes: InventoryTreeNode[]
  selectedId: string | null
  onSelect: (cat: InventoryCategory) => void
  depth?: number
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <button
            type="button"
            className={cn(itemCls, 'w-full text-left')}
            style={depth > 0 ? { paddingLeft: `${8 + depth * 12}px` } : undefined}
            onPointerDown={(e) => { e.preventDefault(); onSelect(node) }}
          >
            <Check className={cn('h-3 w-3 shrink-0', node.id === selectedId ? 'opacity-100' : 'opacity-0')} />
            <div className="flex-1 min-w-0">
              <div className="truncate">{node.name_en}</div>
              {node.name_ar && <div className="text-muted-foreground truncate">{node.name_ar}</div>}
            </div>
          </button>
          {node.children.length > 0 && (
            <DeepNodeList
              nodes={node.children}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </>
  )
}

// ─── Column item (shared by columns 1 and 2) ───────────────────────────────

function ColumnItem({
  node,
  selectedId,
  isActive,
  isTouch,
  currentActive,
  onActivate,
  onSelect,
}: {
  node: InventoryTreeNode
  selectedId: string | null
  isActive: boolean
  isTouch: boolean
  currentActive: string | null
  onActivate: (node: InventoryTreeNode) => void
  onSelect: (cat: InventoryCategory) => void
}) {
  const isParent = node.children.length > 0

  return (
    <button
      type="button"
      className={cn(
        itemCls, 'w-full text-left',
        isActive && isParent && 'bg-accent',
      )}
      onPointerDown={(e) => {
        e.preventDefault()
        if (isParent && isTouch && currentActive !== node.id) {
          onActivate(node)
          return
        }
        onSelect(node)
      }}
      onMouseEnter={() => { if (isParent) onActivate(node) }}
    >
      <Check className={cn('h-3 w-3 shrink-0', node.id === selectedId ? 'opacity-100' : 'opacity-0')} />
      <div className="flex-1 min-w-0">
        <div className="truncate">{node.name_en}</div>
        {node.name_ar && <div className="text-muted-foreground truncate">{node.name_ar}</div>}
      </div>
    </button>
  )
}

// ─── Public component ───────────────────────────────────────────────────────

export function CascadeCategoryMenu({
  tree,
  flat,
  selectedId,
  breadcrumb: getBreadcrumb,
  onSelect,
  onCreateNew,
}: CascadeCategoryMenuProps) {
  const isTouch = useIsTouch()
  const [search, setSearch] = useState('')
  const [activeL1, setActiveL1] = useState<InventoryTreeNode | null>(null)
  const [activeL2, setActiveL2] = useState<InventoryTreeNode | null>(null)

  // Auto-select first L1 parent with children
  useEffect(() => {
    const first = tree.find((n) => n.children.length > 0)
    setActiveL1(first ?? null)
  }, [tree])

  // Reset L2 when L1 changes — pick first L2 child that has its own children
  useEffect(() => {
    if (activeL1) {
      const firstWithChildren = activeL1.children.find((n) => n.children.length > 0)
      setActiveL2(firstWithChildren ?? null)
    } else {
      setActiveL2(null)
    }
  }, [activeL1])

  const filtered = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return flat.filter((c) => {
      const label = getBreadcrumb(c.id).toLowerCase()
      const ar = (c.name_ar ?? '').toLowerCase()
      return label.includes(q) || ar.includes(q)
    })
  }, [search, flat, getBreadcrumb])

  const l2Nodes = activeL1?.children ?? []
  const l3Nodes = activeL2?.children ?? []

  return (
    <div className="flex flex-col">
      {/* Search */}
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          placeholder="Search category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      {filtered ? (
        <div className="overflow-y-auto max-h-60 p-1 min-w-[11rem]">
          {filtered.length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">No categories found.</div>
          ) : (
            filtered.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={cn(itemCls, 'w-full text-left')}
                onPointerDown={(e) => { e.preventDefault(); onSelect(cat) }}
              >
                <Check className={cn('h-3 w-3 shrink-0', cat.id === selectedId ? 'opacity-100' : 'opacity-0')} />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{getBreadcrumb(cat.id)}</div>
                  {cat.name_ar && <div className="text-muted-foreground truncate">{cat.name_ar}</div>}
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="flex divide-x">
          {/* Column 1 — root categories */}
          <div className={colCls}>
            {tree.map((node) => (
              <ColumnItem
                key={node.id}
                node={node}
                selectedId={selectedId}
                isActive={activeL1?.id === node.id}
                isTouch={isTouch}
                currentActive={activeL1?.id ?? null}
                onActivate={setActiveL1}
                onSelect={onSelect}
              />
            ))}
          </div>

          {/* Column 2 — level 2 subcategories */}
          {l2Nodes.length > 0 && (
            <div className={colCls}>
              {l2Nodes.map((node) => (
                <ColumnItem
                  key={node.id}
                  node={node}
                  selectedId={selectedId}
                  isActive={activeL2?.id === node.id}
                  isTouch={isTouch}
                  currentActive={activeL2?.id ?? null}
                  onActivate={setActiveL2}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}

          {/* Column 3 — level 3+ (deeper levels indented) */}
          {l3Nodes.length > 0 && (
            <div className={colCls}>
              <DeepNodeList
                nodes={l3Nodes}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            </div>
          )}
        </div>
      )}

      {/* Add new */}
      <div className="border-t px-2 py-1.5">
        <button
          type="button"
          className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-accent"
          onClick={onCreateNew}
        >
          + Add new category
        </button>
      </div>
    </div>
  )
}
