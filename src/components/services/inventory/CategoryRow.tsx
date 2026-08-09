'use client'

import { useState, useMemo } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Pencil, Archive, Package, Plus, FolderPlus, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ItemRow } from './ItemRow'
import { CategoryEditDialog } from './CategoryEditDialog'
import { ItemEditDialog } from './ItemEditDialog'
import { CategoryAttributesDialog } from '@/components/master-data/attributes/CategoryAttributesDialog'
import { useHasViewPermission } from '@/hooks/usePermissions'
import { useInventoryItemsByCategory, useArchiveInventoryCategory, useUpdateSortOrders, type CategoryStockAggregate } from '@/hooks/useInventory'
import {
  useItemAttributesByCategory,
  useItemAttributesByCategories,
  useEffectiveAttributes,
} from '@/hooks/useAttributes'
import { ItemAttributesProvider, type ItemAttributesBatch } from '@/components/shared/ItemAttributesContext'
import { useInventoryItemsByCategories } from '@/hooks/useInventory'
import {
  AttributeFilterBar,
  itemPassesAttributeFilter,
  hasAnyAttributeFilter,
  type AttributeFilterState,
} from '@/components/shared/AttributeFilterBar'
import { formatCurrency } from '@/lib/utils/formatters'
import type { InventoryTreeNode } from '@/hooks/useInventoryTree'

type Props = {
  node: InventoryTreeNode
  categoryType: string
  showArchived: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  depth?: number
  stockAggregates?: Map<string, CategoryStockAggregate>
  /** Phase D.12 Task 2 — when defined, only items whose id is in this set are
   *  rendered inside the expanded category. undefined = no item-level filter. */
  filterItemIds?: Set<string>
  /** Attribute filter cascaded down from an ancestor. Merged with this
   *  row's own filter (own picks override an ancestor pick on the same
   *  attribute) before applying to items. */
  inheritedAttributeFilter?: AttributeFilterState
  /** Category ids that survived an ancestor's attribute filter. Any row
   *  whose own id is missing from this set self-skips rendering. Undefined =
   *  no attribute-driven visibility restriction. */
  attributeVisibleCategoryIds?: Set<string>
}

export function CategoryRow({ node, categoryType, showArchived, canMoveUp, canMoveDown, onMoveUp, onMoveDown, depth = 0, stockAggregates, filterItemIds, inheritedAttributeFilter, attributeVisibleCategoryIds }: Props) {

  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [addSubcategoryOpen, setAddSubcategoryOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [attributesOpen, setAttributesOpen] = useState(false)
  const [ownAttrFilter, setOwnAttrFilter] = useState<AttributeFilterState>({})
  const canViewAttributes = useHasViewPermission('master_data.inventory.attributes')
  const archiveCategory = useArchiveInventoryCategory()
  const updateItemOrder = useUpdateSortOrders('inventory_items')
  const updateChildCategoryOrder = useUpdateSortOrders('inventory_categories')

  const isLeaf = node.children.length === 0
  // Items are fetched regardless of whether the category also has sub-categories.
  // A category can hold both direct items AND sub-categories at the same time.
  const { data: itemsRaw = [] } = useInventoryItemsByCategory(expanded ? node.id : null, showArchived)

  // Effective attributes for THIS category (own + inherited from ancestors).
  // Only fetched when expanded — gates whether the filter chip row renders.
  const { data: effectiveAttrs = [] } = useEffectiveAttributes(expanded ? node.id : null)

  // Effective attribute filter = inherited from ancestor merged with own picks
  // (own picks win on the same definition_id).
  const effectiveAttrFilter = useMemo<AttributeFilterState>(
    () => ({ ...(inheritedAttributeFilter ?? {}), ...ownAttrFilter }),
    [inheritedAttributeFilter, ownAttrFilter],
  )
  const attrFilterActive = hasAnyAttributeFilter(effectiveAttrFilter)

  // Attributes already narrowed by an ancestor — hide them from this row's
  // filter UI so operators don't see duplicate controls repeated down the
  // tree. Only "active" ancestor picks (non-empty option list) are hidden;
  // a set-then-cleared ancestor still shows the dropdown here.
  const inheritedActiveIds = useMemo(() => {
    const s = new Set<string>()
    if (inheritedAttributeFilter) {
      for (const [defId, opts] of Object.entries(inheritedAttributeFilter)) {
        if (opts && opts.length > 0) s.add(defId)
      }
    }
    return s
  }, [inheritedAttributeFilter])

  // Row is worth rendering only when there's at least one attribute the
  // ancestor hasn't already narrowed. Prevents an empty grey strip when
  // every attribute this category has is already picked upstream.
  const hasFilterableAttrs = useMemo(
    () => effectiveAttrs.some((a) => !inheritedActiveIds.has(a.definition_id)),
    [effectiveAttrs, inheritedActiveIds],
  )

  // Item→attribute map for THIS category's direct items. Loaded whenever the
  // category is expanded (not only when a filter is active) because it now
  // also feeds every ItemRow's AttributeChipStrip via ItemAttributesProvider —
  // one query per expanded category instead of one per item row. Descendant
  // rows do their own lookups, keyed by their own category id.
  const { data: itemAttrsByItem } = useItemAttributesByCategory(
    expanded ? node.id : null,
  )

  // Stable batch value for the chip-strip provider. Empty map while the query
  // is in flight so children never fall back to a per-item query.
  const attrBatchValue = useMemo<ItemAttributesBatch>(
    () => ({ byItem: itemAttrsByItem ?? new Map<string, Map<string, string>>() }),
    [itemAttrsByItem],
  )

  const items = useMemo(() => {
    const base = filterItemIds ? itemsRaw.filter((it) => filterItemIds.has(it.id)) : itemsRaw
    if (!attrFilterActive) return base
    return base.filter((it) => itemPassesAttributeFilter(itemAttrsByItem?.get(it.id), effectiveAttrFilter))
  }, [itemsRaw, filterItemIds, attrFilterActive, itemAttrsByItem, effectiveAttrFilter])

  // Descendant subtree visibility — only computed when this row has picks of
  // its own (own picks introduce constraints beyond what an ancestor already
  // pruned via `attributeVisibleCategoryIds`). Walks the subtree, fetches
  // items + their attribute values across it, keeps the ancestor chain of
  // each matching item so parents stay visible down to the match.
  const ownFilterActive = hasAnyAttributeFilter(ownAttrFilter)

  const subtreeInfo = useMemo(() => {
    if (!expanded || !ownFilterActive || node.children.length === 0) return null
    const ids: string[] = [node.id]
    const parentMap = new Map<string, string | null>()
    parentMap.set(node.id, null)
    const stack: { n: InventoryTreeNode; parentId: string }[] = node.children.map((c) => ({ n: c, parentId: node.id }))
    while (stack.length > 0) {
      const { n, parentId } = stack.pop()!
      ids.push(n.id)
      parentMap.set(n.id, parentId)
      for (const child of n.children) stack.push({ n: child, parentId: n.id })
    }
    return { ids, parentMap }
  }, [expanded, ownFilterActive, node])

  const { data: subtreeItems = [] } = useInventoryItemsByCategories(
    subtreeInfo?.ids ?? [],
    showArchived,
  )
  const { data: subtreeAttrs } = useItemAttributesByCategories(subtreeInfo?.ids ?? [])

  const visibleDescendantIds = useMemo<Set<string> | undefined>(() => {
    if (!subtreeInfo) return undefined
    const keep = new Set<string>()
    keep.add(node.id) // self stays visible so operator can still see the filter row
    for (const item of subtreeItems) {
      if (!itemPassesAttributeFilter(subtreeAttrs?.get(item.id), effectiveAttrFilter)) continue
      let cursor: string | null = item.category_id
      while (cursor && !keep.has(cursor)) {
        keep.add(cursor)
        if (cursor === node.id) break
        cursor = subtreeInfo.parentMap.get(cursor) ?? null
      }
    }
    return keep
  }, [subtreeInfo, subtreeItems, subtreeAttrs, effectiveAttrFilter, node.id])

  // Pass whichever restriction is tighter down to children. If ancestor
  // already gave us a set, intersect; otherwise just use our own.
  const passDownVisibleIds = useMemo(() => {
    if (!visibleDescendantIds && !attributeVisibleCategoryIds) return undefined
    if (!visibleDescendantIds) return attributeVisibleCategoryIds
    if (!attributeVisibleCategoryIds) return visibleDescendantIds
    const inter = new Set<string>()
    for (const id of visibleDescendantIds) if (attributeVisibleCategoryIds.has(id)) inter.add(id)
    return inter
  }, [visibleDescendantIds, attributeVisibleCategoryIds])

  const indent = 12 + depth * 20

  // Ancestor's attribute filter pruned this branch — nothing to show at
  // this row or below. Skip render entirely (parent stays visible). Placed
  // after all hooks so the Rules of Hooks stay satisfied.
  if (attributeVisibleCategoryIds && !attributeVisibleCategoryIds.has(node.id)) {
    return null
  }

  function handleItemMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = items[idx]
    const b = items[targetIdx]
    updateItemOrder.mutate([
      { id: a.id, sort_order: a.sort_order ?? idx },
      { id: b.id, sort_order: b.sort_order ?? targetIdx },
    ])
  }

  function handleChildCategoryMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = node.children[idx]
    const b = node.children[targetIdx]
    updateChildCategoryOrder.mutate([
      { id: a.id, sort_order: a.sort_order ?? idx },
      { id: b.id, sort_order: b.sort_order ?? targetIdx },
    ])
  }

  return (
    <>
      {/* Category row */}
      <tr
        className={`border-b border-border cursor-pointer ${
          depth === 0 ? 'bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700'
          : depth === 1 ? 'bg-blue-50 hover:bg-blue-100/80 dark:bg-blue-950/40 dark:hover:bg-blue-900/40'
          : depth === 2 ? 'bg-violet-50 hover:bg-violet-100/80 dark:bg-violet-950/40 dark:hover:bg-violet-900/40'
          : 'bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/40 dark:hover:bg-amber-900/40'
        }`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2.5 pr-2 w-1/2" style={{ paddingLeft: indent }}>
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            }
            <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <button
                className="text-sm font-semibold text-blue-600 hover:underline text-left"
                onClick={(e) => { e.stopPropagation(); setEditOpen(true) }}
              >
                {node.name_en}
              </button>
              {node.name_ar && (
                <div className="text-[10px] text-muted-foreground" dir="rtl">{node.name_ar}</div>
              )}
            </div>
          </div>
        </td>
        <td className="py-2.5 px-2 text-[11px] font-mono text-muted-foreground hidden sm:table-cell">{node.sku ?? '---'}</td>
        {(() => {
          const agg = stockAggregates?.get(node.id)
          if (!agg || agg.variant_count === 0) return (
            <>
              <td className="py-2.5 px-2 text-[11px] text-muted-foreground hidden md:table-cell">---</td>
              <td className="py-2.5 px-2 text-[11px] text-muted-foreground hidden md:table-cell">---</td>
              <td className="py-2.5 px-2 text-[11px] text-muted-foreground">---</td>
            </>
          )
          const available = Number(agg.total_stock) - Number(agg.total_reserved)
          return (
            <>
              <td className="py-2.5 px-2 text-[11px] text-muted-foreground hidden md:table-cell">
                {agg.variant_count} variant{Number(agg.variant_count) !== 1 ? 's' : ''}
              </td>
              <td className="py-2.5 px-2 text-[11px] text-muted-foreground hidden md:table-cell">
                {formatCurrency(Number(agg.avg_cost), 'QAR')}
              </td>
              <td className="py-2.5 px-2 text-[11px]">
                <span className={available > 0 ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                  {available.toLocaleString()}
                </span>
                {Number(agg.total_damaged) > 0 && (
                  <span className="text-red-500 ml-1.5 text-[10px]">({agg.total_damaged} dmg)</span>
                )}
              </td>
            </>
          )
        })()}
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" aria-label="Move category up" className="h-6 w-6 hidden sm:inline-flex" disabled={!canMoveUp} onClick={() => onMoveUp()}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Move category down" className="h-6 w-6 hidden sm:inline-flex" disabled={!canMoveDown} onClick={() => onMoveDown()}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Add subcategory" className="h-6 w-6 hidden sm:inline-flex" title="Add Subcategory" onClick={() => setAddSubcategoryOpen(true)}>
              <FolderPlus className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Add item" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" title="Add Item" onClick={() => setAddItemOpen(true)}>
              <Plus className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Edit category" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            {canViewAttributes && (
              <Button variant="ghost" size="icon" aria-label="Manage attributes" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" title="Manage Attributes" onClick={() => setAttributesOpen(true)}>
                <Tags className="h-3 w-3" />
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Archive category" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0 text-muted-foreground hover:text-destructive" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>

      {/* Attribute filter chips — one row per effective attribute of this
          category, rendered inline when expanded. Silent when the category
          (and its ancestors) have no attributes defined. Own picks cascade
          down to descendant rows via `inheritedAttributeFilter`. */}
      {expanded && hasFilterableAttrs && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={6} className="py-2" style={{ paddingLeft: indent + 28, paddingRight: 12 }}>
            <AttributeFilterBar
              categoryId={node.id}
              value={ownAttrFilter}
              onChange={setOwnAttrFilter}
              hideDefinitionIds={inheritedActiveIds}
              size="sm"
            />
          </td>
        </tr>
      )}

      {/* Child categories (rendered before items) */}
      {expanded && node.children.map((child: InventoryTreeNode, idx: number) => (
        <CategoryRow
          key={child.id}
          node={child}
          categoryType={categoryType}
          showArchived={showArchived}
          canMoveUp={idx > 0}
          canMoveDown={idx < node.children.length - 1}
          onMoveUp={() => handleChildCategoryMove(idx, 'up')}
          onMoveDown={() => handleChildCategoryMove(idx, 'down')}
          depth={depth + 1}
          stockAggregates={stockAggregates}
          filterItemIds={filterItemIds}
          inheritedAttributeFilter={effectiveAttrFilter}
          attributeVisibleCategoryIds={passDownVisibleIds}
        />
      ))}

      {/* Items — a category can hold direct items alongside sub-categories.
          Wrapped in the batch provider so each ItemRow's AttributeChipStrip
          reads ONE batched query (itemAttrsByItem) instead of one per row.
          ItemAttributesProvider emits no DOM, so it's safe between table rows. */}
      {expanded && items.length > 0 && (
        <ItemAttributesProvider value={attrBatchValue}>
          {items.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
              categoryType={categoryType}
              showArchived={showArchived}
              canMoveUp={idx > 0}
              canMoveDown={idx < items.length - 1}
              onMoveUp={() => handleItemMove(idx, 'up')}
              onMoveDown={() => handleItemMove(idx, 'down')}
            />
          ))}
        </ItemAttributesProvider>
      )}

      {expanded && isLeaf && items.length === 0 && (
        <tr className="border-b border-border">
          <td colSpan={6} className="py-3 text-[11px] text-muted-foreground" style={{ paddingLeft: indent + 24 }}>
            No items in this category yet.
          </td>
        </tr>
      )}

      <CategoryEditDialog open={editOpen} onOpenChange={setEditOpen} categoryType={categoryType} category={node} />
      <CategoryEditDialog open={addSubcategoryOpen} onOpenChange={setAddSubcategoryOpen} categoryType={categoryType} parentId={node.id} />
      <ItemEditDialog open={addItemOpen} onOpenChange={setAddItemOpen} categoryId={node.id} categoryType={categoryType} />
      {canViewAttributes && (
        <CategoryAttributesDialog
          open={attributesOpen}
          onOpenChange={setAttributesOpen}
          categoryId={node.id}
          categoryName={node.name_en}
        />
      )}
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Category"
        description={`Archive "${node.name_en}"? All items in this category will be hidden.`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() =>
          archiveCategory.mutate(node.id, {
            onSuccess: () => { toast.success('Category archived'); setArchiveOpen(false) },
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </>
  )
}
