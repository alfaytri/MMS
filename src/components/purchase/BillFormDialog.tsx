'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Package } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCreateBill } from '@/hooks/useSupplierBills'
import { usePurchaseOrders, usePOReceivalsByPO, type PurchaseOrder } from '@/hooks/usePurchaseOrders'
import { formatCurrency } from '@/lib/utils/formatters'
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

  const { data: receivals } = usePOReceivalsByPO(selectedPoId || null)

  const selectedPO = (orders ?? []).find((o) => o.id === selectedPoId) as PurchaseOrder | undefined

  useEffect(() => {
    if (open && initialPoId) setSelectedPoId(initialPoId)
  }, [open, initialPoId])

  useEffect(() => {
    if (!selectedPO) { setLines([]); return }
    const items = selectedPO.po_line_items ?? []
    setLines(items.map((li) => ({
      po_line_item_id: li.id,
      item_name: li.item_name,
      sku: li.sku ?? null,
      ordered_qty: li.qty,
      received_qty: li.received_qty ?? 0,
      bill_qty: li.qty,
      unit_price: li.unit_price,
    })))
  }, [selectedPoId, selectedPO])

  function updateLine(idx: number, patch: Partial<BillLine>) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function fillFromReceived() {
    setLines((prev) => prev.map((l) => ({ ...l, bill_qty: l.received_qty })))
  }

  const subtotal = lines.reduce((s, l) => s + l.bill_qty * l.unit_price, 0)
  const canSubmit = !!selectedPoId && !!dueDate && lines.length > 0 && lines.every((l) => l.bill_qty >= 0)

  function close() {
    if (!initialPoId) setSelectedPoId('')
    setDueDate(''); setReference(''); setNotes('')
    setLines([]); setShowReceival(false)
    onOpenChange(false)
  }

  async function submit() {
    if (!selectedPO || !canSubmit) return
    setSaving(true)
    try {
      await createBill.mutateAsync({
        supplier_id:       (selectedPO as any).supplier_id,
        purchase_order_id: selectedPoId,
        po_number:         selectedPO.po_number,
        discount_amount:   selectedPO.discount_amount ?? 0,
        discount_label:    selectedPO.discount_label ?? null,
        receival_id:       null,
        due_date:          dueDate,
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
      toast.success('Bill created successfully')
      close()
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to create bill')
    } finally {
      setSaving(false)
    }
  }

  // Compute total received per line item across approved receivals
  const receivedMap = new Map<string, number>()
  for (const r of (receivals ?? []).filter((r) => r.status === 'approved')) {
    for (const ri of (r.receival_items ?? []) as any[]) {
      if (!ri.is_free && ri.po_line_item_id) {
        receivedMap.set(ri.po_line_item_id, (receivedMap.get(ri.po_line_item_id) ?? 0) + ri.qty_received)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg max-h-[95vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Create Supplier Bill</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* ── PO + fields ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* PO selector */}
            {!initialPoId ? (
              <div className="space-y-1 lg:col-span-2">
                <Label>Purchase Order *</Label>
                <Select
                  value={selectedPoId || 'none'}
                  onValueChange={(v) => setSelectedPoId(v === 'none' || v === null ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select PO…" /></SelectTrigger>
                  <SelectContent>
                    {(orders ?? [])
                      .filter((o) => !['draft', 'cancelled'].includes(o.status))
                      .map((po) => (
                        <SelectItem key={po.id} value={po.id}>
                          {po.po_number} — {po.supplier_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              selectedPO && (
                <div className="space-y-1 lg:col-span-2">
                  <Label>Purchase Order</Label>
                  <div className="text-sm font-medium border rounded-md px-3 py-2 bg-muted">
                    {selectedPO.po_number}
                    <span className="text-muted-foreground ml-2">· {selectedPO.supplier_name}</span>
                    <span className="text-muted-foreground ml-2">· {formatCurrency(selectedPO.total_qar ?? 0, selectedPO.currency ?? 'QAR')}</span>
                  </div>
                </div>
              )
            )}

            <div className="space-y-1">
              <Label>Due Date *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Reference / Invoice #</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Supplier's invoice number"
              />
            </div>

            <div className="space-y-1 sm:col-span-2 lg:col-span-4">
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes…"
              />
            </div>
          </div>

          {/* ── Lines table ─────────────────────────────────────────────────── */}
          {lines.length > 0 && (
            <div className="space-y-2">
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {lines.length} line item{lines.length !== 1 ? 's' : ''} from PO
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

              <div className="rounded-md border overflow-x-auto">
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
                              <p className="text-xs text-muted-foreground">
                                of {line.ordered_qty}
                              </p>
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

              {/* Subtotal */}
              <div className="flex justify-end gap-8 text-sm pr-1 pt-1">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{formatCurrency(subtotal, 'QAR')}</span>
              </div>
            </div>
          )}

          {selectedPoId && lines.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No line items found on this PO.</p>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-2 border-t gap-2 sm:gap-0">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !canSubmit}>
            {saving ? 'Creating…' : 'Create Bill'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
