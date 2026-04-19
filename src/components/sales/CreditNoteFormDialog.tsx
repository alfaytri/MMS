// src/components/sales/CreditNoteFormDialog.tsx
'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateCreditNote } from '@/hooks/useCreditNotes'
import { useCustomerInvoices } from '@/hooks/useCustomerInvoices'
import { formatCurrency } from '@/lib/utils/formatters'

type CreditLine = {
  invoice_line_id: string | null
  description: string
  qty: number
  unit_price: number
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function CreditNoteFormDialog({ open, onOpenChange }: Props) {
  const createCreditNote = useCreateCreditNote()
  const { data: invoices } = useCustomerInvoices()

  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState<CreditLine[]>([
    { invoice_line_id: null, description: '', qty: 1, unit_price: 0 },
  ])
  const [saving, setSaving] = useState(false)

  const selectedInvoice = (invoices ?? []).find((inv) => inv.id === selectedInvoiceId)

  useEffect(() => {
    if (!selectedInvoice) { setLines([{ invoice_line_id: null, description: '', qty: 1, unit_price: 0 }]); return }
    setLines(
      (selectedInvoice.invoice_line_items ?? []).map((li) => ({
        invoice_line_id: li.id,
        description: li.description,
        qty: li.qty ?? 1,
        unit_price: li.unit_price ?? 0,
      }))
    )
  }, [selectedInvoiceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0)

  const close = () => {
    setSelectedInvoiceId(''); setReason(''); setLines([{ invoice_line_id: null, description: '', qty: 1, unit_price: 0 }])
    onOpenChange(false)
  }

  const submit = async () => {
    if (!selectedInvoiceId || !reason.trim()) {
      toast.error('Select an invoice and enter a reason')
      return
    }
    if (lines.some((l) => !l.description.trim())) {
      toast.error('All lines must have a description')
      return
    }
    setSaving(true)
    try {
      await createCreditNote.mutateAsync({
        invoice_id: selectedInvoiceId,
        customer_name: selectedInvoice?.customer_name ?? '',
        reason,
        lines,
      })
      toast.success('Credit note created')
      close()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const eligibleInvoices = (invoices ?? []).filter((inv) => inv.doc_status !== 'draft')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Credit Note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Original Invoice *</Label>
            <Select value={selectedInvoiceId} onValueChange={(v) => setSelectedInvoiceId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
              <SelectContent>
                {eligibleInvoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.invoice_id} — {inv.customer_name} — {formatCurrency(inv.total_amount ?? 0, 'QAR')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Reason *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for credit note" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Credit Lines *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines((prev) => [...prev, { invoice_line_id: null, description: '', qty: 1, unit_price: 0 }])}
              >
                <Plus className="w-3 h-3 mr-1" /> Add Line
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-2">Description</th>
                    <th className="text-right py-2 px-2 w-20">Qty</th>
                    <th className="text-right py-2 px-2 w-28">Unit Price</th>
                    <th className="text-right py-2 pl-2 w-28">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2 pr-2">
                        <Input
                          value={line.description}
                          onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, description: e.target.value } : l))}
                          placeholder="Description"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          className="text-right"
                          value={line.qty}
                          min={0.01}
                          step="0.01"
                          onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, qty: Number(e.target.value) } : l))}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          className="text-right"
                          value={line.unit_price}
                          min={0}
                          step="0.01"
                          onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, unit_price: Number(e.target.value) } : l))}
                        />
                      </td>
                      <td className="text-right py-2 pl-2 font-medium">
                        {formatCurrency(line.qty * line.unit_price, 'QAR')}
                      </td>
                      <td className="py-2">
                        {lines.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right text-sm font-semibold">
              CN Total: {formatCurrency(total, 'QAR')}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !selectedInvoiceId || !reason.trim()}>
            {saving ? 'Creating…' : 'Create Draft CN'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
