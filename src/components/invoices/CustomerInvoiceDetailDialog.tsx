'use client'

import { useState } from 'react'
import { CreditCard, Loader2, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { toast } from 'sonner'
import type { CustomerPending, PendingInvoice } from '@/hooks/usePendingPayments'

const SOURCE_COLORS: Record<string, string> = {
  order:    'bg-blue-100 text-blue-700',
  contract: 'bg-emerald-100 text-emerald-700',
  sale:     'bg-amber-100 text-amber-700',
  purchase: 'bg-purple-100 text-purple-700',
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  customer: CustomerPending | null
}

export function CustomerInvoiceDetailDialog({ open, onOpenChange, customer }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  if (!customer) return null

  const unpaidInvoices = customer.invoices.filter((inv) => inv.total_amount - inv.paid_amount > 0)
  const allSelected = unpaidInvoices.length > 0 && unpaidInvoices.every((inv) => selected.has(inv.id))

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(unpaidInvoices.map((inv) => inv.id)))
    }
  }

  const selectedTotal = customer.invoices
    .filter((inv) => selected.has(inv.id))
    .reduce((sum, inv) => sum + (inv.total_amount - inv.paid_amount), 0)

  async function handleSendPaymentLinks() {
    if (selected.size === 0) return
    setSending(true)
    try {
      const res = await fetch('/api/payments/dibsy/create-invoice-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_ids: [...selected] }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed to create payment links')

      const results = data.results as { invoice_id: string; checkout_url: string }[]
      if (results.length === 1) {
        window.open(results[0].checkout_url, '_blank')
        toast.success('Payment link opened in new tab')
      } else {
        for (const r of results) {
          await navigator.clipboard.writeText(r.checkout_url).catch(() => {})
        }
        toast.success(`${results.length} payment links created`)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create payment links')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle>
            {customer.customer_name} – Pending Invoices
          </DialogTitle>
        </DialogHeader>

        {unpaidInvoices.length > 1 && (
          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-input"
              />
              Select All ({unpaidInvoices.length})
            </label>
            {selected.size > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatCurrency(selectedTotal)} selected
              </span>
            )}
          </div>
        )}

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 pr-4">
            {customer.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No pending invoices</p>
            ) : (
              customer.invoices.map((inv) => {
                const remaining = inv.total_amount - inv.paid_amount
                const paidPct = inv.total_amount > 0
                  ? (inv.paid_amount / inv.total_amount) * 100
                  : 0
                const isOverdue = inv.payment_status === 'overdue'
                const isUnpaid = remaining > 0

                return (
                  <div
                    key={inv.id}
                    className={cn(
                      'rounded-lg border p-3 space-y-2 transition-colors',
                      selected.has(inv.id) && 'border-primary bg-primary/5'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {isUnpaid && (
                        <input
                          type="checkbox"
                          checked={selected.has(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                          className="h-4 w-4 rounded border-input mt-0.5 shrink-0"
                        />
                      )}
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-sm font-semibold">
                            {inv.invoice_id}
                          </span>
                          {inv.division_name && (
                            <Badge variant="outline" className="text-[10px]">
                              {inv.division_name}
                            </Badge>
                          )}
                          {inv.source_type && (
                            <Badge className={cn(
                              'text-[10px] px-1.5 py-0',
                              SOURCE_COLORS[inv.source_type] ?? 'bg-slate-100 text-slate-600'
                            )}>
                              {inv.source_type}
                              {inv.source_id ? ` · ${inv.source_id.slice(0, 8)}` : ''}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>Issued {formatDate(inv.issued_date)}</span>
                          <span className={cn(isOverdue && 'text-red-600 font-medium')}>
                            Due {formatDate(inv.due_date)}
                            {isOverdue && ' (overdue)'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span>
                            Paid {formatCurrency(inv.paid_amount)} / {formatCurrency(inv.total_amount)}
                          </span>
                          <span className="font-semibold text-red-600">
                            {formatCurrency(remaining)} due
                          </span>
                        </div>
                        <Progress value={paidPct} className="h-1.5" />
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>

        {selected.size > 0 && (
          <Button
            className="w-full gap-2"
            onClick={handleSendPaymentLinks}
            disabled={sending}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            {sending
              ? 'Creating…'
              : `Payment (${formatCurrency(selectedTotal)})`}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
