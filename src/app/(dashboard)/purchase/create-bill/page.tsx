'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCreateBill } from '@/hooks/useSupplierBills'
import { usePurchaseOrder, usePOReceivalsByPO } from '@/hooks/usePurchaseOrders'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { PageWrapper } from '@/components/shared/PageWrapper'

type BillLine = {
  po_line_item_id: string
  item_name: string
  sku: string | null
  ordered_qty: number
  received_qty: number
  bill_qty: number
  unit_price: number
}

function CreateBillForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const poId = searchParams.get('po_id') ?? ''

  const createBill = useCreateBill()
  const { data: po, isLoading: poLoading } = usePurchaseOrder(poId || null)
  const { data: receivals } = usePOReceivalsByPO(poId || null)

  const [dueDate, setDueDate] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<BillLine[]>([])
  const [showReceival, setShowReceival] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
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
  }, [po])

  function updateLine(idx: number, patch: Partial<BillLine>) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function fillFromReceived() {
    setLines((prev) => prev.map((l) => ({ ...l, bill_qty: receivedMap.get(l.po_line_item_id) ?? l.received_qty })))
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

  const subtotal = lines.reduce((s, l) => s + l.bill_qty * l.unit_price, 0)
  const canSubmit = !!poId && !!dueDate && lines.length > 0 && lines.every((l) => l.bill_qty >= 0)

  async function submit() {
    if (!po || !canSubmit) return
    setSaving(true)
    try {
      await createBill.mutateAsync({
        supplier_id: (po as any).supplier_id,
        purchase_order_id: poId,
        receival_id: null,
        due_date: dueDate,
        source_label: reference || null,
        notes,
        line_items: lines.filter((l) => l.bill_qty > 0).map((l) => ({
          description: l.item_name,
          qty: l.bill_qty,
          unit_price: l.unit_price,
          total: l.bill_qty * l.unit_price,
          match_status: 'matched' as const,
          match_note: null,
        })),
      })
      toast.success('Bill created successfully')
      router.push('/purchase/bills')
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to create bill')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageWrapper>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/purchase/orders')}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Orders
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create Supplier Bill</h1>
          {po && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {po.po_number} · {po.supplier_name}
            </p>
          )}
        </div>
      </div>

      {poLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          Loading PO…
        </div>
      ) : !po ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <p className="font-medium">Purchase order not found.</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/purchase/orders')}>
            Back to Orders
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left: PO info + form fields ─────────────────────────────────── */}
          <div className="lg:col-span-1 space-y-4">
            {/* PO Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Purchase Order
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
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
                  <span className="font-semibold">{formatCurrency(po.total_qar ?? 0, po.currency ?? 'QAR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {po.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Bill fields */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Bill Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>Due Date *</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Line items ─────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Line Items
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {showReceival && (
                      <Button
                        type="button" variant="ghost" size="sm"
                        className="h-7 text-xs gap-1 text-muted-foreground"
                        onClick={fillFromReceived}
                      >
                        <Package className="h-3 w-3" />
                        Fill from received
                      </Button>
                    )}
                    <Button
                      type="button" variant="outline" size="sm"
                      className={cn('h-7 text-xs gap-1.5', showReceival && 'bg-blue-50 border-blue-200 text-blue-700')}
                      onClick={() => setShowReceival((v) => !v)}
                    >
                      {showReceival ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      Receival Info
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
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
                                type="number" min={0}
                                value={line.bill_qty}
                                onChange={(e) => updateLine(idx, { bill_qty: Math.max(0, Number(e.target.value)) })}
                                className="h-7 w-20 text-right ml-auto"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number" min={0} step="0.01"
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
                <div className="flex justify-end gap-8 text-sm px-4 py-3 border-t bg-muted/30">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold min-w-[120px] text-right">
                    {formatCurrency(subtotal, 'QAR')}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Submit */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => router.push('/purchase/orders')}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving || !canSubmit}>
                {saving ? 'Creating…' : 'Create Bill'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}

export default function CreateBillPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Loading…</div>}>
      <CreateBillForm />
    </Suspense>
  )
}
