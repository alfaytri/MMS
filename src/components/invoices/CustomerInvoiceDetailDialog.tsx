'use client'

import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import type { CustomerPending } from '@/hooks/usePendingPayments'

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
  if (!customer) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle>
            {customer.customer_name} – Pending Invoices
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 pr-4">
            {customer.invoices.map((inv) => {
              const remaining = inv.total_amount - inv.paid_amount
              const paidPct = inv.total_amount > 0
                ? (inv.paid_amount / inv.total_amount) * 100
                : 0
              const isOverdue = inv.payment_status === 'overdue'

              return (
                <div key={inv.id} className="rounded-lg border p-3 space-y-2">
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
              )
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
