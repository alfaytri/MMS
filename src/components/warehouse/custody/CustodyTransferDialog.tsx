'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronsUpDown, Package, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { GuardedDialog, type GuardedFormDialogHandle } from '@/components/shared/GuardedFormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { WhItemPicker, type PickerItem } from '@/components/purchase/wh/WhItemPicker'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { useCustodyLocations } from '@/hooks/useCustodyLocations'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import { useCreateCustodyTransfer } from '@/hooks/useCustodyMoves'

interface Props {
  open:            boolean
  onOpenChange:    (open: boolean) => void
  sourceSubId:     string   // this card's custody location (fixed source)
  sourceSubName:   string
  sourceWhId:      string
  sourceKindLabel: string
}

type LineRow = { brand_variant_id: string; qty: string }

/**
 * Hand stock from THIS custody location to another custody location.
 * Wraps rpc_create_custody_transfer — stock leaves the source immediately and
 * the transfer sits in_transit until the destination's responsible person
 * accepts it (via the Accept button on their card). Only mounted where the
 * source's custody warehouse is flagged can_transfer_custody.
 */
export function CustodyTransferDialog({
  open, onOpenChange, sourceSubId, sourceSubName, sourceWhId, sourceKindLabel,
}: Props) {
  const { data: profile }        = useCurrentUserProfile()
  const transfer                 = useCreateCustodyTransfer()
  const { data: allLocations = [] } = useCustodyLocations()
  const { isSuperViewer, userDivisionIds } = useUserDivisionScope()

  const [destWhId, setDestWhId]         = useState('')
  const [destSubId, setDestSubId]       = useState('')
  const [rows, setRows]                 = useState<LineRow[]>([{ brand_variant_id: '', qty: '' }])
  const [notes, setNotes]               = useState('')
  const [openPickerIdx, setOpenPickerIdx] = useState<number | null>(null)
  const guardRef                        = useRef<GuardedFormDialogHandle>(null)

  // Eligible destinations: active custody locations with a responsible person
  // (needed so someone can accept), excluding this source location, and limited
  // to the divisions the caller is assigned to (owner / accountant see all).
  // The server re-checks the same division rule in rpc_create_custody_transfer.
  const destLocations = useMemo(
    () => allLocations.filter(
      (l) => l.is_active && l.id !== sourceSubId && !!l.responsible_person_profile_id
        && (isSuperViewer || (l.division_id != null && userDivisionIds.includes(l.division_id))),
    ),
    [allLocations, sourceSubId, isSuperViewer, userDivisionIds],
  )
  // Side-by-side hierarchical pickers: destination warehouse -> location.
  const destWarehouses = useMemo(() => {
    const map = new Map<string, string>()
    for (const l of destLocations) if (!map.has(l.warehouse_id)) map.set(l.warehouse_id, l.warehouse_name)
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [destLocations])
  const destLocsForWh = useMemo(
    () => destLocations
      .filter((l) => l.warehouse_id === destWhId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [destLocations, destWhId],
  )

  // Auto-pick a lone destination warehouse.
  useEffect(() => {
    if (destWarehouses.length === 1) setDestWhId(destWarehouses[0].id)
  }, [destWarehouses])
  // Reset / auto the location whenever the warehouse changes.
  useEffect(() => {
    if (destLocsForWh.length === 1) setDestSubId(destLocsForWh[0].id)
    else if (!destLocsForWh.some((l) => l.id === destSubId)) setDestSubId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destWhId, destLocsForWh.length])

  // Source stock scoped to (warehouse, sub) via the D.5 view arg.
  const { data: sourceStock = [] } = useWarehouseStock(sourceWhId || undefined, sourceSubId)

  const availableQtyMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of sourceStock) {
      map.set(s.brand_variant_id, (map.get(s.brand_variant_id) ?? 0) + (s.available_qty ?? 0))
    }
    return map
  }, [sourceStock])

  const pickerItems: PickerItem[] = useMemo(() => {
    const seen = new Set<string>()
    const out: PickerItem[] = []
    for (const s of sourceStock) {
      if (seen.has(s.brand_variant_id)) continue
      seen.add(s.brand_variant_id)
      out.push({
        id:           s.brand_variant_id,
        name:         s.item_name ?? '(No name)',
        brand:        s.brand ?? null,
        sku:          s.sku ?? null,
        category:     s.category_name ?? null,
        qty:          availableQtyMap.get(s.brand_variant_id) ?? 0,
        reorderPoint: 0,
        imageUrl:     s.image_url ?? null,
      })
    }
    return out
  }, [sourceStock, availableQtyMap])

  const selectedIds = useMemo(() => new Set(rows.map((r) => r.brand_variant_id).filter(Boolean)), [rows])

  const isDirty =
    destWhId !== '' || destSubId !== '' || notes.trim() !== '' ||
    rows.some((r) => r.brand_variant_id !== '' || r.qty !== '')

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setDestWhId('')
      setDestSubId('')
      setRows([{ brand_variant_id: '', qty: '' }])
      setNotes('')
      setOpenPickerIdx(null)
    }
  }, [open])

  function addRow() {
    setRows((prev) => [...prev, { brand_variant_id: '', qty: '' }])
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateRow(idx: number, field: keyof LineRow, value: string) {
    setRows((prev) => prev.map((row, i) => {
      if (i !== idx) return row
      if (field === 'brand_variant_id') return { brand_variant_id: value, qty: '' }
      return { ...row, [field]: value }
    }))
  }

  const rowErrors = useMemo(
    () => rows.map((row) => {
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
  const hasValidRows        = rows.some((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
  const canSubmit           = !!destSubId && hasValidRows && !hasValidationErrors && !transfer.isPending

  const destName = destLocsForWh.find((l) => l.id === destSubId)?.name ?? ''

  async function handleSubmit() {
    if (!destSubId) { toast.error('Pick a destination location'); return }
    const items = rows
      .filter((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
      .map((r) => ({ brand_variant_id: r.brand_variant_id, qty: parseInt(r.qty, 10) }))
    if (items.length === 0) { toast.error('Add at least one item to transfer'); return }
    try {
      await transfer.mutateAsync({
        source_sub_container_id: sourceSubId,
        dest_sub_container_id:   destSubId,
        items,
        notes:                   notes.trim() || null,
        created_by_profile_id:   profile?.id ?? null,
        created_by_name:         profile?.full_name ?? null,
      })
      toast.success(`Transfer sent to ${destName || 'the location'} — awaiting their acceptance`)
      guardRef.current?.closeAfterSubmit()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create the transfer')
    }
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="flex flex-col overflow-hidden p-0 w-[calc(100vw-1.5rem)] max-h-[88dvh] rounded-lg sm:w-[42rem] sm:h-[80vh] sm:max-h-[80vh] sm:max-w-[95vw]">
        <DialogHeader className="px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
          <DialogTitle className="text-sm font-semibold leading-snug pr-8">
            Transfer stock from {sourceKindLabel} — {sourceSubName}
          </DialogTitle>
          <p className="hidden sm:block text-[11px] text-muted-foreground mt-1">
            Sends stock straight to another custody location. It leaves here now and shows as
            &ldquo;in transit&rdquo; until that location&apos;s responsible person accepts it.
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-3 space-y-3 sm:px-5 sm:pb-5 sm:space-y-4">
          {/* From (fixed) */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">From</Label>
            <div className="h-9 flex items-center rounded-md border bg-muted/40 px-2.5 text-xs font-medium truncate" title={sourceSubName}>
              {sourceSubName}
            </div>
          </div>

          {/* To — side-by-side warehouse -> location */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">To</Label>
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0 space-y-1">
                <span className="text-[10px] text-muted-foreground">Warehouse</span>
                <Select value={destWhId} onValueChange={(v) => setDestWhId(v ?? '')}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Custody warehouse" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {destWarehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-center h-9 px-0.5 self-end pb-0">
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <span className="text-[10px] text-muted-foreground">Location</span>
                <Select value={destSubId} onValueChange={(v) => setDestSubId(v ?? '')} disabled={!destWhId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={destWhId ? 'Pick location' : 'Pick warehouse first'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {destLocsForWh.map((l) => (
                      <SelectItem key={l.id} value={l.id} className="text-xs">
                        {l.name}{l.division_name && !l.name.includes(l.division_name) ? ` — ${l.division_name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {destWarehouses.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic">
                No other custody location with a responsible person to receive a transfer.
              </p>
            )}
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-medium">Items</Label>
              <span className="text-[10px] text-muted-foreground">{pickerItems.length} in stock</span>
            </div>

            {pickerItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 border border-dashed rounded-lg text-muted-foreground">
                <Package className="h-6 w-6 mb-1.5 opacity-30" />
                <p className="text-[11px]">This location has no stock to transfer</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {rows.map((row, idx) => {
                  const selected  = sourceStock.find((s) => s.brand_variant_id === row.brand_variant_id)
                  const available = row.brand_variant_id ? (availableQtyMap.get(row.brand_variant_id) ?? 0) : null
                  const error     = rowErrors[idx]
                  return (
                    <div
                      key={idx}
                      className={`rounded-md border p-2.5 space-y-1.5 ${error ? 'border-destructive/50 bg-destructive/5' : 'bg-card'}`}
                    >
                      <Popover open={openPickerIdx === idx} onOpenChange={(o) => setOpenPickerIdx(o ? idx : null)}>
                        <PopoverTrigger className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 text-[11px] hover:bg-accent/50 cursor-pointer">
                          {selected ? (
                            <span className="truncate">
                              <span className="font-medium">{selected.item_name}</span>
                              {selected.brand && (
                                <span className="text-muted-foreground"> — {selected.brand}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Search items…</span>
                          )}
                          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1.5" />
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-auto" align="start" side="bottom">
                          <WhItemPicker
                            items={pickerItems}
                            selectedIds={selectedIds}
                            currentValue={row.brand_variant_id}
                            onSelect={(id) => { updateRow(idx, 'brand_variant_id', id); setOpenPickerIdx(null) }}
                            showQty
                          />
                        </PopoverContent>
                      </Popover>

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
                            / {available} {selected?.unit ?? ''}
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

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Notes</Label>
            <Textarea
              className="text-[11px] min-h-[48px] resize-none"
              placeholder="Optional context (job ID, reason, etc.)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="m-0 px-4 py-2.5 sm:px-5 sm:py-3 border-t bg-muted/30 rounded-b-lg">
          <Button variant="outline" size="sm" className="text-[11px] h-11 sm:h-8" onClick={() => guardRef.current?.requestClose()} disabled={transfer.isPending}>
            Cancel
          </Button>
          <Button size="sm" className="text-[11px] h-11 sm:h-8" disabled={!canSubmit} onClick={handleSubmit}>
            {transfer.isPending ? 'Sending…' : 'Send transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
