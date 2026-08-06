'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { useApplyCreditNote, type CreditNote } from '@/hooks/useCreditNotes'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

type PickableInvoice = {
  id:              string
  invoice_id:      string
  total_amount:    number
  paid_amount:     number
  payment_status:  string
  issued_date:     string
  outstanding:     number
}

interface Props {
  note:          CreditNote | null
  open:          boolean
  onOpenChange: (open: boolean) => void
}

export function ApplyCreditNoteDialog({ note, open, onOpenChange }: Props) {
  const apply = useApplyCreditNote()
  const [invoices, setInvoices] = useState<PickableInvoice[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('')
  const [amountStr, setAmountStr] = useState<string>('')

  const remainingCn = useMemo(() => {
    if (!note) return 0
    // The list hook doesn't fetch prior redemptions per-CN — assume full total
    // until the RPC returns the authoritative cap error on submit.
    return note.total_amount
  }, [note])

  // Load candidate invoices whenever the note changes.
  useEffect(() => {
    if (!open || !note) return
    let cancelled = false

    // If CN is tied to a specific invoice, use only that one.
    if (note.invoice_id) {
      setLoading(true)
      ;(async () => {
        const supabase = createClient()
        const { data } = await supabase
          .from('so_invoices')
          .select('id, invoice_id, total_amount, paid_amount, payment_status, issued_date')
          .eq('id', note.invoice_id!)
          .maybeSingle()
        if (cancelled) return
        if (!data) {
          setInvoices([])
          setLoading(false)
          return
        }
        const total = Number(data.total_amount ?? 0)
        const paid  = Number(data.paid_amount ?? 0)
        setInvoices([{
          id:             data.id,
          invoice_id:     data.invoice_id,
          total_amount:   total,
          paid_amount:    paid,
          payment_status: data.payment_status,
          issued_date:    data.issued_date,
          outstanding:    Math.max(0, total - paid),
        }])
        setSelectedInvoiceId(data.id)
        setLoading(false)
      })()
      return () => { cancelled = true }
    }

    // Sale-return CN — pick from the customer's own unpaid invoices.
    if (!note.customer_id) {
      setInvoices([])
      return
    }
    setLoading(true)
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('so_invoices')
        .select('id, invoice_id, total_amount, paid_amount, payment_status, issued_date')
        .eq('customer_id', note.customer_id!)
        .in('payment_status', ['unpaid', 'partially_paid'])
        .order('due_date', { ascending: true })
        .limit(200)
      if (cancelled) return
      const rows: PickableInvoice[] = (data ?? []).map((r) => {
        const total = Number(r.total_amount ?? 0)
        const paid  = Number(r.paid_amount ?? 0)
        return {
          id:             r.id,
          invoice_id:     r.invoice_id,
          total_amount:   total,
          paid_amount:    paid,
          payment_status: r.payment_status,
          issued_date:    r.issued_date,
          outstanding:    Math.max(0, total - paid),
        }
      }).filter((r) => r.outstanding > 0)
      setInvoices(rows)
      // Auto-select the oldest-due invoice if there's one
      if (rows.length > 0) setSelectedInvoiceId(rows[0].id)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, note])

  // Recompute default amount when invoice selection changes.
  useEffect(() => {
    const inv = invoices.find((i) => i.id === selectedInvoiceId)
    if (!inv) { setAmountStr(''); return }
    setAmountStr(String(Math.min(remainingCn, inv.outstanding)))
  }, [selectedInvoiceId, invoices, remainingCn])

  if (!note) return null

  const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId)
  const parsedAmount = Number(amountStr)
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0

  async function handleSubmit() {
    if (!selectedInvoice || !validAmount || !note) return
    try {
      await apply.mutateAsync({
        id:         note.id,
        invoiceId:  selectedInvoice.id,
        amount:     parsedAmount,
      })
      toast.success(`Credit note applied — ${formatCurrency(parsedAmount, 'QAR')} against ${selectedInvoice.invoice_id}`)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply credit note')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply {note.credit_note_id}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/40">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Credit note total</span>
              <span className="font-mono tabular-nums">{formatCurrency(note.total_amount, note.currency ?? 'QAR')}</span>
            </div>
            {note.customer_name && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span>{note.customer_name}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Apply to invoice</label>
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading invoices…</p>
            ) : invoices.length === 0 ? (
              <p className="text-xs text-destructive">
                No unpaid invoices found for this customer. Issue an invoice first or reduce it.
              </p>
            ) : (
              <Select value={selectedInvoiceId} onValueChange={(v) => setSelectedInvoiceId(v ?? '')}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Choose an invoice…" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      <span className="flex items-center gap-2">
                        <span className="font-mono">{inv.invoice_id}</span>
                        <span className="text-muted-foreground">·</span>
                        <span>outstanding {formatCurrency(inv.outstanding, 'QAR')}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{formatDate(inv.issued_date)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount</label>
            <Input
              type="number" min={0.01} step="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              disabled={!selectedInvoice}
              placeholder="0.00"
            />
            {selectedInvoice && (
              <p className="text-xs text-muted-foreground">
                Max applicable: {formatCurrency(Math.min(remainingCn, selectedInvoice.outstanding), 'QAR')}
                {' '}(CN remaining {formatCurrency(remainingCn, 'QAR')}, invoice outstanding {formatCurrency(selectedInvoice.outstanding, 'QAR')})
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={apply.isPending}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedInvoice || !validAmount || apply.isPending}
          >
            {apply.isPending ? 'Applying…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
