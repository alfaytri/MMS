'use client'
import { CreditCard, Receipt } from 'lucide-react'
import { AlertDialog, AlertDialogCancel, AlertDialogContent,
         AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import type { TlInvoice } from '@/hooks/useTlInvoices'

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank Transfer', pdc: 'PDC', cdc: 'CDC',
  online: 'Online', fawran: 'Fawran', pos: 'POS', pay_later: 'Pay Later',
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoice: TlInvoice | null
}

export function ViewTlPaymentsDialog({ open, onOpenChange, invoice }: Props) {
  const payments  = invoice?.payments ?? []
  const total     = invoice?.total_amount ?? 0
  const paid      = invoice?.paid_amount  ?? 0
  const remaining = Math.max(0, total - paid)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Payment History — {invoice?.invoice_number}
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Invoice Total</span>
              <span className="font-semibold">{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-medium text-emerald-600">{formatCurrency(paid)}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-1">
              <span className="text-muted-foreground font-medium">Remaining</span>
              <span className={cn('font-bold', remaining <= 0 ? 'text-emerald-600' : 'text-amber-600')}>
                {remaining <= 0 ? 'Paid in Full' : formatCurrency(remaining)}
              </span>
            </div>
          </div>

          {payments.length === 0 ? (
            <div className="py-8 text-center">
              <CreditCard className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No payments recorded</p>
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => {
                const methodLabel = p.method_slug ? METHOD_LABELS[p.method_slug] ?? p.method_slug : '—'
                const time = new Date(p.paid_at).toLocaleTimeString('en-US', {
                  hour: '2-digit', minute: '2-digit', hour12: true,
                })
                return (
                  <div key={p.id} className="rounded-lg border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{formatDate(p.paid_at)} · {time}</span>
                      <span className="font-semibold text-sm">{formatCurrency(p.amount)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div><span className="text-muted-foreground">Method:</span> <span className="font-medium">{methodLabel}</span></div>
                      <div><span className="text-muted-foreground">Registered By:</span> <span className="font-medium">{p.registered_by_name ?? '—'}</span></div>
                      {p.notes && (
                        <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> <span>{p.notes}</span></div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
