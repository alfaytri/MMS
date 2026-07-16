'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CreditDebitNoteDetailDialog } from '@/components/sales/CreditDebitNoteDetailDialog'
import type { CreditNote } from '@/hooks/useCreditNotes'
import { useCreateSaleReturn, useUpdateReturnStatus, useCreateCreditNoteForReturn, useAssignWarehouseAndRestock, type SaleReturn } from '@/hooks/useSaleReturns'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useReturnReasons, useAddReturnReason } from '@/hooks/useReturnReasons'
import type { SaleOrder } from '@/hooks/useSaleOrders'
import { formatDate } from '@/lib/utils/formatters'

interface SoReturnsTabProps {
  so: SaleOrder
  fullSO: SaleOrder | null
  soReturns: SaleReturn[]
  invoiceId?: string
  onSendReplacement?: (ret: SaleReturn) => void
}

export function SoReturnsTab({ so, fullSO, soReturns, invoiceId, onSendReplacement }: SoReturnsTabProps) {
  const [returnOpen, setReturnOpen] = useState(false)
  const [cnDetailNote, setCnDetailNote] = useState<CreditNote | null>(null)
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10))
  const [returnReason, setReturnReason] = useState('')
  const [returnWarehouseId, setReturnWarehouseId] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnItems, setReturnItems] = useState<{ item_name: string; sku: string | null; qty: number; condition: 'good' | 'damaged'; brand_variant_id: string | null }[]>([])
  const [restockPickerReturnId, setRestockPickerReturnId] = useState<string | null>(null)
  const [restockWarehouseId, setRestockWarehouseId] = useState('')
  const [customReason, setCustomReason] = useState('')

  const createReturn = useCreateSaleReturn()
  const updateReturnStatus = useUpdateReturnStatus()
  const createCreditNote = useCreateCreditNoteForReturn()
  const assignAndRestock = useAssignWarehouseAndRestock()
  const addReason = useAddReturnReason()
  const { data: warehouses = [] } = useWarehouses()
  const { data: reasons = [] } = useReturnReasons('sale_return')

  const canCreateReturn = ['delivered', 'partial_delivery', 'invoiced', 'closed'].includes(so.status)

  return (
    <div className="space-y-3">
      {canCreateReturn && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => {
            setReturnItems((fullSO?.sale_order_lines ?? []).map((li) => ({
              item_name: li.item_name,
              sku: li.sku ?? null,
              qty: li.qty,
              condition: 'good' as const,
              brand_variant_id: li.brand_variant_id ?? null,
            })))
            setReturnOpen(true)
          }}>
            + Create Return
          </Button>
        </div>
      )}
      {soReturns.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No returns for this order</p>
      ) : (
        soReturns.map((ret) => {
          const nextStatus: Record<string, SaleReturn['status']> = {
            pending:  'received',
            received: 'restocked',
          }
          const nextLabel: Record<string, string> = {
            pending:  'Mark Received',
            received: 'Mark Restocked',
          }
          const canAdvance = ret.status === 'pending' || ret.status === 'received'
          const needsCreditNote = !ret.credit_note_id &&
            (ret.status === 'restocked' || ret.status === 'closed')

          return (
            <div key={ret.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium">{ret.return_number}</span>
                <div className="flex items-center gap-2">
                  {canAdvance && (
                    ret.status === 'received' && !ret.restock_warehouse_id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setRestockPickerReturnId(ret.id); setRestockWarehouseId('') }}
                      >
                        Assign Warehouse & Restock
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={updateReturnStatus.isPending}
                        onClick={() =>
                          updateReturnStatus.mutate(
                            { id: ret.id, status: nextStatus[ret.status] },
                            { onSuccess: () => toast.success(`${ret.return_number} marked ${nextStatus[ret.status]}`) }
                          )
                        }
                      >
                        {updateReturnStatus.isPending ? '…' : nextLabel[ret.status]}
                      </Button>
                    )
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                    ret.status === 'restocked' ? 'bg-green-100 text-green-700' :
                    ret.status === 'received'  ? 'bg-blue-100 text-blue-700' :
                    ret.status === 'closed'    ? 'bg-muted text-muted-foreground' :
                                                  'bg-amber-100 text-amber-700'
                  }`}>{ret.status}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{formatDate(ret.date)} · {ret.reason}</p>

              <div className="rounded border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Item</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs">Condition</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ret.return_lines ?? []).map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{item.item_name}</TableCell>
                        <TableCell className="text-xs text-right">{item.qty}</TableCell>
                        <TableCell className="text-xs">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            item.condition === 'good' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>{item.condition}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {ret.notes && <p className="text-xs text-muted-foreground italic">{ret.notes}</p>}

              {needsCreditNote ? (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">No credit note yet.</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={createCreditNote.isPending}
                    onClick={() =>
                      createCreditNote.mutate(ret, {
                        onSuccess: () => toast.success(`Credit note created for ${ret.return_number}`),
                        onError: () => toast.error('Failed to create credit note'),
                      })
                    }
                  >
                    {createCreditNote.isPending ? 'Creating…' : 'Create Credit Note'}
                  </Button>
                </div>
              ) : ret.credit_note ? (
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">Credit note:</span>
                  <button
                    type="button"
                    className="font-mono text-xs font-medium text-primary hover:underline underline-offset-2"
                    onClick={() => setCnDetailNote(ret.credit_note!)}
                  >
                    {ret.credit_note.credit_note_id}
                  </button>
                  {onSendReplacement && !ret.credit_note.resolution_type && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs ml-2"
                      onClick={() => onSendReplacement(ret)}
                    >
                      Send Replacement
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          )
        })
      )}

      <CreditDebitNoteDetailDialog
        note={cnDetailNote}
        referenceNumber={invoiceId ?? '—'}
        open={!!cnDetailNote}
        onOpenChange={(v) => { if (!v) setCnDetailNote(null) }}
      />

      {/* Assign Warehouse & Restock Dialog */}
      {restockPickerReturnId && (
        <Dialog open onOpenChange={(o) => { if (!o) setRestockPickerReturnId(null) }}>
          <DialogContent className="w-full max-w-full rounded-none sm:max-w-sm sm:rounded-lg">
            <DialogHeader>
              <DialogTitle>Assign Warehouse & Restock</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                This return was created with "Inspect first". Select a warehouse to restock the items into.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Restock Warehouse <span className="text-destructive">*</span></label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={restockWarehouseId}
                  onChange={(e) => setRestockWarehouseId(e.target.value)}
                >
                  <option value="">Select warehouse…</option>
                  {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setRestockPickerReturnId(null)}>Cancel</Button>
              <Button
                size="sm"
                disabled={!restockWarehouseId || assignAndRestock.isPending}
                onClick={() => {
                  const retNum = soReturns.find((r) => r.id === restockPickerReturnId)?.return_number ?? ''
                  assignAndRestock.mutate(
                    { id: restockPickerReturnId!, warehouseId: restockWarehouseId },
                    {
                      onSuccess: () => { toast.success(`${retNum} restocked`); setRestockPickerReturnId(null) },
                      onError: (err) => toast.error((err as Error).message),
                    }
                  )
                }}
              >
                {assignAndRestock.isPending ? 'Processing…' : 'Restock'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Return Dialog */}
      {returnOpen && so && (
        <Dialog open onOpenChange={(o) => { if (!o) { setReturnOpen(false); setReturnReason(''); setCustomReason(''); setReturnNotes(''); setReturnWarehouseId('') } }}>
          <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Create Return — {so.so_number}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Return Date</label>
                  <input
                    type="date"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Restock Warehouse</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={returnWarehouseId}
                    onChange={(e) => setReturnWarehouseId(e.target.value)}
                  >
                    <option value="">None / Inspect first</option>
                    {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reason <span className="text-destructive">*</span></label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={returnReason}
                  onChange={(e) => { setReturnReason(e.target.value); if (e.target.value !== '__custom__') setCustomReason('') }}
                >
                  <option value="">Select reason…</option>
                  {reasons.map((r) => <option key={r.id} value={r.label}>{r.label}</option>)}
                  <option value="__custom__">Other (custom reason)…</option>
                </select>
                {returnReason === '__custom__' && (
                  <input
                    type="text"
                    placeholder="Enter custom reason…"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring mt-1.5"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    autoFocus
                  />
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Items</label>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Item</TableHead>
                        <TableHead className="text-xs text-right w-20">Qty</TableHead>
                        {returnWarehouseId && <TableHead className="text-xs w-28">Condition</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returnItems.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-medium">{item.item_name}</TableCell>
                          <TableCell className="text-right">
                            <input
                              type="number" min={0}
                              className="w-16 h-7 text-xs text-right rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                              value={item.qty}
                              onChange={(e) => setReturnItems((prev) => prev.map((it, j) => j === i ? { ...it, qty: Number(e.target.value) } : it))}
                            />
                          </TableCell>
                          {returnWarehouseId && (
                            <TableCell>
                              <select
                                className="h-7 text-xs rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring"
                                value={item.condition}
                                onChange={(e) => setReturnItems((prev) => prev.map((it, j) => j === i ? { ...it, condition: e.target.value as 'good' | 'damaged' } : it))}
                              >
                                <option value="good">Good</option>
                                <option value="damaged">Damaged</option>
                              </select>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {!returnWarehouseId && (
                  <p className="text-[11px] text-muted-foreground">Condition will be set during inspection.</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</label>
                <textarea
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Optional notes…"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setReturnOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                disabled={
                  (returnReason === '__custom__' ? !customReason.trim() : !returnReason.trim()) ||
                  createReturn.isPending || addReason.isPending ||
                  returnItems.every((it) => it.qty === 0)
                }
                onClick={async () => {
                  let finalReason = returnReason
                  if (returnReason === '__custom__') {
                    finalReason = customReason.trim()
                    if (!finalReason) return
                    addReason.mutate({ label: finalReason, category: 'sale_return' })
                  }
                  createReturn.mutate(
                    {
                      source_id: so.id,
                      date: returnDate,
                      reason: finalReason,
                      items: returnItems.filter((it) => it.qty > 0),
                      restock_warehouse_id: returnWarehouseId || null,
                      notes: returnNotes || null,
                    },
                    {
                      onSuccess: () => { toast.success('Return created'); setReturnOpen(false); setReturnReason(''); setCustomReason(''); setReturnNotes(''); setReturnWarehouseId('') },
                      onError: (err) => toast.error((err as Error).message),
                    }
                  )
                }}
              >
                {(createReturn.isPending || addReason.isPending) ? 'Creating…' : 'Create Return'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
