'use client'

import { useState, useMemo } from 'react'
import { ArrowRightLeft, Bell, Plus, X } from 'lucide-react'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Warehouse } from '@/hooks/useWarehouses'
import { useWarehouseStock, useWarehouseStockSummary } from '@/hooks/useWarehouseOperations'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface TransferRow {
  brand_variant_id: string
  qty: string
}

interface Props {
  warehouses: Warehouse[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentProfile: any
  children: React.ReactNode
}

export function WhTransferDialog({ warehouses, currentProfile, children }: Props) {
  const [open, setOpen]             = useState(false)
  const [fromId, setFromId]         = useState('')
  const [toId, setToId]             = useState('')
  const [rows, setRows]             = useState<TransferRow[]>([{ brand_variant_id: '', qty: '' }])
  const [notes, setNotes]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Pending source-warehouse change — waits for user confirmation before clearing rows
  const [pendingFromId, setPendingFromId] = useState<string | null>(null)
  const qc = useQueryClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toWh   = warehouses.find((w) => w.id === toId)
  const fromWh = warehouses.find((w) => w.id === fromId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const managerName        = (toWh as any)?.manager_name ?? 'the warehouse manager'
  const showApprovalBanner = !!fromId && !!toId

  // Source warehouse stock for item picker
  const { data: sourceStock = [] } = useWarehouseStock(fromId || undefined)
  // Memoized Map for O(1) available-qty lookups
  const { data: availableQtyMap } = useWarehouseStockSummary(fromId || null)

  function handleClose() {
    setOpen(false)
    setFromId('')
    setToId('')
    setRows([{ brand_variant_id: '', qty: '' }])
    setNotes('')
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
        // When changing item, reset qty to prevent stale validation state
        if (field === 'brand_variant_id') return { brand_variant_id: value, qty: '' }
        return { ...row, [field]: value }
      }),
    )
  }

  // If the user has already selected items, prompt before clearing them
  function handleFromChange(id: string) {
    const hasWork = rows.some((r) => r.brand_variant_id)
    if (hasWork) {
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

  // Per-row validation
  const rowErrors = useMemo(
    () =>
      rows.map((row) => {
        if (!row.brand_variant_id || !row.qty) return null
        const requested = parseFloat(row.qty)
        if (isNaN(requested) || requested <= 0) return null
        const available = availableQtyMap?.get(row.brand_variant_id) ?? 0
        if (requested > available) {
          return `Only ${available} available in ${fromWh?.name ?? 'source warehouse'}`
        }
        return null
      }),
    [rows, availableQtyMap, fromWh],
  )

  const hasValidationErrors = rowErrors.some((e) => e !== null)
  const hasValidRows = rows.some((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
  const canSubmit    = !!fromId && !!toId && hasValidRows && !hasValidationErrors

  async function handleSubmit() {
    if (!fromId || !toId) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      // Use DB sequence to guarantee unique transfer numbers across concurrent users
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: transferNumber, error: seqError } = await (supabase as any)
        .rpc('generate_transfer_number')
      if (seqError) throw seqError

      const validRows = rows
        .filter((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
        .map((r) => {
          const item = sourceStock.find((s) => s.brand_variant_id === r.brand_variant_id)
          return {
            brand_variant_id: r.brand_variant_id,
            item_name:        item?.item_name ?? '',
            sku:              item?.sku       ?? null,
            qty:              parseFloat(r.qty),
            unit_cost:        item?.avg_cost  ?? 0,
          }
        })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('warehouse_transfers').insert({
        transfer_number:     transferNumber,
        from_warehouse_id:   fromId,
        to_warehouse_id:     toId,
        from_warehouse_name: fromWh?.name ?? '',
        to_warehouse_name:   toWh?.name   ?? '',
        status:              'pending_approval',
        date:                new Date().toISOString().split('T')[0],
        created_by_name:     currentProfile?.full_name ?? currentProfile?.email ?? '',
        items:               validRows,
        notes:               notes || null,
      })
      if (error) throw error

      qc.invalidateQueries({ queryKey: ['warehouse_transfers'] })
      toast.success(`Transfer submitted — awaiting approval from ${managerName}`)
      handleClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>

      {/* Confirm before clearing selected items when source warehouse changes */}
      <AlertDialog open={!!pendingFromId} onOpenChange={(o) => !o && setPendingFromId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change source warehouse?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the source warehouse will clear all selected items. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFromId(null)}>Keep current</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFromChange}>Change warehouse</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Create Stock Transfer
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* From / To */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From Warehouse *</Label>
                <Select value={fromId} onValueChange={(v) => handleFromChange(v ?? '')}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses
                      .filter((w) => w.id !== toId)
                      .map((wh) => (
                        <SelectItem key={wh.id} value={wh.id} className="text-xs">
                          {wh.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To Warehouse *</Label>
                <Select value={toId} onValueChange={(v) => setToId(v ?? '')}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses
                      .filter((w) => w.id !== fromId)
                      .map((wh) => (
                        <SelectItem key={wh.id} value={wh.id} className="text-xs">
                          {wh.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Approval banner */}
            {showApprovalBanner && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-primary/5 border border-primary/20 text-xs">
                <Bell className="h-3 w-3 text-primary flex-shrink-0" />
                <span>
                  Notification will be sent to <strong>{managerName}</strong> for approval.
                </span>
              </div>
            )}

            {/* Items */}
            <div className="space-y-2">
              <Label className="text-xs">Items</Label>
              {rows.map((row, idx) => {
                const selectedItem = sourceStock.find(
                  (s) => s.brand_variant_id === row.brand_variant_id,
                )
                const available = row.brand_variant_id
                  ? (availableQtyMap?.get(row.brand_variant_id) ?? 0)
                  : null
                const error = rowErrors[idx]

                return (
                  <div
                    key={idx}
                    className={`space-y-1 pl-2 border-l-2 ${error ? 'border-destructive' : 'border-transparent'}`}
                  >
                    <div className="grid grid-cols-[1fr_80px_auto] gap-2 items-start">
                      {/* Item picker */}
                      <Select
                        value={row.brand_variant_id}
                        onValueChange={(v) => updateRow(idx, 'brand_variant_id', v ?? '')}
                        disabled={!fromId}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder={fromId ? 'Select item…' : 'Select source first'} />
                        </SelectTrigger>
                        <SelectContent>
                          {sourceStock.length === 0 ? (
                            <SelectItem value="__empty__" disabled className="text-xs text-muted-foreground">
                              No stock in this warehouse
                            </SelectItem>
                          ) : (
                            sourceStock.map((s) => (
                              <SelectItem
                                key={s.brand_variant_id}
                                value={s.brand_variant_id}
                                className="text-xs"
                              >
                                {s.item_name}{s.sku ? ` · ${s.sku}` : ''}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>

                      {/* Qty input */}
                      <Input
                        type="number"
                        className={`h-7 text-xs ${error ? 'border-destructive' : ''}`}
                        placeholder="Qty"
                        min="0"
                        value={row.qty}
                        onChange={(e) => updateRow(idx, 'qty', e.target.value)}
                        disabled={!row.brand_variant_id}
                      />

                      {/* Remove button */}
                      {rows.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => removeRow(idx)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      ) : (
                        <div className="w-7" />
                      )}
                    </div>

                    {/* Helper / error text row */}
                    <div className="flex items-center justify-between pl-0.5">
                      <div>
                        {error ? (
                          <p className="text-[10px] text-destructive">{error}</p>
                        ) : available !== null ? (
                          <p className="text-[10px] text-muted-foreground">
                            Available: {available} {selectedItem?.unit ?? ''}
                          </p>
                        ) : null}
                      </div>
                      {selectedItem && (
                        <p className="text-[10px] text-muted-foreground">{selectedItem.unit}</p>
                      )}
                    </div>
                  </div>
                )
              })}

              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={addRow} disabled={!fromId}>
                <Plus className="h-3 w-3" /> Add Item
              </Button>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder="Optional notes…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>
              Cancel
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      className="text-xs"
                      disabled={!canSubmit || submitting}
                      onClick={handleSubmit}
                    >
                      {submitting ? 'Creating…' : 'Create Transfer'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {hasValidationErrors && (
                  <TooltipContent side="top" className="text-xs">
                    Fix quantities above before transferring
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
