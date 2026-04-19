'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ThreeWayMatchTable, computeMatchStatus, type MatchLine } from './ThreeWayMatchTable'
import { useCreateBill } from '@/hooks/useSupplierBills'
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders'
import { useReceivals } from '@/hooks/useReceivals'
import { formatCurrency } from '@/lib/utils/formatters'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialPoId?: string
}

export function BillFormDialog({ open, onOpenChange, initialPoId }: Props) {
  const createBill = useCreateBill()
  const { data: orders } = usePurchaseOrders({})
  const { data: allReceivals } = useReceivals({ status: 'approved' })

  const [selectedPoId, setSelectedPoId] = useState('')
  const [selectedReceivalId, setSelectedReceivalId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<MatchLine[]>([])
  const [saving, setSaving] = useState(false)

  const selectedPO = (orders ?? []).find((o) => o.id === selectedPoId)
  const poReceivals = (allReceivals ?? []).filter((r) => r.po_id === selectedPoId)

  useEffect(() => {
    if (open && initialPoId) {
      setSelectedPoId(initialPoId)
    }
  }, [open, initialPoId])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedPoId || !selectedReceivalId) { setLines([]); return }
    const po = selectedPO
    const receival = poReceivals.find((r) => r.id === selectedReceivalId)
    if (!po || !receival) return

    const poLines: any[] = (po as any).po_line_items ?? []
    setLines(
      poLines.map((pl: any) => {
        const ri = (receival.receival_items ?? []).find(
          (ri) => ri.po_line_item_id === pl.id
        )
        const initial: MatchLine = {
          id: pl.id,
          description: pl.item_name ?? pl.description ?? '',
          ordered_qty: pl.qty ?? 0,
          ordered_unit_price: pl.unit_price ?? 0,
          received_qty: ri ? ri.qty_received : null,
          billed_qty: ri ? ri.qty_received : (pl.qty ?? 0),
          billed_unit_price: pl.unit_price ?? 0,
          match_status: 'matched',
          match_note: '',
        }
        initial.match_status = computeMatchStatus(initial)
        return initial
      })
    )
  }, [selectedPoId, selectedReceivalId, selectedPO, poReceivals])

  const totalAmount = lines.reduce((s, l) => s + l.billed_qty * l.billed_unit_price, 0)
  const canSubmit = lines.every(
    (l) => l.match_status === 'matched' || l.match_status === 'accepted_with_note'
  ) && lines.every(
    (l) => l.match_status !== 'accepted_with_note' || l.match_note.trim().length > 0
  )

  const close = () => {
    if (!initialPoId) setSelectedPoId('')
    setSelectedReceivalId('')
    setNotes('')
    setLines([])
    onOpenChange(false)
  }

  const submit = async () => {
    if (!selectedPO || !dueDate || lines.length === 0) {
      toast.error('Select PO, due date, and ensure lines are loaded')
      return
    }
    if (!canSubmit) {
      toast.error('Resolve all unmatched lines or add acceptance notes')
      return
    }
    setSaving(true)
    try {
      await createBill.mutateAsync({
        supplier_id: (selectedPO as any).supplier_id,
        purchase_order_id: selectedPoId,
        receival_id: selectedReceivalId || null,
        due_date: dueDate,
        notes,
        line_items: lines.map((l) => ({
          description: l.description,
          qty: l.billed_qty,
          unit_price: l.billed_unit_price,
          total: l.billed_qty * l.billed_unit_price,
          match_status: l.match_status,
          match_note: l.match_note || null,
        })),
      })
      toast.success('Bill created')
      close()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Supplier Bill</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {!initialPoId ? (
              <div className="space-y-1">
                <Label>Purchase Order *</Label>
                <Select value={selectedPoId} onValueChange={(v) => { setSelectedPoId(v ?? ''); setSelectedReceivalId('') }}>
                  <SelectTrigger><SelectValue placeholder="Select PO" /></SelectTrigger>
                  <SelectContent>
                    {(orders ?? []).filter((o) => o.status === 'approved' || o.status === 'received' || o.status === 'partially_received').map((po) => (
                      <SelectItem key={po.id} value={po.id}>{po.po_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              selectedPO && (
                <div className="space-y-1">
                  <Label>Purchase Order</Label>
                  <p className="text-sm font-medium border rounded-md px-3 py-2 bg-muted">
                    {selectedPO.po_number} — {selectedPO.supplier_name}
                  </p>
                </div>
              )
            )}
            <div className="space-y-1">
              <Label>Approved Receival</Label>
              <Select value={selectedReceivalId} onValueChange={(v) => setSelectedReceivalId(v ?? '')} disabled={!selectedPoId}>
                <SelectTrigger><SelectValue placeholder="Select receival" /></SelectTrigger>
                <SelectContent>
                  {poReceivals.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.receival_number} — {r.date}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Due Date *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes" />
          </div>

          {lines.length > 0 && (
            <>
              <ThreeWayMatchTable lines={lines} onChange={setLines} />
              <div className="flex justify-end text-sm font-semibold">
                Total: {formatCurrency(totalAmount, 'QAR')}
              </div>
              {!canSubmit && (
                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  All lines must be matched or accepted-with-note (with required notes) before submitting.
                </p>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !canSubmit || lines.length === 0}>
            {saving ? 'Saving…' : 'Create Bill'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
