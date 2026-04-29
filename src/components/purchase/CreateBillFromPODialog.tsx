'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useCreateBill } from '@/hooks/useSupplierBills'
import { usePurchaseOrder, usePOReceivalsByPO } from '@/hooks/usePurchaseOrders'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

type BillLine = {
  po_line_item_id: string
  item_name: string
  sku: string | null
  ordered_qty: number
  received_qty: number
  bill_qty: number
  unit_price: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  poId: string
}

export function CreateBillFromPODialog({ open, onOpenChange, poId }: Props) {
  const router = useRouter()
  const createBill = useCreateBill()
  const { data: po, isLoading: poLoading } = usePurchaseOrder(open ? poId : null)
  const { data: receivals } = usePOReceivalsByPO(open ? poId : null)

  const [dueDate, setDueDate] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<BillLine[]>([])
  const [showReceival, setShowReceival] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      setDueDate('')
      setReference('')
      setNotes('')
      setLines([])
      setShowReceival(false)
      return
    }
    if (!po) { setLines([]); return }
    setLines((po.po_line_items ?? []).map((li) => ({
      po_line_item_id: li.id,
      item_name: li.item_name,
      sku: li.sku ?? null,
      ordered_qty: li.qty,
      received_qty: li.received_qty ?? 0,
      bill_qty: li.qty,
      unit_price: li.unit_price,
    })))
  }, [po, open])

  function updateLine(idx: number, patch: Partial<BillLine>) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  // Sum approved received qty per PO line item
  const receivedMap = new Map<string, number>()
  for (const r of (receivals ?? []).filter((r) => r.status === 'approved')) {
    for (const ri of (r.receival_items ?? []) as any[]) {
      if (!ri.is_free && ri.po_line_item_id) {
        receivedMap.set(ri.po_line_item_id, (receivedMap.get(ri.po_line_item_id) ?? 0) + ri.qty_received)
      }
    }
  }

  function fillFromReceived() {
    setLines((prev) => prev.map((l) => ({ ...l, bill_qty: receivedMap.get(l.po_line_item_id) ?? l.received_qty })))
  }

  const subtotal = lines.reduce((s, l) => s + l.bill_qty * l.unit_price, 0)
  const discount = po?.discount_amount ?? 0
  const grandTotal = subtotal - discount
  const canSubmit = !!poId && !!dueDate && lines.length > 0 && lines.every((l) => l.bill_qty >= 0)

  async function submit() {
    if (!po || !canSubmit) return
    setSaving(true)
    try {
      const newBill = await createBill.mutateAsync({
        supplier_id:       (po as any).supplier_id,
        purchase_order_id: poId,
        po_number:         po.po_number,
        discount_amount:   discount,
        discount_label:    po.discount_label ?? null,
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
        })),
      })
      toast.success('Bill created')
      onOpenChange(false)
      router.push(`/purchase/bills/${newBill.id}`)
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to create bill')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Create Supplier Bill
            {po && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {po.po_number} · {po.supplier_name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {poLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading PO…</div>
        ) : !po ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Purchase order not found.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
            {/* Left: PO summary + bill fields */}
            <div className="lg:col-span-1 space-y-4">
              <div className="rounded-lg border p-4 text-sm space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Purchase Order
                </p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PO Number</span>
                  <span className="font-mono font-medium">{po.po_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplier</span>
                  <span className="font-medium">{po.supplier_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PO Date</span>
                  <span>{formatDate(po.created_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PO Total</span>
                  <span className="font-semibold">
                    {formatCurrency(po.total_qar ?? 0, po.currency ?? 'QAR')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {po.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Bill Details
                </p>
                <div className="space-y-1">
                  <Label>Due Date *</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Supplier Invoice # (Reference)</Label>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. INV-2026-001"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Internal notes…"
                  />
                </div>
              </div>
            </div>

            {/* Right: Line items */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Line Items
                  </p>
                  <div className="flex items-center gap-2">
                    {showReceival && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-muted-foreground"
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
                      className={cn('h-7 text-xs gap-1.5', showReceival && 'bg-blue-50 border-blue-200 text-blue-700')}
                      onClick={() => setShowReceival((v) => !v)}
                    >
                      {showReceival ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      Receival Info
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right w-[80px]">Ordered</TableHead>
                        {showReceival && (
                          <TableHead className="text-right w-[90px] text-blue-600">Received</TableHead>
                        )}
                        <TableHead className="text-right w-[110px]">Bill Qty</TableHead>
                        <TableHead className="text-right w-[130px]">Unit Price</TableHead>
                        <TableHead className="text-right w-[120px]">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, idx) => {
                        const lineTotal = line.bill_qty * line.unit_price
                        const approvedReceived = receivedMap.get(line.po_line_item_id) ?? line.received_qty
                        return (
                          <TableRow key={line.po_line_item_id}>
                            <TableCell>
                              <p className="text-sm font-medium">{line.item_name}</p>
                              {line.sku && <p className="text-xs text-muted-foreground">{line.sku}</p>}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {line.ordered_qty}
                            </TableCell>
                            {showReceival && (
                              <TableCell className="text-right text-sm">
                                {approvedReceived > 0
                                  ? <span className="text-green-600 font-medium">{approvedReceived}</span>
                                  : <span className="text-muted-foreground">0</span>}
                                <p className="text-xs text-muted-foreground">of {line.ordered_qty}</p>
                              </TableCell>
                            )}
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                value={line.bill_qty}
                                onChange={(e) => updateLine(idx, { bill_qty: Math.max(0, Number(e.target.value)) })}
                                className="h-7 w-20 text-right ml-auto"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={line.unit_price}
                                onChange={(e) => updateLine(idx, { unit_price: Math.max(0, Number(e.target.value)) })}
                                className="h-7 w-28 text-right ml-auto"
                              />
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {formatCurrency(lineTotal, 'QAR')}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Totals */}
                <div className="flex flex-col items-end gap-1 text-sm px-4 py-3 border-t bg-muted/30">
                  <div className="flex gap-8">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-semibold min-w-[120px] text-right">
                      {formatCurrency(subtotal, 'QAR')}
                    </span>
                  </div>
                  {discount > 0 && (
                    <div className="flex gap-8">
                      <span className="text-muted-foreground">
                        {po.discount_label ? `Discount (${po.discount_label})` : 'Discount'}
                      </span>
                      <span className="font-semibold min-w-[120px] text-right text-destructive">
                        −{formatCurrency(discount, 'QAR')}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-8 border-t pt-1 w-full justify-end">
                    <span className="font-bold">Grand Total</span>
                    <span className="font-bold min-w-[120px] text-right">
                      {formatCurrency(grandTotal, 'QAR')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={saving || !canSubmit}>
                  {saving ? 'Creating…' : 'Create Bill'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
