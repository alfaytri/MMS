'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Package, Truck, Calendar, Building2 } from 'lucide-react'
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { GuardedDialog, type GuardedFormDialogHandle } from '@/components/shared/GuardedFormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateBill, persistBillAttachments } from '@/hooks/useSupplierBills'
import { usePurchaseOrders, usePurchaseOrder, usePOReceivalsByPO } from '@/hooks/usePurchaseOrders'
import { formatCurrency } from '@/lib/utils/formatters'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { BillAttachmentPicker, type BillAttachmentPickerHandle, type BillAttachmentUpload } from './BillAttachmentPicker'

type BillLine = {
  po_line_item_id: string
  item_name: string
  brand: string | null
  category: string | null
  sku: string | null
  brand_variant_id: string | null
  ordered_qty: number
  received_qty: number
  bill_qty: number
  unit_price: number
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialPoId?: string
}

export function BillFormDialog({ open, onOpenChange, initialPoId }: Props) {
  const createBill = useCreateBill()
  const { data: orders } = usePurchaseOrders({})

  const [selectedPoId, setSelectedPoId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<BillLine[]>([])
  const [showReceival, setShowReceival] = useState(false)
  const [saving, setSaving] = useState(false)
  const [attachments, setAttachments] = useState<BillAttachmentUpload[]>([])
  const guardRef = useRef<GuardedFormDialogHandle>(null)
  const attachRef = useRef<BillAttachmentPickerHandle>(null)
  // Marks that uploads are persisted onto a bill — handleOpenChange must
  // not sweep the storage objects on the subsequent close.
  const submittedRef = useRef(false)

  const { data: selectedPO } = usePurchaseOrder(selectedPoId || null)
  const { data: receivals } = usePOReceivalsByPO(selectedPoId || null)

  useEffect(() => {
    if (open && initialPoId) setSelectedPoId(initialPoId)
  }, [open, initialPoId])

  useEffect(() => {
    if (!selectedPO) { setLines([]); return }
    const items = selectedPO.po_line_items ?? []
    setLines(items.map((li) => {
      const brand = li.inventory_item_brand_variants?.brand ?? null
      const category = li.inventory_item_brand_variants?.inventory_items?.inventory_categories?.name_en ?? null
      const invName = li.inventory_item_brand_variants?.inventory_items?.name_en ?? null
      return {
        po_line_item_id: li.id,
        item_name: li.item_name || invName || '(No name)',
        brand,
        category,
        sku: li.sku ?? null,
        brand_variant_id: li.brand_variant_id ?? null,
        ordered_qty: li.qty,
        received_qty: li.received_qty ?? 0,
        bill_qty: li.qty,
        unit_price: li.unit_price,
      }
    }))
  }, [selectedPoId, selectedPO])

  function updateLine(idx: number, patch: Partial<BillLine>) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function fillFromReceived() {
    setLines((prev) => prev.map((l) => ({ ...l, bill_qty: l.received_qty })))
  }

  const subtotal = lines.reduce((s, l) => s + l.bill_qty * l.unit_price, 0)
  const canSubmit = !!selectedPoId && !!dueDate && lines.length > 0 && lines.every((l) => l.bill_qty >= 0)

  // Dirty as soon as the operator has touched any field. When invoked from
  // a PO surface (`initialPoId` set), the PO is pre-selected and doesn't
  // count as engagement on its own.
  const isDirty =
    (!initialPoId && selectedPoId !== '') ||
    dueDate !== '' ||
    reference !== '' ||
    notes !== '' ||
    attachments.length > 0 ||
    lines.some((l, i) => {
      const original = selectedPO?.po_line_items?.[i]
      if (!original) return false
      return l.bill_qty !== original.qty || l.unit_price !== original.unit_price
    })

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Sweep only when closing WITHOUT a successful submit.
      if (!submittedRef.current && attachments.length > 0) {
        void attachRef.current?.sweep()
      }
      submittedRef.current = false
      if (!initialPoId) setSelectedPoId('')
      setDueDate(''); setReference(''); setNotes('')
      setLines([]); setShowReceival(false); setAttachments([])
    }
    onOpenChange(next)
  }

  async function submit() {
    if (!selectedPO || !canSubmit) return
    setSaving(true)
    try {
      const newBill = await createBill.mutateAsync({
        supplier_id:       selectedPO.supplier_id,
        purchase_order_id: selectedPoId,
        po_number:         selectedPO.po_number,
        discount_amount:   selectedPO.discount_amount ?? 0,
        discount_label:    selectedPO.discount_label ?? null,
        receival_id:       null,
        due_date:          dueDate,
        source_label:      reference || null,
        notes,
        line_items: lines.filter((l) => l.bill_qty > 0).map((l) => ({
          description:  l.item_name,
          qty:          l.bill_qty,
          unit_price:   l.unit_price,
          total:        l.bill_qty * l.unit_price,
          match_status: 'matched' as const,
          match_note:   null,
          brand_variant_id: l.brand_variant_id,
        })),
      })
      if (attachments.length > 0) {
        try {
          await persistBillAttachments(newBill.id, attachments)
        } catch (err: unknown) {
          toast.error(`Bill saved, but attaching files failed: ${(err as Error).message}`)
        }
      }
      // Mark submitted before closing so handleOpenChange's sweep skips.
      // (setAttachments([]) alone won't work — the close handler runs
      // synchronously with the pre-clear closure.)
      submittedRef.current = true
      toast.success('Bill created successfully')
      guardRef.current?.closeAfterSubmit()
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to create bill')
    } finally {
      setSaving(false)
    }
  }

  // Approved received qty per line
  const receivedMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of (receivals ?? []).filter((r) => r.status === 'approved')) {
      for (const ri of r.receival_items ?? []) {
        if (!ri.is_free && ri.po_line_item_id) {
          map.set(ri.po_line_item_id, (map.get(ri.po_line_item_id) ?? 0) + ri.qty_received)
        }
      }
    }
    return map
  }, [receivals])

  return (
    <GuardedDialog open={open} onOpenChange={handleOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[56rem] sm:h-[85vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-0 flex-shrink-0">
          <DialogTitle className="text-sm font-semibold">Create Supplier Bill</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3 space-y-4">
          {/* Top selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {!initialPoId ? (
              <div className="space-y-1">
                <Label htmlFor="bill-po" className="text-[11px] text-muted-foreground">Purchase Order *</Label>
                <Select
                  value={selectedPoId}
                  onValueChange={(v) => setSelectedPoId(v ?? '')}
                >
                  <SelectTrigger id="bill-po" className="h-9 text-xs w-full">
                    <SelectValue placeholder="Select PO…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {(orders ?? [])
                      .filter((o) => !['draft', 'cancelled'].includes(o.status))
                      .map((po) => (
                        <SelectItem key={po.id} value={po.id} className="text-xs">
                          {po.po_number} — {po.supplier_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              selectedPO && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Purchase Order</Label>
                  <div className="h-9 text-xs font-medium border rounded-md px-3 flex items-center bg-muted/40 truncate">
                    {selectedPO.po_number}
                  </div>
                </div>
              )
            )}

            <div className="space-y-1">
              <Label htmlFor="bill-due-date" className="text-[11px] text-muted-foreground">Due Date *</Label>
              <Input id="bill-due-date" type="date" className="h-9 text-xs" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="bill-reference" className="text-[11px] text-muted-foreground">Reference / Invoice #</Label>
              <Input
                id="bill-reference"
                className="h-9 text-xs"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Supplier's invoice number"
              />
            </div>
          </div>

          {/* PO context card */}
          {selectedPO && (
            <div className="rounded-lg border bg-muted/20 px-3 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Truck className="h-2.5 w-2.5" /> Supplier
                </div>
                <p className="font-semibold truncate">{selectedPO.supplier_name ?? '—'}</p>
              </div>
              <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="h-2.5 w-2.5" /> Order date
                </div>
                <p className="font-semibold">
                  {selectedPO.created_at ? format(new Date(selectedPO.created_at), 'dd MMM yyyy') : '—'}
                </p>
              </div>
              <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Building2 className="h-2.5 w-2.5" /> Order total
                </div>
                <p className="font-semibold tabular-nums">
                  {formatCurrency(selectedPO.subtotal ?? 0, selectedPO.currency ?? 'QAR')}
                </p>
              </div>
              <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Currency</div>
                <p className="font-semibold">{selectedPO.currency ?? 'QAR'}</p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="bill-notes" className="text-[11px] text-muted-foreground">Notes</Label>
            <Textarea
              id="bill-notes"
              className="text-xs min-h-[52px] resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes…"
            />
          </div>

          {/* Supplier invoice attachments */}
          <div className="rounded-lg border bg-muted/10 px-3 py-3">
            <BillAttachmentPicker
              ref={attachRef}
              uploads={attachments}
              onChange={setAttachments}
              disabled={saving}
            />
          </div>

          {/* Line items */}
          {lines.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-[11px] font-medium">
                  {lines.length} line item{lines.length !== 1 ? 's' : ''} from PO
                </Label>
                <div className="flex items-center gap-1.5">
                  {showReceival && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] gap-1 text-muted-foreground"
                      onClick={fillFromReceived}
                    >
                      <Package className="h-3 w-3" />
                      Fill from received
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn('h-7 text-[11px] gap-1', showReceival && 'bg-primary/10 border-primary/40 text-primary')}
                    onClick={() => setShowReceival((v) => !v)}
                  >
                    {showReceival ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    Receival Info
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {lines.map((line, idx) => {
                  const lineTotal      = line.bill_qty * line.unit_price
                  const approvedReceived = receivedMap.get(line.po_line_item_id) ?? line.received_qty
                  const isMatchOk      = approvedReceived === line.bill_qty
                  return (
                    <div key={line.po_line_item_id} className="rounded-lg border bg-background">
                      {/* Header strip */}
                      <div className="px-3 pt-2.5 pb-1.5 flex flex-wrap items-center gap-1.5">
                        {line.category && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded">
                            {line.category}
                          </span>
                        )}
                        <p className="text-[12px] font-semibold text-foreground truncate">{line.item_name}</p>
                        {line.brand && <span className="text-[10px] text-primary">· {line.brand}</span>}
                        {line.sku && <span className="text-[10px] text-muted-foreground">· {line.sku}</span>}
                        <span className="ml-auto text-[10px] tabular-nums font-medium">
                          {formatCurrency(lineTotal, selectedPO?.currency ?? 'QAR')}
                        </span>
                      </div>

                      {/* Values row */}
                      <div className="px-3 pb-2.5 space-y-1.5">
                        <div className="grid grid-cols-1 sm:grid-cols-[6rem_6rem_6rem_7rem] gap-x-3 text-[9px] text-muted-foreground uppercase tracking-wide">
                          <span>Ordered</span>
                          {showReceival && <span className="text-primary/70">Received</span>}
                          <span className={showReceival ? '' : 'col-start-2'}>Bill qty</span>
                          <span>Unit price</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[6rem_6rem_6rem_7rem] gap-x-3 gap-y-2 items-center">
                          {/* Ordered */}
                          <div className="h-8 flex items-center px-2 text-xs tabular-nums text-muted-foreground">
                            {line.ordered_qty}
                          </div>

                          {/* Received (conditional) */}
                          {showReceival && (
                            <div className={cn(
                              'h-8 flex items-center px-2 text-xs tabular-nums rounded-md border',
                              isMatchOk ? 'bg-success/5 border-success/30 text-success' : 'bg-warning/5 border-warning/30 text-warning'
                            )}>
                              {approvedReceived} / {line.ordered_qty}
                            </div>
                          )}

                          {/* Bill qty */}
                          <Input
                            type="number"
                            min={0}
                            value={line.bill_qty}
                            onChange={(e) => updateLine(idx, { bill_qty: Math.max(0, Number(e.target.value)) })}
                            className="h-8 w-full text-right tabular-nums text-xs"
                          />

                          {/* Unit price */}
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) => updateLine(idx, { unit_price: Math.max(0, Number(e.target.value)) })}
                            className="h-8 w-full text-right tabular-nums text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {selectedPoId && lines.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No line items found on this PO.</p>
          )}

          {!selectedPoId && (
            <div className="rounded-lg border border-dashed py-8 text-center text-muted-foreground">
              <Package className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
              <p className="text-xs">Select a PO to load billable line items</p>
            </div>
          )}
        </div>

        {/* Sticky subtotal strip */}
        {lines.length > 0 && (
          <div className="flex-shrink-0 border-t bg-muted/30 px-5 py-2 flex items-center justify-between text-[11px]">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Subtotal</span>
            <span className="text-sm font-bold tabular-nums">
              {formatCurrency(subtotal, selectedPO?.currency ?? 'QAR')}
            </span>
          </div>
        )}

        <DialogFooter className="m-0 px-5 py-3 border-t bg-background rounded-b-lg">
          <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
          <Button
            size="sm"
            className="text-[11px] h-8"
            onClick={submit}
            disabled={saving || !canSubmit}
          >
            {saving ? 'Creating…' : 'Create Bill'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
