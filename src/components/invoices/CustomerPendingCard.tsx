'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/formatters'
import type { CustomerPending } from '@/hooks/usePendingPayments'

interface Props {
  customer: CustomerPending
  onView: (customer: CustomerPending) => void
}

export function CustomerPendingCard({ customer, onView }: Props) {
  const hasOverdue = customer.overdue_count > 0

  return (
    <Card
      className={cn(
        'relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow',
        hasOverdue && 'border-destructive/40'
      )}
      onClick={() => onView(customer)}
    >
      {hasOverdue && <div className="absolute top-0 left-0 right-0 h-[2px] bg-destructive" />}

      <div className="p-4 space-y-3">
        <div>
          <p className="font-semibold truncate">{customer.customer_name}</p>
          {customer.phone && (
            <p className="text-xs text-muted-foreground mt-0.5">{customer.phone}</p>
          )}
        </div>

        <div>
          <p className="text-2xl font-bold">{formatCurrency(customer.total_pending)}</p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {customer.invoice_count} invoice{customer.invoice_count !== 1 ? 's' : ''}
          </Badge>
          {hasOverdue && (
            <Badge variant="destructive" className="text-xs">
              {customer.overdue_count} overdue
            </Badge>
          )}
        </div>

        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={(e) => { e.stopPropagation(); onView(customer) }}
        >
          View →
        </button>
      </div>
    </Card>
  )
}
