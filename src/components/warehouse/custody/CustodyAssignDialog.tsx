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
import { Badge } from '@/components/ui/badge'
import { WhItemPicker, type PickerItem } from '@/components/purchase/wh/WhItemPicker'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseSubContainers } from '@/hooks/useWarehouseSubContainers'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import { useCreateCustodyAssign } from '@/hooks/useCustodyMoves'

interface Props {
  open:            boolean
  onOpenChange:    (open: boolean) => void
  destSubId:       string        // Team or Place sub-container id
  destSubName:     string        // Card label for the dialog header
  destKindLabel:   string
}

type LineRow = { brand_variant_id: string; qty: string }

/**
 * Assign stock from a real warehouse to a Team or Place custody sub-container.
 * Wraps rpc_create_custody_assign — stock is deducted from the source WH
 * immediately and the transfer sits in_transit until the destination's
 * responsible person accepts (via the Accept button on the same card).
 */
export function CustodyAssignDialog({ open, onOpenChange, destSubId, destSubName, destKindLabel }: Props) {
  const { data: profile }                             = useCurrentUserProfile()
  const { data: warehouses = [] }                     = useWarehouses()
  const [fromWhId,  setFromWhId]                      = useState('')
  const [fromSubId, setFromSubId]                     = useState<string | null>(null)
  const [rows, setRows]                               = useState<LineRow[]>([{ brand_variant_id: '', qty: '' }])
  const [notes, setNotes]                             = useState('')
  const [openPickerIdx, setOpenPickerIdx]             = useState<number | null>(null)
  const guardRef                                       = useRef<GuardedFormDialogHandle>(null)

  const isDirty = fromWhId !== '' || notes.trim() !== '' || rows.some((r) => r.brand_variant_id !== '' || r.qty !== '')

  const assign = useCreateCustodyAssign()

  const { data: fromSubs = [] } = useWarehouseSubContainers(fromWhId || null)
  const eligibleFromSubs = useMemo(() => fromSubs.filter((s) => s.is_active), [fromSubs])

  // A single-division requester takes from their own division's shelf in the chosen
  // warehouse — auto-pick that sub so they don't have to (and don't get) a choice.
  const { isSuperViewer, userDivisionIds } = useUserDivisionScope()
  const singleDivisionId = !isSuperViewer && userDivisionIds.length === 1 ? userDivisionIds[0] : null
  const divisionMatchedSub = useMemo(
    () => (singleDivisionId ? eligibleFromSubs.find((s) => s.division_id === singleDivisionId) ?? null : null),
    [singleDivisionId, eligibleFromSubs],
  )

  // Auto-pick: prefer the requester's-division sub, then a lone sub; otherwise the picker.
  useEffect(() => {
    if (eligibleFromSubs.length === 0) { setFromSubId(null); return }
    if (divisionMatchedSub) { setFromSubId(divisionMatchedSub.id); return }
    if (eligibleFromSubs.length === 1) { setFromSubId(eligibleFromSubs[0].id); return }
    if (fromSubId && !eligibleFromSubs.some((s) => s.id === fromSubId)) setFromSubId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromWhId, eligibleFromSubs.length, divisionMatchedSub?.id])

  // Source stock scoped to (warehouse, sub). Uses the D.5 view arg.
  const { data: sourceStock = [] } = useWarehouseStock(fromWhId || undefined, fromSubId)

  const availableQtyMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of sourceStock) {
      map.set(row.brand_variant_id, (map.get(row.brand_variant_id) ?? 0) + (row.available_qty ?? 0))
    }
    return map
  }, [sourceStock])

  const pickerItems: PickerItem[] = useMemo(
    () => sourceStock.map((s) => ({
      id:            s.brand_variant_id,
      name:          s.item_name ?? '(No name)',
      brand:         s.brand ?? null,
      sku:           s.sku ?? null,
      category:      s.category_name ?? null,
      qty:           availableQtyMap.get(s.brand_variant_id) ?? 0,
      reorderPoint:  0,
      imageUrl:      s.image_url ?? null,
    })),
    [sourceStock, availableQtyMap],
  )

  const selectedIds = useMemo(() => new Set(rows.map((r) => r.brand_variant_id).filter(Boolean)), [rows])

  // Reset on open/close.
  useEffect(() => {
    if (!open) {
      setFromWhId('')
      setFromSubId(null)
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

  const hasValidRows        = rows.some((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
  const hasValidationErrors = rowErrors.some((e) => e !== null)
  const fromSubResolved     = eligibleFromSubs.length > 0 && (eligibleFromSubs.length === 1 || !!fromSubId)
  const canSubmit           = !!fromWhId && fromSubResolved && hasValidRows && !hasValidationErrors && !assign.isPending

  async function handleSubmit() {
    if (!fromWhId || !fromSubId) {
      toast.error('Pick a source warehouse + sub-container')
      return
    }
    const items = rows
      .filter((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
      .map((r) => ({ brand_variant_id: r.brand_variant_id, qty: parseInt(r.qty, 10) }))

    try {
      await assign.mutateAsync({
        source_warehouse_id:     fromWhId,
        source_sub_container_id: fromSubId,
        dest_sub_container_id:   destSubId,
        items,
        notes:                   notes.trim() || null,
        created_by_profile_id:   profile?.id ?? null,
        created_by_name:         profile?.full_name ?? null,
      })
      toast.success(`Request sent to ${warehouses.find((w) => w.id === fromWhId)?.name ?? 'warehouse'} — awaiting dispatch`)
      guardRef.current?.closeAfterSubmit()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create custody assign')
    }
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[42rem] sm:h-[80vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-sm font-semibold">
            Request stock for {destKindLabel} — {destSubName}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Submits a request to the source warehouse. Their responsible person confirms the load-out with Dispatch, then the {destKindLabel.toLowerCase()}&apos;s responsible person accepts on delivery.
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3 space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-[11px] text-muted-foreground">Source warehouse</Label>
              <Select value={fromWhId} onValueChange={(v) => setFromWhId(v ?? '')}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Pick source warehouse" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {warehouses.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-center h-9 px-1.5">
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-[11px] text-muted-foreground">Destination</Label>
              <div className="h-9 flex items-center rounded-md border bg-muted/40 px-2.5 text-xs font-medium truncate">
                {destSubName}
              </div>
            </div>
          </div>

          {fromWhId && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap min-h-7">
              <span className="inline-flex items-center gap-1 flex-shrink-0">
                <Package className="h-3 w-3" />
                From sub-container:
              </span>
              {eligibleFromSubs.length === 0 ? (
                <span className="italic text-destructive">No active sub-container in this warehouse.</span>
              ) : divisionMatchedSub ? (
                <>
                  <span className="font-medium text-foreground truncate max-w-[420px]">{divisionMatchedSub.name}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">Your division</Badge>
                </>
              ) : eligibleFromSubs.length === 1 ? (
                <>
                  <span className="font-medium text-foreground truncate max-w-[420px]">{eligibleFromSubs[0].name}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">Auto</Badge>
                </>
              ) : (
                <Select value={fromSubId ?? ''} onValueChange={(v) => setFromSubId(v || null)}>
                  <SelectTrigger className="h-7 text-[11px] w-auto min-w-[220px] max-w-[420px]">
                    <SelectValue placeholder="Pick source sub-container…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {eligibleFromSubs.map((sc) => (
                      <SelectItem key={sc.id} value={sc.id} className="text-[11px]">
                        {sc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-medium">Items</Label>
              {fromWhId && (
                <span className="text-[10px] text-muted-foreground">{sourceStock.length} in stock</span>
              )}
            </div>

            {!fromWhId ? (
              <div className="flex flex-col items-center justify-center py-6 border border-dashed rounded-lg text-muted-foreground">
                <Package className="h-6 w-6 mb-1.5 opacity-30" />
                <p className="text-[11px]">Select a source warehouse first</p>
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

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Notes</Label>
            <Textarea
              className="text-[11px] min-h-[48px] resize-none"
              placeholder="Optional context (job ID, van ref, etc.)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="m-0 px-5 py-3 border-t bg-muted/30 rounded-b-lg">
          <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={() => guardRef.current?.requestClose()} disabled={assign.isPending}>
            Cancel
          </Button>
          <Button size="sm" className="text-[11px] h-8" disabled={!canSubmit} onClick={handleSubmit}>
            {assign.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
