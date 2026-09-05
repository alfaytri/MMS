'use client'

import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Send } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils/formatters'
import { useIsLgUp } from '@/hooks/useIsLgUp'
import type { CustomerPending } from '@/hooks/usePendingPayments'

interface Props {
  customer: CustomerPending
  /** Desktop entry point — open the detail dialog. */
  onView: (customer: CustomerPending) => void
}

export function CustomerPendingCard({ customer, onView }: Props) {
  const router = useRouter()
  const isLgUp = useIsLgUp()

  function handleOpen() {
    if (isLgUp) {
      onView(customer)
    } else {
      router.push(`/invoices/pending-payments/${encodeURIComponent(customer.group_key)}`)
    }
  }

  function handleRemind(e: React.MouseEvent) {
    e.stopPropagation()
    // Placeholder — the real WATI reminder send is wired in a later pass.
    toast.info(`Payment reminder for ${customer.customer_name} — WhatsApp sending coming soon`)
  }

  const phone = customer.phones[0]?.phone ?? customer.customer_phone
  const oldest = customer.oldest_pending_date
    ? format(new Date(customer.oldest_pending_date), 'dd/MM/yyyy hh:mm a')
    : null

  return (
    <Card
      className={cn(
        'relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow',
      )}
      onClick={handleOpen}
    >
      {/* #3 seam: a risk-tone accent bar / border will be driven here by the
          configurable customer-aging colors. Neutral for now. */}

      <div className="p-4 space-y-3">
        {/* Top: identity + reminder action */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold truncate">{customer.customer_name}</p>
            {phone && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">— {phone}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Button
              size="sm"
              className="h-7 gap-1.5 bg-blue-500 text-white hover:bg-blue-600 text-xs"
              onClick={handleRemind}
            >
              <Send className="h-3 w-3" /> Send Payment Reminder
            </Button>
            {oldest && (
              <span className="text-[11px] text-muted-foreground">— {oldest}</span>
            )}
          </div>
        </div>

        {/* Bottom: amount + count */}
        <div className="flex items-center justify-between border-t pt-3">
          <p className="text-sm text-muted-foreground">
            Pending Payments:{' '}
            <span className="font-bold text-base text-blue-600">
              {formatCurrency(customer.total_pending, 'QAR')}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Pending Invoices:{' '}
            <span className="font-bold text-blue-600">{customer.invoice_count}</span>
          </p>
        </div>
      </div>
    </Card>
  )
}
