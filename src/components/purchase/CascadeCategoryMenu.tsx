'use client'

import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronRight, ChevronLeft, Search, ArrowLeft } from 'lucide-react'
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

const flyoutCls =
  'fixed z-[100] min-w-[12rem] max-h-[20rem] overflow-y-auto rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10'

// ─── Portaled flyout panel ──────────────────────────────────────────────────

function FlyoutPanel({
  anchorRef,
  children,
  onMouseEnter,
  onMouseLeave,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const isRtl = getComputedStyle(el).direction === 'rtl'
    const panelWidth = 192

    let left: number
    if (isRtl) {
      left = rect.left - panelWidth + 4
      if (left < 8) left = rect.right - 4
    } else {
      left = rect.right - 4
      if (left + panelWidth > window.innerWidth - 8) left = rect.left - panelWidth + 4
    }

    let top = rect.top
    if (top + 320 > window.innerHeight) top = Math.max(8, window.innerHeight - 320)

    setPos({ top, left })
  }, [anchorRef])

  if (!pos) return null

  return createPortal(
    <div
      className={flyoutCls}
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}

// ─── Recursive flyout node (desktop) ────────────────────────────────────────

function CategoryNode({
  node,
  selectedId,
  onSelect,
}: {
  node: InventoryTreeNode
  selectedId: string | null
  onSelect: (cat: InventoryCategory) => void
}) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const nodeRef = useRef<HTMLDivElement>(null)
  const isLeaf = node.children.length === 0
  const isSelected = node.id === selectedId

  function handleEnter() {
    clearTimeout(closeTimer.current)
    setOpen(true)
  }

  function handleLeave() {
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  if (isLeaf) {
    return (
      <button
        type="button"
        className={cn(itemCls, 'w-full text-left')}
        onPointerDown={(e) => { e.preventDefault(); onSelect(node) }}
      >
        <Check className={cn('h-3 w-3 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
        <div className="flex-1 min-w-0">
          <div className="truncate">{node.name_en}</div>
          {node.name_ar && <div className="text-muted-foreground truncate">{node.name_ar}</div>}
        </div>
      </button>
    )
  }

  return (
    <div
      ref={nodeRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div className={cn(itemCls, 'w-full', open && 'bg-accent/50')}>
        <Check className={cn('h-3 w-3 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
        <button
          type="button"
          className="flex-1 min-w-0 text-left cursor-pointer"
          onPointerDown={(e) => { e.preventDefault(); onSelect(node) }}
        >
          <div className="truncate">{node.name_en}</div>
          {node.name_ar && <div className="text-muted-foreground truncate">{node.name_ar}</div>}
        </button>
        <ChevronRight className="h-3 w-3 shrink-0 opacity-50 rtl:hidden" />
        <ChevronLeft className="h-3 w-3 shrink-0 opacity-50 hidden rtl:block" />
      </div>

      {open && (
        <FlyoutPanel
          anchorRef={nodeRef}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          {node.children.map((child: InventoryTreeNode) => (
            <CategoryNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </FlyoutPanel>
      )}
    </div>
  )
}

// ─── Touch drill-down menu ──────────────────────────────────────────────────

function DrillDownMenu({
  tree,
  flat,
  selectedId,
  breadcrumb,
  onSelect,
  onCreateNew,
}: CascadeCategoryMenuProps) {
  const [stack, setStack] = useState<InventoryTreeNode[][]>([tree])
  const [parentStack, setParentStack] = useState<InventoryTreeNode[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    setStack([tree])
    setParentStack([])
  }, [tree])

  const currentNodes = stack[stack.length - 1]
  const currentParent = parentStack[parentStack.length - 1] ?? null

  const filtered = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return flat.filter((c) => {
      const label = breadcrumb(c.id).toLowerCase()
      const ar = (c.name_ar ?? '').toLowerCase()
      return label.includes(q) || ar.includes(q)
    })
  }, [search, flat, breadcrumb])

  function drillInto(node: InventoryTreeNode) {
    setStack((s) => [...s, node.children])
    setParentStack((s) => [...s, node])
  }

  function goBack() {
    setStack((s) => s.slice(0, -1))
    setParentStack((s) => s.slice(0, -1))
  }

  return (
    <div className="flex flex-col max-h-[min(var(--available-height,300px),20rem)]">
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

      {/* Back button */}
      {!filtered && currentParent && (
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground border-b"
          onClick={goBack}
        >
          <ArrowLeft className="h-3 w-3" />
          {currentParent.name_en}
        </button>
      )}

      {/* List */}
      <div className="overflow-y-auto flex-1 p-1">
        {filtered ? (
          filtered.length === 0 ? (
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
                  <div className="truncate">{breadcrumb(cat.id)}</div>
                  {cat.name_ar && <div className="text-muted-foreground truncate">{cat.name_ar}</div>}
                </div>
              </button>
            ))
          )
        ) : (
          currentNodes.map((node: InventoryTreeNode) => {
            const isLeaf = node.children.length === 0
            return (
              <div key={node.id} className={cn(itemCls, 'w-full')}>
                <Check className={cn('h-3 w-3 shrink-0', node.id === selectedId ? 'opacity-100' : 'opacity-0')} />
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onPointerDown={(e) => { e.preventDefault(); onSelect(node) }}
                >
                  <div className="truncate">{node.name_en}</div>
                  {node.name_ar && <div className="text-muted-foreground truncate">{node.name_ar}</div>}
                </button>
                {!isLeaf && (
                  <button
                    type="button"
                    className="shrink-0 p-0.5 rounded hover:bg-accent"
                    onClick={() => drillInto(node)}
                  >
                    <ChevronRight className="h-3 w-3 opacity-50 rtl:hidden" />
                    <ChevronLeft className="h-3 w-3 opacity-50 hidden rtl:block" />
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

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

// ─── Desktop flyout menu ────────────────────────────────────────────────────

function FlyoutMenu({
  tree,
  flat,
  selectedId,
  breadcrumb,
  onSelect,
  onCreateNew,
}: CascadeCategoryMenuProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return flat.filter((c) => {
      const label = breadcrumb(c.id).toLowerCase()
      const ar = (c.name_ar ?? '').toLowerCase()
      return label.includes(q) || ar.includes(q)
    })
  }, [search, flat, breadcrumb])

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
      <div className="overflow-y-auto max-h-[min(var(--available-height,300px),20rem)] p-1">
        {filtered ? (
          filtered.length === 0 ? (
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
                  <div className="truncate">{breadcrumb(cat.id)}</div>
                  {cat.name_ar && <div className="text-muted-foreground truncate">{cat.name_ar}</div>}
                </div>
              </button>
            ))
          )
        ) : (
          tree.map((node: InventoryTreeNode) => (
            <CategoryNode
              key={node.id}
              node={node}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

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

// ─── Public component ───────────────────────────────────────────────────────

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

export function CascadeCategoryMenu(props: CascadeCategoryMenuProps) {
  const isTouch = useIsTouch()

  return isTouch ? <DrillDownMenu {...props} /> : <FlyoutMenu {...props} />
}
