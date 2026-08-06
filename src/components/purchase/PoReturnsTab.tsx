'use client'

import { useState, useMemo, useEffect } from 'react'
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
import { useCreatePurchaseReturn, useUpdatePOReturnStatus, useCreateDebitNoteForReturn, useReceivalItemsForPo, type POReturn, type POReturnStatus, type ReceivalItemForReturn } from '@/hooks/usePurchaseReturns'
import { useReturnLineSources } from '@/hooks/useReturnLineSources'
import { ReturnLineSourceBadges } from '@/components/shared/ReturnLineSourceBadges'
import { useReturnReasons } from '@/hooks/useReturnReasons'
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
}

type ReturnRow = ReceivalItemForReturn & {
  qty:              number
  condition:        'defective' | 'damaged' | 'other'
  condition_notes:  string | null
}

export function PoReturnsTab({ po, poReturns }: PoReturnsTabProps) {
  const [returnCreateOpen, setReturnCreateOpen] = useState(false)
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0])
  const [returnReason, setReturnReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnItems, setReturnItems] = useState<ReturnRow[]>([])
  const [expandedReturnId, setExpandedReturnId] = useState<string | null>(null)

  const createPOReturn = useCreatePurchaseReturn()
  const updatePOReturnStatus = useUpdatePOReturnStatus()
  const createDebitNote = useCreateDebitNoteForReturn()
  const { data: reasons = [] } = useReturnReasons('po_return')
  const { data: candidates } = useReceivalItemsForPo(po.id)

  const availableCandidates = useMemo(
    () => (candidates ?? []).filter((c) => c.returnable_qty > 0),
    [candidates]
  )

  // Resolve receival + sub-container labels for every line across all shown
  // returns, so the expanded view can display source badges without spawning
  // a query per row.
  const allReceivalItemIds = useMemo(() => {
    const set = new Set<string>()
    for (const ret of poReturns) {
      for (const line of (ret.return_lines ?? [])) {
        if ((line as { receival_item_id?: string | null }).receival_item_id) {
          set.add((line as { receival_item_id: string }).receival_item_id)
        }
      }
    }
    return Array.from(set)
  }, [poReturns])
  const { data: sourceMaps } = useReturnLineSources(allReceivalItemIds, [])

  // Sync editable rows to available candidates. Guard against no-op updates:
  // TanStack Query can hand back a fresh array reference on refetch while the
  // underlying receival_item_id set is unchanged, which would otherwise loop.
  useEffect(() => {
    if (!returnCreateOpen) return
    setReturnItems((prev) => {
      const nextIds = availableCandidates.map((c) => c.receival_item_id)
      const sameShape =
        prev.length === nextIds.length &&
        prev.every((row, i) => row.receival_item_id === nextIds[i])
      if (sameShape) return prev
      const prevByKey = new Map(prev.map((r) => [r.receival_item_id, r]))
      return availableCandidates.map((c) => {
        const existing = prevByKey.get(c.receival_item_id)
        return {
          ...c,
          qty:              existing?.qty ?? 0,
          condition:        existing?.condition ?? 'defective',
          condition_notes:  existing?.condition_notes ?? null,
        }
      })
    })
  }, [returnCreateOpen, availableCandidates])

  function openCreateReturn() {
    setReturnItems(
      availableCandidates.map((c) => ({
        ...c,
        qty:              0,
        condition:        'defective' as const,
        condition_notes:  null,
      }))
    )
    setReturnDate(new Date().toISOString().split('T')[0])
    setReturnReason('')
    setCustomReason('')
    setReturnNotes('')
    setReturnCreateOpen(true)
  }

  function handleCreatePOReturn() {
    const resolvedReason = returnReason === '__custom__' ? customReason.trim() : returnReason
    if (!resolvedReason) { toast.error('Reason is required'); return }
    const items = returnItems.filter((i) => i.qty > 0)
    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }
    if (items.some((i) => i.qty > i.returnable_qty)) { toast.error('One or more quantities exceed the returnable amount'); return }

    const warehousesInUse = Array.from(new Set(items.map((i) => i.warehouse_id)))
    if (warehousesInUse.length > 1) {
      toast.error('All lines in a single return must come from the same warehouse. Split into separate returns.')
      return
    }

    createPOReturn.mutate(
      {
        source_id: po.id,
        date: returnDate,
        reason: resolvedReason,
        items: items.map((i) => ({
          receival_item_id: i.receival_item_id,
          item_name:        i.item_name,
          sku:              i.sku,
          qty:              i.qty,
          brand_variant_id: i.brand_variant_id,
          condition:        i.condition,
          condition_notes:  i.condition_notes,
        })),
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
          disabled={availableCandidates.length === 0}
          title={availableCandidates.length === 0 ? 'Nothing left to return — every receival for this PO is fully returned.' : undefined}
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
                {ret.date} · {(ret.return_lines ?? []).length} item(s) · {ret.reason}
                {ret.source_receival_numbers && ret.source_receival_numbers.length > 0 && (
                  <> · <span className="font-mono">from {ret.source_receival_numbers.join(', ')}</span></>
                )}
              </div>
              {ret.debit_note ? (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Debit Note:</span>
                  <span className="text-xs font-mono font-medium">{ret.debit_note.debit_note_id}</span>
                  <CreditDebitNoteDownloadButton
                    note={ret.debit_note}
                    noteKind="debit"
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
                        <TableHead className="text-xs">Source</TableHead>
                        <TableHead className="text-xs text-right">Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(ret.return_lines ?? []).map((item, idx) => {
                        const rlid = (item as { receival_item_id?: string | null }).receival_item_id ?? null
                        const info = rlid ? sourceMaps?.receival.get(rlid) : undefined
                        return (
                          <TableRow key={idx}>
                            <TableCell className="text-xs">{item.item_name}{item.sku ? ` · ${item.sku}` : ''}</TableCell>
                            <TableCell><ReturnLineSourceBadges info={info} /></TableCell>
                            <TableCell className="text-xs text-right">{item.qty}</TableCell>
                          </TableRow>
                        )
                      })}
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
            <div className="space-y-1">
              <Label htmlFor="por-date">Return Date *</Label>
              <Input id="por-date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="por-reason">Reason *</Label>
              <Select value={returnReason} onValueChange={(v) => { setReturnReason(v ?? ''); if (v !== '__custom__') setCustomReason('') }}>
                <SelectTrigger id="por-reason" className="h-9 text-xs">
                  <SelectValue placeholder="Select reason…" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {reasons.map((r) => (
                    <SelectItem key={r.id} value={r.label} className="text-xs">{r.label}</SelectItem>
                  ))}
                  <SelectItem value="__custom__" className="text-xs">Other (custom reason)…</SelectItem>
                </SelectContent>
              </Select>
              {returnReason === '__custom__' && (
                <Input
                  autoFocus
                  className="mt-1.5"
                  placeholder="Enter custom reason…"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                />
              )}
            </div>
            {returnItems.length === 0 ? (
              <p className="text-xs text-muted-foreground bg-muted/40 border rounded p-3">
                Nothing left to return — every receival for this PO is fully returned.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Items to Return</Label>
                  <span className="text-[10px] text-muted-foreground">One row per receival • pick qty per source</span>
                </div>
                {returnItems.map((item, idx) => (
                  <div key={item.receival_item_id} className="rounded-md border p-2 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.item_name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">
                            {item.receival_number}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {item.warehouse_name}
                          </Badge>
                          {item.sub_container_name && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                              {item.sub_container_name}
                            </Badge>
                          )}
                          {item.sku && (
                            <span className="text-[10px] text-muted-foreground">SKU {item.sku}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Received {item.received_at.split('T')[0]} · Returnable: <span className="font-medium text-foreground">{item.returnable_qty}</span>
                          {item.already_returned_qty > 0 && ` · Prior returned: ${item.already_returned_qty}`}
                        </div>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max={item.returnable_qty}
                        value={item.qty}
                        onChange={(e) => {
                          const updated = [...returnItems]
                          const parsed = Number(e.target.value)
                          updated[idx] = { ...updated[idx], qty: Math.min(item.returnable_qty, Math.max(0, Number.isFinite(parsed) ? parsed : 0)) }
                          setReturnItems(updated)
                        }}
                        className="w-20 text-right"
                      />
                    </div>
                    {item.qty > 0 && (
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
                    )}
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
