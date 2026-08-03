'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronsUpDown, Package, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
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
import { useCreateCustodyReturn } from '@/hooks/useCustodyMoves'

interface Props {
  open:           boolean
  onOpenChange:   (open: boolean) => void
  sourceSubId:    string        // Team or Place custody sub-container
  sourceSubName:  string
  sourceWhId:     string        // Teams or Places virtual warehouse id
  sourceKindLabel: 'Team' | 'Place'
}

type LineRow = { brand_variant_id: string; qty: string }

/**
 * Return stock from a Team or Place custody sub back to a real warehouse.
 * Wraps rpc_create_custody_return. Custody FIFO is deducted immediately;
 * the destination WH's field RP receives via the standard receive_transfer
 * from the transfers page.
 *
 * Permission: only the source sub's responsible person or an inventory_manager
 * may call. The RPC enforces — this dialog surfaces the error toast on
 * failure rather than pre-gating the UI (matches other custody flows).
 */
export function CustodyReturnDialog({
  open, onOpenChange,
  sourceSubId, sourceSubName, sourceWhId, sourceKindLabel,
}: Props) {
  const { data: profile }                            = useCurrentUserProfile()
  const { data: warehouses = [] }                    = useWarehouses()
  const [destWhId, setDestWhId]                      = useState('')
  const [destSubId, setDestSubId]                    = useState<string | null>(null)
  const [rows, setRows]                              = useState<LineRow[]>([{ brand_variant_id: '', qty: '' }])
  const [notes, setNotes]                            = useState('')
  const [openPickerIdx, setOpenPickerIdx]            = useState<number | null>(null)

  const ret = useCreateCustodyReturn()

  const { data: destSubs = [] } = useWarehouseSubContainers(destWhId || null)
  const eligibleDestSubs = useMemo(() => destSubs.filter((s) => s.is_active), [destSubs])

  useEffect(() => {
    if (eligibleDestSubs.length === 1) setDestSubId(eligibleDestSubs[0].id)
    else if (eligibleDestSubs.length === 0) setDestSubId(null)
    else if (destSubId && !eligibleDestSubs.some((s) => s.id === destSubId)) setDestSubId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destWhId, eligibleDestSubs.length])

  // Source stock — the custody sub itself.
  const { data: sourceStock = [] } = useWarehouseStock(sourceWhId, sourceSubId)

  const availableQtyMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of sourceStock) {
      map.set(row.brand_variant_id, (map.get(row.brand_variant_id) ?? 0) + (row.available_qty ?? 0))
    }
    return map
  }, [sourceStock])

  const pickerItems: PickerItem[] = useMemo(
    () => sourceStock.map((s) => ({
      id:       s.brand_variant_id,
      name:     s.item_name ?? '(No name)',
      brand:    s.brand ?? null,
      sku:      s.sku ?? null,
      category: s.category_name ?? null,
      imageUrl: s.image_url ?? null,
      qty:      availableQtyMap.get(s.brand_variant_id) ?? 0,
    })),
    [sourceStock, availableQtyMap],
  )

  const selectedIds = useMemo(() => new Set(rows.map((r) => r.brand_variant_id).filter(Boolean)), [rows])

  useEffect(() => {
    if (!open) {
      setDestWhId('')
      setDestSubId(null)
      setRows([{ brand_variant_id: '', qty: '' }])
      setNotes('')
      setOpenPickerIdx(null)
    }
  }, [open])

  function addRow() { setRows((prev) => [...prev, { brand_variant_id: '', qty: '' }]) }
  function removeRow(idx: number) { setRows((prev) => prev.filter((_, i) => i !== idx)) }
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
      if (requested > available) return `Only ${available} in custody`
      return null
    }),
    [rows, availableQtyMap],
  )

  const hasValidRows        = rows.some((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
  const hasValidationErrors = rowErrors.some((e) => e !== null)
  const destResolved        = eligibleDestSubs.length > 0 && (eligibleDestSubs.length === 1 || !!destSubId)
  // Exclude the source virtual WH from destination options — RPC also enforces.
  const eligibleDestWhs     = useMemo(() => warehouses.filter((w) => w.id !== sourceWhId), [warehouses, sourceWhId])
  const canSubmit           = !!destWhId && destResolved && hasValidRows && !hasValidationErrors && !ret.isPending

  async function handleSubmit() {
    if (!destWhId || !destSubId) {
      toast.error('Pick a destination warehouse + sub-container')
      return
    }
    const items = rows
      .filter((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
      .map((r) => ({ brand_variant_id: r.brand_variant_id, qty: parseInt(r.qty, 10) }))

    try {
      await ret.mutateAsync({
        source_sub_container_id: sourceSubId,
        dest_warehouse_id:       destWhId,
        dest_sub_container_id:   destSubId,
        items,
        notes:                   notes.trim() || null,
        created_by_profile_id:   profile?.id ?? null,
        created_by_name:         profile?.full_name ?? null,
      })
      toast.success('Return dispatched — awaits warehouse receipt')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create custody return')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[42rem] sm:h-[80vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-sm font-semibold">
            Return from {sourceKindLabel} — {sourceSubName}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Stock leaves the {sourceKindLabel.toLowerCase()} immediately. The destination warehouse team confirms receipt from the standard transfers page.
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3 space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-[11px] text-muted-foreground">Source</Label>
              <div className="h-9 flex items-center rounded-md border bg-muted/40 px-2.5 text-xs font-medium truncate">
                {sourceSubName}
              </div>
            </div>
            <div className="flex items-center justify-center h-9 px-1.5">
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-[11px] text-muted-foreground">Destination warehouse</Label>
              <Select value={destWhId} onValueChange={(v) => setDestWhId(v ?? '')}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Pick destination warehouse" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {eligibleDestWhs.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {destWhId && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap min-h-7">
              <span className="inline-flex items-center gap-1 flex-shrink-0">
                <Package className="h-3 w-3" />
                To sub-container:
              </span>
              {eligibleDestSubs.length === 0 ? (
                <span className="italic text-destructive">No active sub-container in this warehouse.</span>
              ) : eligibleDestSubs.length === 1 ? (
                <>
                  <span className="font-medium text-foreground truncate max-w-[420px]">{eligibleDestSubs[0].name}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">Auto</Badge>
                </>
              ) : (
                <Select value={destSubId ?? ''} onValueChange={(v) => setDestSubId(v || null)}>
                  <SelectTrigger className="h-7 text-[11px] w-auto min-w-[220px] max-w-[420px]">
                    <SelectValue placeholder="Pick destination sub-container…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {eligibleDestSubs.map((sc) => (
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
              <span className="text-[10px] text-muted-foreground">{sourceStock.length} in custody</span>
            </div>

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
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Notes</Label>
            <Textarea
              className="text-[11px] min-h-[48px] resize-none"
              placeholder="Optional context (reason, condition, etc.)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="m-0 px-5 py-3 border-t bg-muted/30 rounded-b-lg">
          <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={() => onOpenChange(false)} disabled={ret.isPending}>
            Cancel
          </Button>
          <Button size="sm" className="text-[11px] h-8" disabled={!canSubmit} onClick={handleSubmit}>
            {ret.isPending ? 'Dispatching…' : `Return to warehouse`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
