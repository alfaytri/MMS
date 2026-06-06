'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CreditDebitNoteDownloadButton } from '@/components/sales/CreditDebitNoteDownloadButton'
import { useCreatePurchaseReturn, useUpdatePOReturnStatus, useCreateDebitNoteForReturn, type POReturn, type POReturnItem, type POReturnStatus } from '@/hooks/usePurchaseReturns'
import { useWarehouses } from '@/hooks/useWarehouses'
import type { PurchaseOrder } from '@/hooks/usePurchaseOrders'
import { cn } from '@/lib/utils'

const PO_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:            { label: 'Pending',            className: 'border-warning text-warning' },
  dispatched:         { label: 'Dispatched',         className: 'border-blue-500 text-blue-500' },
  supplier_confirmed: { label: 'Supplier Confirmed', className: 'border-success text-success' },
  closed:             { label: 'Closed',             className: 'border-muted-foreground/50 text-muted-foreground' },
  cancelled:          { label: 'Cancelled',          className: 'border-muted-foreground/30 text-muted-foreground/60' },
}
const PO_STATUS_NEXT: Partial<Record<string, string>> = {
  pending:            'dispatched',
  dispatched:         'supplier_confirmed',
  supplier_confirmed: 'closed',
}
const PO_STATUS_LABEL: Record<string, string> = {
  dispatched:         'Mark Dispatched',
  supplier_confirmed: 'Confirm Supplier Receipt',
  closed:             'Close Return',
}

interface PoReturnsTabProps {
  po: PurchaseOrder
  poReturns: POReturn[]
  receivals: Array<{ warehouse_id?: string; created_at: string }> | undefined
}

export function PoReturnsTab({ po, poReturns, receivals }: PoReturnsTabProps) {
  const [returnCreateOpen, setReturnCreateOpen] = useState(false)
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0])
  const [returnReason, setReturnReason] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnWarehouseId, setReturnWarehouseId] = useState('')
  const [returnItems, setReturnItems] = useState<(POReturnItem & { _max: number })[]>([])
  const [expandedReturnId, setExpandedReturnId] = useState<string | null>(null)

  const createPOReturn = useCreatePurchaseReturn()
  const updatePOReturnStatus = useUpdatePOReturnStatus()
  const createDebitNote = useCreateDebitNoteForReturn()
  const { data: warehouses = [] } = useWarehouses()

  function openCreateReturn() {
    const receivedLines = (po.po_line_items ?? []).filter((li) => li.received_qty > 0)
    setReturnItems(
      receivedLines.map((li) => ({
        item_name: li.item_name,
        sku: li.sku ?? null,
        qty: 0,
        brand_variant_id: li.brand_variant_id ?? null,
        condition: 'defective' as const,
        condition_notes: null,
        _max: li.received_qty,
      }))
    )
    const latestReceival = (receivals ?? []).slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
    setReturnWarehouseId(latestReceival?.warehouse_id ?? '')
    setReturnDate(new Date().toISOString().split('T')[0])
    setReturnReason('')
    setReturnNotes('')
    setReturnCreateOpen(true)
  }

  function handleCreatePOReturn() {
    if (!returnReason) { toast.error('Reason is required'); return }
    const items = returnItems.filter((i) => i.qty > 0)
    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }
    if (items.some((i) => i.qty > i._max)) { toast.error('One or more quantities exceed the received amount'); return }
    createPOReturn.mutate(
      {
        source_id: po.id,
        date: returnDate,
        reason: returnReason,
        items: items.map(({ item_name, sku, qty, brand_variant_id, condition, condition_notes }) => ({ item_name, sku, qty, brand_variant_id, condition, condition_notes })),
        restock_warehouse_id: returnWarehouseId || null,
        notes: returnNotes || null,
      },
      {
        onSuccess: () => { toast.success('Return created'); setReturnCreateOpen(false) },
        onError: (err: Error) => toast.error(err.message),
      }
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={(po.po_line_items ?? []).every((li) => li.received_qty === 0)}
          title={(po.po_line_items ?? []).every((li) => li.received_qty === 0) ? 'No items received yet' : undefined}
          onClick={openCreateReturn}
        >
          + Create Return
        </Button>
      </div>

      {poReturns.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No returns for this order</p>
      ) : (
        poReturns.map((ret) => {
          const cfg = PO_STATUS_CONFIG[ret.status] ?? PO_STATUS_CONFIG.pending
          const next = PO_STATUS_NEXT[ret.status]
          const canCancel = ret.status === 'pending' || ret.status === 'dispatched'
          return (
            <div key={ret.id} className="rounded-md border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="font-mono font-semibold text-sm hover:underline"
                    onClick={() => setExpandedReturnId(expandedReturnId === ret.id ? null : ret.id)}
                  >
                    {ret.return_number}
                  </button>
                  <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {next && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatePOReturnStatus.isPending}
                      onClick={() => updatePOReturnStatus.mutate(
                        { id: ret.id, status: next as POReturnStatus, sourceId: po.id },
                        { onSuccess: () => toast.success(PO_STATUS_LABEL[next] ?? next), onError: (e: Error) => toast.error(e.message) }
                      )}
                    >
                      {PO_STATUS_LABEL[next]}
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={updatePOReturnStatus.isPending}
                      onClick={() => updatePOReturnStatus.mutate(
                        { id: ret.id, status: 'cancelled', sourceId: po.id },
                        { onSuccess: () => toast.success('Return cancelled'), onError: (e: Error) => toast.error(e.message) }
                      )}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {ret.date} · {ret.items.length} item(s) · {ret.reason}
              </div>
              {ret.debit_note ? (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Debit Note:</span>
                  <span className="text-xs font-mono font-medium">{ret.debit_note.credit_note_id}</span>
                  <CreditDebitNoteDownloadButton
                    note={ret.debit_note}
                    referenceNumber={po.po_number ?? '—'}
                    returnNumber={ret.return_number}
                  />
                </div>
              ) : (ret.status === 'supplier_confirmed' || ret.status === 'closed') ? (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">No debit note yet.</span>
                  <button
                    type="button"
                    className="text-xs text-primary underline underline-offset-2 disabled:opacity-50"
                    disabled={createDebitNote.isPending}
                    onClick={() => createDebitNote.mutate(ret, {
                      onSuccess: () => toast.success('Debit note created'),
                      onError: (e: Error) => toast.error(e.message),
                    })}
                  >
                    {createDebitNote.isPending ? 'Creating…' : 'Create Debit Note'}
                  </button>
                </div>
              ) : null}
              {expandedReturnId === ret.id && (
                <div className="rounded-md border overflow-x-auto mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Item</TableHead>
                        <TableHead className="text-xs text-right">Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ret.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">{item.item_name}{item.sku ? ` · ${item.sku}` : ''}</TableCell>
                          <TableCell className="text-xs text-right">{item.qty}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )
        })
      )}

      {/* Create Return Dialog */}
      <Dialog open={returnCreateOpen} onOpenChange={(o) => { if (!o) setReturnCreateOpen(false) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Create PO Return</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="por-date">Return Date *</Label>
                <Input id="por-date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Dispatch From Warehouse</Label>
                <Select value={returnWarehouseId} onValueChange={(v) => setReturnWarehouseId(v ?? '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse…" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="por-reason">Reason *</Label>
              <Input id="por-reason" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="e.g. Wrong item, damaged on arrival…" />
            </div>
            {returnItems.length > 0 && (
              <div className="space-y-2">
                <Label>Items to Return</Label>
                {returnItems.filter((i) => i.qty > 0 && !i.brand_variant_id && !i.sku).length > 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    Some items are not linked to inventory — stock will not be deducted for those items when dispatched.
                  </p>
                )}
                {returnItems.map((item, idx) => (
                  <div key={idx} className="rounded-md border p-2 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.item_name}</div>
                        {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                        <div className="text-xs text-muted-foreground">Max returnable: {item._max}</div>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max={item._max}
                        value={item.qty}
                        onChange={(e) => {
                          const updated = [...returnItems]
                          updated[idx] = { ...updated[idx], qty: Math.min(item._max, Math.max(0, Number(e.target.value))) }
                          setReturnItems(updated)
                        }}
                        className="w-20 text-right"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={item.condition}
                        onChange={(e) => {
                          const updated = [...returnItems]
                          updated[idx] = { ...updated[idx], condition: e.target.value as 'defective' | 'damaged' | 'other', condition_notes: null }
                          setReturnItems(updated)
                        }}
                        className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs"
                      >
                        <option value="defective">Defective</option>
                        <option value="damaged">Damaged</option>
                        <option value="other">Other</option>
                      </select>
                      {item.condition === 'other' && (
                        <Input
                          placeholder="Describe reason…"
                          value={item.condition_notes ?? ''}
                          onChange={(e) => {
                            const updated = [...returnItems]
                            updated[idx] = { ...updated[idx], condition_notes: e.target.value }
                            setReturnItems(updated)
                          }}
                          className="flex-1 h-8 text-xs"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="por-notes">Notes</Label>
              <Textarea id="por-notes" value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setReturnCreateOpen(false)} disabled={createPOReturn.isPending}>Cancel</Button>
            <Button onClick={handleCreatePOReturn} disabled={createPOReturn.isPending}>
              {createPOReturn.isPending ? 'Creating…' : 'Create Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
