'use client'

import { useState, useMemo } from 'react'
import { ArrowRight, Bell, Plus, Trash2, Package, ChevronsUpDown } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { WhItemPicker, type PickerItem } from './WhItemPicker'
import { Warehouse } from '@/hooks/useWarehouses'
import { Profile } from '@/hooks/useProfiles'
import {
  useWarehouseStock,
  useCreateTransfer,
  useReorderPoints,
} from '@/hooks/useWarehouseOperations'
import { useHasPermission } from '@/hooks/usePermissions'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface TransferRow {
  brand_variant_id: string
  qty: string
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: Profile | null
  children: React.ReactNode
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function WhTransferDialog({ warehouses, currentProfile, children }: Props) {
  const canCreate = useHasPermission('warehouse.transfer.create')

  const [open, setOpen] = useState(false)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [rows, setRows] = useState<TransferRow[]>([{ brand_variant_id: '', qty: '' }])
  const [notes, setNotes] = useState('')
  const [pendingFromId, setPendingFromId] = useState<string | null>(null)
  const [openItemIdx, setOpenItemIdx] = useState<number | null>(null)

  const createTransfer = useCreateTransfer()

  const toWh = warehouses.find((w) => w.id === toId)
  const fromWh = warehouses.find((w) => w.id === fromId)

  const { data: sourceStock = [] } = useWarehouseStock(fromId || undefined)
  const { data: fullStock = [] } = useWarehouseStock()
  const { data: reorderPoints = [] } = useReorderPoints(toId || undefined)

  const availableQtyMap = useMemo(
    () => new Map(sourceStock.map((item) => [item.brand_variant_id, item.available_qty])),
    [sourceStock],
  )

  const destStockMap = useMemo(
    () => new Map(fullStock.filter((s) => s.warehouse_id === toId).map((s) => [s.brand_variant_id, s])),
    [fullStock, toId],
  )

  const reorderMap = useMemo(
    () => new Map(reorderPoints.map((rp) => [rp.brand_variant_id, rp.reorder_point])),
    [reorderPoints],
  )

  const itemsByPriority = useMemo(() => {
    if (!toId) return sourceStock
    return [...sourceStock].sort((a, b) => {
      const aDest = destStockMap.get(a.brand_variant_id)
      const bDest = destStockMap.get(b.brand_variant_id)
      const aRP = reorderMap.get(a.brand_variant_id) ?? 0
      const bRP = reorderMap.get(b.brand_variant_id) ?? 0
      const aPriority = !aDest ? 4 : aDest.qty === 0 ? 1 : aDest.qty <= aRP ? 2 : 3
      const bPriority = !bDest ? 4 : bDest.qty === 0 ? 1 : bDest.qty <= bRP ? 2 : 3
      if (aPriority !== bPriority) return aPriority - bPriority
      return (a.item_name ?? '').localeCompare(b.item_name ?? '')
    })
  }, [sourceStock, toId, destStockMap, reorderMap])

  const sourceFieldRPs = fromWh?.responsible_persons ?? []

  const selectedIds = useMemo(() => new Set(rows.map((r) => r.brand_variant_id).filter(Boolean)), [rows])

  const pickerItems: PickerItem[] = useMemo(
    () => itemsByPriority.map((s) => ({
      id:            s.brand_variant_id,
      name:          s.item_name ?? '(No name)',
      brand:         s.brand ?? null,
      sku:           s.sku ?? null,
      category:      s.category_name ?? null,
      qty:           s.available_qty,
      destQty:       destStockMap.get(s.brand_variant_id)?.qty,
      reorderPoint:  reorderMap.get(s.brand_variant_id) ?? 0,
    })),
    [itemsByPriority, destStockMap, reorderMap],
  )

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleClose() {
    setOpen(false)
    setFromId('')
    setToId('')
    setRows([{ brand_variant_id: '', qty: '' }])
    setNotes('')
    setOpenItemIdx(null)
  }

  function addRow() {
    setRows((prev) => [...prev, { brand_variant_id: '', qty: '' }])
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateRow(idx: number, field: keyof TransferRow, value: string) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row
        if (field === 'brand_variant_id') return { brand_variant_id: value, qty: '' }
        return { ...row, [field]: value }
      }),
    )
  }

  function handleFromChange(id: string) {
    if (rows.some((r) => r.brand_variant_id)) {
      setPendingFromId(id)
      return
    }
    setFromId(id)
  }

  function confirmFromChange() {
    if (pendingFromId) {
      setFromId(pendingFromId)
      setRows([{ brand_variant_id: '', qty: '' }])
      setPendingFromId(null)
    }
  }

  function selectItem(idx: number, brandVariantId: string) {
    updateRow(idx, 'brand_variant_id', brandVariantId)
    setOpenItemIdx(null)
  }

  // ─── Validation ────────────────────────────────────────────────────────────

  const rowErrors = useMemo(
    () =>
      rows.map((row) => {
        if (!row.brand_variant_id || !row.qty) return null
        const requested = parseFloat(row.qty)
        if (isNaN(requested) || requested <= 0) return null
        const available = availableQtyMap.get(row.brand_variant_id) ?? 0
        if (requested > available) return `Only ${available} available`
        return null
      }),
    [rows, availableQtyMap],
  )

  const hasValidationErrors = rowErrors.some((e) => e !== null)
  const hasValidRows = rows.some((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
  const canSubmit = !!fromId && !!toId && hasValidRows && !hasValidationErrors

  // ─── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!fromId || !toId) return
    try {
      const validRows = rows
        .filter((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
        .map((r) => {
          const item = sourceStock.find((s) => s.brand_variant_id === r.brand_variant_id)
          return {
            brand_variant_id: r.brand_variant_id,
            item_name: item?.item_name ?? '',
            sku: item?.sku ?? null,
            qty: parseFloat(r.qty),
            unit_cost: item?.avg_cost ?? 0,
          }
        })

      const transferId = await createTransfer.mutateAsync({
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        date: new Date().toISOString().split('T')[0],
        items: validRows,
        notes: notes || null,
        created_by_profile_id: currentProfile?.id ?? null,
        created_by_name: currentProfile?.full_name ?? null,
      })

      if (transferId && sourceFieldRPs.length > 0) {
        const supabase = createClient()
        supabase.from('notifications').insert(
          sourceFieldRPs.map((rp: { profile_id: string; full_name: string | null }) => ({
            profile_id: rp.profile_id,
            type: 'transfer_pending',
            title: 'New Transfer Pending Dispatch',
            body: `A new stock transfer to ${toWh?.name ?? 'another warehouse'} needs your dispatch approval.`,
            related_id: transferId,
            related_type: 'warehouse_transfer',
          })),
        )
      }

      toast.success('Transfer created successfully')
      handleClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Something went wrong'
      toast.error(msg)
    }
  }

  if (!canCreate) return null

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>

      <AlertDialog open={!!pendingFromId} onOpenChange={(o) => !o && setPendingFromId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change source warehouse?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the source warehouse will clear all selected items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFromId(null)}>Keep current</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFromChange}>Change warehouse</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[42rem] sm:h-[80vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="text-sm font-semibold">Create Stock Transfer</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-2 space-y-4">
            {/* ── Route: From → To ── */}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-[11px] text-muted-foreground">From</Label>
                <Select value={fromId} onValueChange={(v) => handleFromChange(v ?? '')}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Source warehouse" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {warehouses.filter((w) => w.id !== toId).map((wh) => (
                      <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-center h-9 px-1.5">
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-[11px] text-muted-foreground">To</Label>
                <Select value={toId} onValueChange={(v) => setToId(v ?? '')}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Destination warehouse" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {warehouses.filter((w) => w.id !== fromId).map((wh) => (
                      <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Notification banner ── */}
            {!!fromId && !!toId && sourceFieldRPs.length > 0 && (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-primary/5 border border-primary/15 text-[11px]">
                <Bell className="h-3 w-3 text-primary shrink-0" />
                <span>
                  <strong>{sourceFieldRPs.map((rp: { full_name: string | null }) => rp.full_name ?? 'Unknown').join(', ')}</strong>
                  {' '}will be notified to dispatch.
                </span>
              </div>
            )}

            {/* ── Items ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium">Items</Label>
                {fromId && (
                  <span className="text-[10px] text-muted-foreground">
                    {sourceStock.length} in stock
                  </span>
                )}
              </div>

              {!fromId ? (
                <div className="flex flex-col items-center justify-center py-6 border border-dashed rounded-lg text-muted-foreground">
                  <Package className="h-6 w-6 mb-1.5 opacity-30" />
                  <p className="text-[11px]">Select a source warehouse first</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {rows.map((row, idx) => {
                    const selectedItem = sourceStock.find((s) => s.brand_variant_id === row.brand_variant_id)
                    const available = row.brand_variant_id ? (availableQtyMap.get(row.brand_variant_id) ?? 0) : null
                    const error = rowErrors[idx]

                    return (
                      <div
                        key={idx}
                        className={`rounded-md border p-2.5 space-y-1.5 ${error ? 'border-destructive/50 bg-destructive/5' : 'bg-card'}`}
                      >
                        {/* Searchable item picker */}
                        <Popover open={openItemIdx === idx} onOpenChange={(o) => setOpenItemIdx(o ? idx : null)}>
                          <PopoverTrigger
                            className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 text-[11px] ring-offset-background hover:bg-accent/50 cursor-pointer"
                          >
                            {selectedItem ? (
                              <span className="truncate">
                                <span className="font-medium">{selectedItem.item_name}</span>
                                {selectedItem.brand && (
                                  <span className="text-muted-foreground"> — {selectedItem.brand}</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Search items...</span>
                            )}
                            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1.5" />
                          </PopoverTrigger>
                          <PopoverContent className="p-0 w-auto" align="start">
                            <WhItemPicker
                              items={pickerItems}
                              selectedIds={selectedIds}
                              currentValue={row.brand_variant_id}
                              onSelect={(id) => selectItem(idx, id)}
                              showQty
                              showDestBadge={!!toId}
                            />
                          </PopoverContent>
                        </Popover>

                        {/* Qty row */}
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            className={`h-7 w-[72px] text-[11px] ${error ? 'border-destructive' : ''}`}
                            placeholder="Qty"
                            min="0"
                            value={row.qty}
                            onChange={(e) => updateRow(idx, 'qty', e.target.value)}
                            disabled={!row.brand_variant_id}
                          />
                          {available !== null && (
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              / {available} {selectedItem?.unit ?? ''}
                            </span>
                          )}
                          {error && <span className="text-[10px] text-destructive shrink-0 ml-auto">{error}</span>}
                          {rows.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0 ml-auto"
                              onClick={() => removeRow(idx)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-[11px] gap-1 border-dashed"
                    onClick={addRow}
                  >
                    <Plus className="h-3 w-3" /> Add Item
                  </Button>
                </div>
              )}
            </div>

            {/* ── Notes ── */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Notes</Label>
              <Textarea
                className="text-[11px] min-h-[48px] resize-none"
                placeholder="Optional transfer notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* ── Footer ── */}
          <DialogFooter className="m-0 px-5 py-3 border-t bg-muted/30 rounded-b-lg">
            <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-[11px] h-8"
              disabled={!canSubmit || createTransfer.isPending}
              onClick={handleSubmit}
            >
              {createTransfer.isPending ? 'Creating...' : 'Create Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
