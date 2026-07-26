'use client'

import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/formatters'
import { useIsLgUp } from '@/hooks/useIsLgUp'
import type { CustomerPending } from '@/hooks/usePendingPayments'

interface Props {
  customer: CustomerPending
  /** Desktop entry point — open the dialog. The card decides itself whether to call this or navigate. */
  onView: (customer: CustomerPending) => void
}

export function CustomerPendingCard({ customer, onView }: Props) {
  const router = useRouter()
  const isLgUp = useIsLgUp()
  const hasOverdue = customer.overdue_count > 0

  function handleOpen() {
    if (isLgUp) {
      onView(customer)
    } else {
      router.push(`/invoices/pending-payments/${customer.customer_id}`)
    }
  }

  return (
    <Card
      className={cn(
        'relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow',
        hasOverdue && 'border-destructive/40'
      )}
      onClick={handleOpen}
    >
      {hasOverdue && <div className="absolute top-0 left-0 right-0 h-[2px] bg-destructive" />}

      <div className="p-4 space-y-3">
        <div>
          <p className="font-semibold truncate">{customer.customer_name}</p>
          {customer.phones.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {customer.phones[0].phone}
              {customer.phones.length > 1 && (
                <span className="ml-1 text-muted-foreground/70">
                  +{customer.phones.length - 1} more
                </span>
              )}
            </p>
          )}
        </div>

        <div>
          <p className="text-2xl font-bold">{formatCurrency(customer.total_pending, 'QAR')}</p>
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
          onClick={(e) => { e.stopPropagation(); handleOpen() }}
        >
          View →
        </button>
      </div>
    </Card>
  )
}
