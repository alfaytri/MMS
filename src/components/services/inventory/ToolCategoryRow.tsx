'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowRightLeft, ChevronRight, ChevronDown, Eye, Pencil, Archive, Package, Plus, FolderPlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { InventoryRemoveDialog } from './InventoryRemoveDialog'
import { CategoryEditDialog } from './CategoryEditDialog'
import { ItemEditDialog } from './ItemEditDialog'
import { ToolAssetItemEditDialog, ToolAssetUnitEditDialog } from './ToolAssetEditDialog'
import { ToolUnitTransferDialog } from './ToolUnitTransferDialog'
import { PlaceholderUnitRow } from './PlaceholderUnitRow'
import { BulkToolItemRow } from './BulkToolItemRow'
import { ToolModeBadge, ToolModeDot } from '@/components/warehouse/tools-assets/ToolBadges'
import { useToolPerDivisionModes, type ToolDivisionMode } from '@/hooks/useToolPerDivisionModes'
import { BulkToolStockProvider, type BulkToolStockBatch } from '@/components/shared/BulkToolStockContext'
import { useBulkToolStockBatch } from '@/hooks/useBulkToolStockBatch'
import {
  useInventoryItemsByCategory, useToolAssetUnits, useArchiveInventoryCategory,
  useDeleteInventoryCategory, useDeleteInventoryItem, useUpdateSortOrders,
  useAutoGenerateToolSerials,
  type InventoryItem, type ToolAssetUnit,
} from '@/hooks/useInventory'
import { useAllDivisions } from '@/hooks/useDivisions'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { formatDate } from '@/lib/utils/formatters'
import { categoryDepthStyle } from '@/lib/inventory/categoryDepth'
import { reorderSiblings } from '@/lib/inventory/reorder'
import type { InventoryTreeNode } from '@/hooks/useInventoryTree'

// Narrow a unit list to the nav-bar division filter. Empty set = "All
// divisions" (show everything). Units with no division_id belong to no
// specific division, so they drop out once a division is selected — matching
// the item-level filter (rpc_item_divisions_by_stock only counts non-null unit
// divisions). Shared by the row count and the expanded unit table so the
// number on the row always matches the rows shown when it is expanded.
function unitsForActiveDivision(units: ToolAssetUnit[], viewDivisionIds: Set<string>): ToolAssetUnit[] {
  if (viewDivisionIds.size === 0) return units
  return units.filter((u) => u.division_id != null && viewDivisionIds.has(u.division_id))
}

function ToolUnitRows({ itemId, itemSku }: { itemId: string; itemSku?: string | null }) {
  const { data: allUnits = [], isLoading } = useToolAssetUnits(itemId)
  const { viewDivisionIds } = useActiveDivision()
  const units = useMemo(() => unitsForActiveDivision(allUnits, viewDivisionIds), [allUnits, viewDivisionIds])
  const { data: allDivisions = [] } = useAllDivisions()
  const [editUnit, setEditUnit] = useState<ToolAssetUnit | null>(null)
  const [transferUnit, setTransferUnit] = useState<ToolAssetUnit | null>(null)
  const [addUnitOpen, setAddUnitOpen] = useState(false)
  const autoGenerate = useAutoGenerateToolSerials()

  const statusColor: Record<string, string> = {
    available: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    maintenance: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    retired: 'bg-muted text-muted-foreground',
  }

  // Pending = "no serial yet". If a serial is present, treat the row as confirmed
  // regardless of the placeholder flag (defensive against DB flag drift).
  const pendingUnits = units.filter((u) => !u.serial_number)
  const confirmedUnits = units.filter((u) => !!u.serial_number)
  const pendingCount = pendingUnits.length

  function handleAutoGenerate() {
    autoGenerate.mutate({ item_id: itemId }, {
      onSuccess: (res) => toast.success(`Generated ${res.updated_count} serial${res.updated_count === 1 ? '' : 's'}`),
      onError: (err) => toast.error(humanizeDbError(err)),
    })
  }

  // Resolve a unit's owning division name against ALL divisions (not just the
  // active list) so a since-deactivated division still shows its real name —
  // "Inactive division" is a distinct state from "no division set" and must
  // not be conflated with "Unassigned" (Fix 6 / Minor 5).
  function divisionDisplayName(divisionId: string | null) {
    if (!divisionId) return 'Unassigned'
    const record = allDivisions.find((d) => d.id === divisionId)
    if (!record) return 'Inactive division'
    return record.is_active ? record.name : `${record.name} (inactive)`
  }

  return (
    <>
      <tr className="bg-muted/50">
        <td colSpan={3} className="py-2 pl-12 pr-4">
          {pendingCount > 0 && (
            <div className="mb-2 flex items-center gap-3 flex-wrap">
              <span className="text-[11px] text-amber-700 dark:text-amber-400">
                {pendingCount} pending serial{pendingCount === 1 ? '' : 's'} — enter manually, or
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 md:h-7 px-2.5 text-[11px] border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
                onClick={handleAutoGenerate}
                disabled={autoGenerate.isPending}
              >
                {autoGenerate.isPending
                  ? 'Generating…'
                  : `Auto-generate ${pendingCount} serial${pendingCount === 1 ? '' : 's'}`}
              </Button>
            </div>
          )}
          <div className="rounded border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">SERIAL #</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">BRAND</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">CONDITION</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">STATUS</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">DIVISION</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">EXPIRY</th>
                  <th className="text-right text-[10px] font-semibold py-1.5 px-2">UNIT COST</th>
                  <th className="text-right text-[10px] font-semibold py-1.5 px-2" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={8} className="h-8"><div className="h-4 w-full bg-muted animate-pulse rounded m-2" /></td></tr>}
                {!isLoading && units.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-[11px] text-muted-foreground py-3">No units added yet</td></tr>
                )}
                {pendingUnits.map((unit) => (
                  <PlaceholderUnitRow key={unit.id} unit={unit} siblingUnits={allUnits} showDivisionColumn showCostColumn />
                ))}
                {confirmedUnits.map((unit) => (
                  <tr key={unit.id} className="border-t border-border">
                    <td className="py-1.5 px-2 font-mono">{unit.serial_number}</td>
                    <td className="py-1.5 px-2">{unit.brand}</td>
                    <td className="py-1.5 px-2">{unit.condition}</td>
                    <td className="py-1.5 px-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[unit.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {unit.status}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      {divisionDisplayName(unit.division_id)}
                    </td>
                    <td className="py-1.5 px-2">{unit.expiry ? formatDate(unit.expiry) : '—'}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">
                      {unit.unit_cost != null
                        ? unit.unit_cost.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" aria-label="Transfer unit" title="Transfer to another division" className="h-5 w-5 min-h-11 min-w-11 md:min-h-0 md:min-w-0" onClick={() => setTransferUnit(unit)}>
                          <ArrowRightLeft className="h-2.5 w-2.5" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Edit unit" className="h-5 w-5 min-h-11 min-w-11 md:min-h-0 md:min-w-0" onClick={() => setEditUnit(unit)}>
                          <Pencil className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="mt-2 min-h-11 md:min-h-0 text-xs text-blue-600 hover:underline flex items-center gap-1" onClick={() => setAddUnitOpen(true)}>
            <Plus className="h-3 w-3" /> Add Unit
          </button>
        </td>
      </tr>
      <ToolAssetUnitEditDialog open={addUnitOpen} onOpenChange={setAddUnitOpen} itemId={itemId} itemSku={itemSku} />
      {editUnit && (
        <ToolAssetUnitEditDialog open={!!editUnit} onOpenChange={(v) => { if (!v) setEditUnit(null) }} itemId={itemId} itemSku={itemSku} unit={editUnit} />
      )}
      {transferUnit && (
        <ToolUnitTransferDialog open={!!transferUnit} onOpenChange={(v) => { if (!v) setTransferUnit(null) }} itemId={itemId} unit={transferUnit} />
      )}
    </>
  )
}

function ToolItemRow({ item, depth }: { item: InventoryItem; depth: number }) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deleteItem = useDeleteInventoryItem()

  // Serial-unit count for the INFO column (bulk tools show on-hand qty; a
  // serialized tool's "quantity" is how many physical units are tracked).
  // Reuses the same per-item units query the expanded table uses (shared cache,
  // auto-invalidated by every unit write) and honours the nav-bar division
  // filter so the count matches the rows shown when expanded.
  const { viewDivisionIds } = useActiveDivision()
  const { data: allUnits = [], isLoading: unitsLoading } = useToolAssetUnits(item.id)
  const units = useMemo(() => unitsForActiveDivision(allUnits, viewDivisionIds), [allUnits, viewDivisionIds])
  const pendingCount = units.filter((u) => !u.serial_number).length

  const indent = 12 + (depth + 1) * 20

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/20 cursor-pointer animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out-quint" onClick={() => setExpanded((v) => !v)}>
        <td className="py-2.5 pr-2" style={{ paddingLeft: indent }}>
          <div className="flex items-center gap-2 min-w-0">
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
            <ToolModeDot mode="serialized" />
            <span className="text-sm font-medium truncate">{item.name_en}</span>
            {item.name_ar && <span className="text-[10px] text-muted-foreground truncate flex-shrink-0" dir="rtl">{item.name_ar}</span>}
          </div>
        </td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">
          {unitsLoading
            ? <span className="inline-block h-3 w-16 bg-muted animate-pulse rounded align-middle" />
            : (
              <span className="whitespace-nowrap">
                {units.length} unit{units.length === 1 ? '' : 's'}
                {pendingCount > 0 && (
                  <span className="text-amber-700 dark:text-amber-400"> · {pendingCount} pending serial{pendingCount === 1 ? '' : 's'}</span>
                )}
              </span>
            )}
        </td>
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" aria-label="Edit tool/asset" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete tool/asset" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>
      {expanded && <ToolUnitRows itemId={item.id} itemSku={item.sku} />}
      <ToolAssetItemEditDialog open={editOpen} onOpenChange={setEditOpen} item={item} />
      <InventoryRemoveDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        action="delete"
        entity="item"
        name={item.name_en}
        blockingUnits={0}
        isPending={deleteItem.isPending}
        onConfirm={() =>
          deleteItem.mutate(item.id, {
            onSuccess: () => { toast.success('Tool deleted'); setDeleteOpen(false) },
            onError: (err) => toast.error(humanizeDbError(err)),
          })
        }
      />
    </>
  )
}

// One tool item that has per-(item,division) mode overrides — rendered ONCE
// (no duplicate catalog record), with each division's effective mode + stock
// inline. Bulk divisions show a quantity; serialized divisions show a serial-
// unit count. Tools Per-Division Mode, Phase 2.
function PerDivisionToolItemRow({ item, depth, divisions }: { item: InventoryItem; depth: number; divisions: ToolDivisionMode[] }) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deleteItem = useDeleteInventoryItem()
  const indent = 12 + (depth + 1) * 20
  const stockLabel = (d: ToolDivisionMode) =>
    d.effective_mode === 'bulk'
      ? `${d.bulk_qty.toLocaleString()} qty`
      : `${d.unit_count} unit${d.unit_count === 1 ? '' : 's'}`
  // Custody side (Phase 4): if any division tracks this item serialized, the
  // expanded row surfaces the actual serial units (view / add / auto-generate /
  // edit / transfer) via the shared ToolUnitRows — the same UI a serialized-
  // category item gets. The units carry their own division_id (shown in the
  // DIVISION column), so all of the item's units belong to its serialized
  // divisions; bulk divisions hold qty, never units.
  const serializedDivs = divisions.filter((d) => d.effective_mode === 'serialized')
  const hasSerialized = serializedDivs.length > 0
  return (
    <>
      <tr className="border-b border-border hover:bg-muted/20 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="py-2.5 pr-2" style={{ paddingLeft: indent }}>
          <div className="flex items-center gap-2 min-w-0">
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
            <span className="text-sm font-medium truncate">{item.name_en}</span>
          </div>
        </td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {divisions.map((d) => (
              <span key={d.division_id} className="inline-flex items-center gap-1 whitespace-nowrap">
                <ToolModeBadge mode={d.effective_mode} />
                <span>{d.division_name} · {stockLabel(d)}</span>
              </span>
            ))}
          </div>
        </td>
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" aria-label="Edit tool/asset" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete tool/asset" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>
      {expanded && (
        <>
          <tr className="bg-muted/10">
            <td colSpan={3} className="py-2 pl-12 pr-4">
              <div className="rounded border border-border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted">
                      <th className="text-left text-[10px] font-semibold py-1.5 px-2">DIVISION</th>
                      <th className="text-left text-[10px] font-semibold py-1.5 px-2">MODE</th>
                      <th className="text-left text-[10px] font-semibold py-1.5 px-2">STOCK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {divisions.map((d) => (
                      <tr key={d.division_id} className="border-t border-border">
                        <td className="py-1.5 px-2">{d.division_name}</td>
                        <td className="py-1.5 px-2"><ToolModeBadge mode={d.effective_mode} /></td>
                        <td className="py-1.5 px-2">
                          {d.effective_mode === 'bulk'
                            ? `${d.bulk_qty.toLocaleString()} on hand (quantity, sellable)`
                            : `${d.unit_count} serial unit${d.unit_count === 1 ? '' : 's'} (custody)`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasSerialized && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Serial units for the custody division{serializedDivs.length === 1 ? '' : 's'}
                  {' '}({serializedDivs.map((d) => d.division_name).join(', ')}) — add, auto-generate, edit, or transfer below.
                </p>
              )}
            </td>
          </tr>
          {hasSerialized && <ToolUnitRows itemId={item.id} itemSku={item.sku} />}
        </>
      )}
      <ItemEditDialog open={editOpen} onOpenChange={setEditOpen} categoryId={item.category_id} categoryType="tools" item={item} />
      <InventoryRemoveDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        action="delete"
        entity="item"
        name={item.name_en}
        blockingUnits={0}
        isPending={deleteItem.isPending}
        onConfirm={() =>
          deleteItem.mutate(item.id, {
            onSuccess: () => { toast.success('Tool deleted'); setDeleteOpen(false) },
            onError: (err) => toast.error(humanizeDbError(err)),
          })
        }
      />
    </>
  )
}

type Props = {
  node: InventoryTreeNode
  showArchived: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  depth?: number
  /** When set (nav-bar division filter active), restrict this category's tool
   *  items to those shared with the selected division(s). Undefined = show all. */
  filterItemIds?: Set<string>
  /** Set by ToolsAssetsView on the top-level rows only — one-time staggered
   *  slide-in on first mount. Undefined on nested child rows. */
  animationIndex?: number
}

export function ToolCategoryRow({ node, showArchived, canMoveUp, canMoveDown, onMoveUp, onMoveDown, depth = 0, filterItemIds, animationIndex }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [dialogReadOnly, setDialogReadOnly] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  // Which mode the "+ Add Tool" chooser will create (default = category mode).
  const [addMode, setAddMode] = useState<'bulk' | 'serialized'>(
    node.tool_tracking_mode === 'bulk' ? 'bulk' : 'serialized',
  )
  const [addChooserOpen, setAddChooserOpen] = useState(false)
  // Brief highlight on reorder (transition-based, see CategoryRow).
  const [flashing, setFlashing] = useState(false)
  function flashMove(fn: () => void) {
    fn()
    setFlashing(true)
    window.setTimeout(() => setFlashing(false), 650)
  }
  const [addSubcategoryOpen, setAddSubcategoryOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const archiveCategory = useArchiveInventoryCategory()
  const deleteCategory = useDeleteInventoryCategory()
  const updateChildCategoryOrder = useUpdateSortOrders('inventory_categories')

  const isLeaf = node.children.length === 0
  // Items are fetched whenever the row is expanded, regardless of children.
  // A tools category can hold both direct tool items AND sub-categories.
  const { data: toolItems = [] } = useInventoryItemsByCategory(expanded ? node.id : null, showArchived)

  // When the nav-bar division filter is active, hide items not shared with the
  // selected division(s) — mirrors CategoryRow for the other inventory tabs.
  const visibleItems = useMemo(
    () => (filterItemIds ? toolItems.filter((it) => filterItemIds.has(it.id)) : toolItems),
    [toolItems, filterItemIds],
  )

  // Per-(item,division) mode overrides for this category's items (Phase 2).
  // Items present here have a per-division mode split and render ONCE via
  // PerDivisionToolItemRow; all others use the normal path below (which now
  // honours each item's own tracking mode, so ONE category can mix bulk and
  // serialized tools).
  const { data: perDivModes } = useToolPerDivisionModes(expanded ? node.id : null)

  const categoryMode: 'bulk' | 'serialized' = node.tool_tracking_mode === 'bulk' ? 'bulk' : 'serialized'
  // Effective mode of a regular item = its own item-level override, else the
  // category default.
  const effectiveMode = (it: InventoryItem): 'bulk' | 'serialized' =>
    ((it.tool_tracking_mode as 'bulk' | 'serialized' | null) ?? categoryMode)

  // Batched variants + on-hand for the bulk tool rows — one variants query +
  // one stock query for all of them (N+1 fix). Keyed off each item's effective
  // mode so a bulk tool inside a serialized category is still batched.
  const bulkItemIds = useMemo(
    () =>
      visibleItems
        .filter((it) => !perDivModes?.has(it.id) && effectiveMode(it) === 'bulk')
        .map((it) => it.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleItems, perDivModes, categoryMode],
  )
  const { data: bulkStock } = useBulkToolStockBatch(expanded ? bulkItemIds : [], showArchived)
  const bulkStockValue = useMemo<BulkToolStockBatch>(
    () => ({
      variantsByItem: bulkStock?.variantsByItem ?? new Map(),
      availableByVariant: bulkStock?.availableByVariant ?? new Map(),
    }),
    [bulkStock],
  )

  const indent = 12 + depth * 20
  const depthStyle = categoryDepthStyle(depth)

  function handleChildCategoryMove(idx: number, direction: 'up' | 'down') {
    const updates = reorderSiblings(node.children, idx, direction)
    if (updates.length) updateChildCategoryOrder.mutate(updates)
  }

  return (
    <>
      <tr
        className={`border-b border-border cursor-pointer transition-colors ${depthStyle.row} ${animationIndex !== undefined ? 'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out-quint' : 'animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out-quint'}`}
        // Staggered entrance for top-level rows (see CategoryRow); inline flash bg on reorder.
        style={{
          ...(animationIndex !== undefined ? { animationDelay: `${Math.min(animationIndex, 15) * 40}ms`, animationFillMode: 'backwards' as const } : {}),
          ...(flashing ? { backgroundColor: 'hsl(var(--primary) / 0.15)' } : {}),
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2.5 pr-2 w-1/2" style={{ paddingLeft: indent }}>
          <div className="flex items-center gap-1">
            {expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            }
            <Package className={`h-4 w-4 flex-shrink-0 ${depthStyle.icon}`} />
            <div className="min-w-0">
              <button
                className="text-sm font-semibold text-blue-600 hover:underline text-left truncate block max-w-full"
                onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
              >
                {node.name_en}
              </button>
              {node.name_ar && (
                <div className="text-[10px] text-muted-foreground truncate" dir="rtl">{node.name_ar}</div>
              )}
            </div>
          </div>
        </td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5 min-h-[18px]">
            <ToolModeBadge mode={node.tool_tracking_mode === 'bulk' ? 'bulk' : 'serialized'} />
            {expanded && visibleItems.length > 0 && (
              <span>{visibleItems.length} item{visibleItems.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" aria-label="Move category up" className="h-6 w-6 hidden sm:inline-flex" disabled={!canMoveUp} onClick={() => flashMove(onMoveUp)}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Move category down" className="h-6 w-6 hidden sm:inline-flex" disabled={!canMoveDown} onClick={() => flashMove(onMoveDown)}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Add subcategory" className="h-6 w-6 hidden sm:inline-flex" title="Add Subcategory" onClick={() => setAddSubcategoryOpen(true)}>
              <FolderPlus className="h-3 w-3" />
            </Button>
            <Popover open={addChooserOpen} onOpenChange={setAddChooserOpen}>
              <PopoverTrigger
                render={(props) => (
                  <Button variant="ghost" size="icon" aria-label="Add tool/asset" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" title="Add Tool/Asset" {...props}>
                    <Plus className="h-3 w-3" />
                  </Button>
                )}
              />
              <PopoverContent align="end" className="w-44 p-1">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Add tool as</p>
                {(['serialized', 'bulk'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setAddMode(m); setAddChooserOpen(false); setAddItemOpen(true) }}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="capitalize">{m}</span>
                    {m === categoryMode && <span className="text-[10px] text-muted-foreground">default</span>}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" aria-label="View category" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" title="View" onClick={() => { setDialogReadOnly(true); setEditOpen(true) }}>
              <Eye className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Edit category" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" title="Edit" onClick={() => { setDialogReadOnly(false); setEditOpen(true) }}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Archive category" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0 text-muted-foreground hover:text-destructive" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete category" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>

      {expanded && node.children.map((child: InventoryTreeNode, idx: number) => (
        <ToolCategoryRow
          key={child.id}
          node={child}
          showArchived={showArchived}
          filterItemIds={filterItemIds}
          canMoveUp={idx > 0}
          canMoveDown={idx < node.children.length - 1}
          onMoveUp={() => handleChildCategoryMove(idx, 'up')}
          onMoveDown={() => handleChildCategoryMove(idx, 'down')}
          depth={depth + 1}
        />
      ))}

      {expanded && (() => {
        // Items with a per-(item,division) mode override render once via
        // PerDivisionToolItemRow (no duplicate record); the rest use the normal
        // category-mode path (bulk qty rows or serialized unit rows).
        const perDivItems = perDivModes ? visibleItems.filter((it) => perDivModes.has(it.id)) : []
        const regularItems = perDivModes ? visibleItems.filter((it) => !perDivModes.has(it.id)) : visibleItems
        // Split by each item's effective mode so one category can show both.
        const bulkRegular = regularItems.filter((it) => effectiveMode(it) === 'bulk')
        const serializedRegular = regularItems.filter((it) => effectiveMode(it) === 'serialized')
        return (
          <>
            {perDivItems.map((item) => (
              <PerDivisionToolItemRow key={item.id} item={item} depth={depth} divisions={perDivModes!.get(item.id)!} />
            ))}
            {bulkRegular.length > 0 && (
              <BulkToolStockProvider value={bulkStockValue}>
                {bulkRegular.map((item) => <BulkToolItemRow key={item.id} item={item} depth={depth} showArchived={showArchived} />)}
              </BulkToolStockProvider>
            )}
            {serializedRegular.map((item) => <ToolItemRow key={item.id} item={item} depth={depth} />)}
          </>
        )
      })()}

      {expanded && isLeaf && visibleItems.length === 0 && (
        <tr className="border-b border-border">
          <td colSpan={3} className="py-3 text-[11px] text-muted-foreground" style={{ paddingLeft: indent + 24 }}>
            No tools in this category yet.
          </td>
        </tr>
      )}

      <CategoryEditDialog open={editOpen} onOpenChange={setEditOpen} categoryType="tools" category={node} readOnly={dialogReadOnly} />
      <CategoryEditDialog open={addSubcategoryOpen} onOpenChange={setAddSubcategoryOpen} categoryType="tools" parentId={node.id} />
      {addMode === 'bulk'
        ? <ItemEditDialog open={addItemOpen} onOpenChange={setAddItemOpen} categoryId={node.id} categoryType="tools" trackingMode={addMode !== categoryMode ? addMode : null} />
        : <ToolAssetItemEditDialog open={addItemOpen} onOpenChange={setAddItemOpen} categoryId={node.id} trackingMode={addMode !== categoryMode ? addMode : null} />}
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Category"
        description={`Archive "${node.name_en}"? All tools in this category will be hidden.`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() =>
          archiveCategory.mutate(node.id, {
            onSuccess: () => { toast.success('Category archived'); setArchiveOpen(false) },
            onError: (err) => toast.error(humanizeDbError(err)),
          })
        }
      />
      <InventoryRemoveDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        action="delete"
        entity="category"
        name={node.name_en}
        blockingUnits={0}
        isPending={deleteCategory.isPending}
        onConfirm={() =>
          deleteCategory.mutate(node.id, {
            onSuccess: () => { toast.success('Category deleted'); setDeleteOpen(false) },
            onError: (err) => toast.error(humanizeDbError(err)),
          })
        }
      />
    </>
  )
}
