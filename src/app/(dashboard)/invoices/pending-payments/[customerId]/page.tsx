'use client'

import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CustomerInvoiceDetailContent } from '@/components/invoices/CustomerInvoiceDetailContent'
import { usePendingPayments } from '@/hooks/usePendingPayments'

export default function CustomerPendingDetailPage() {
  const { customerId } = useParams() as { customerId: string }
  const router = useRouter()
  const { data: customers, isLoading, error } = usePendingPayments()

  const customer = useMemo(
    () => customers?.find((c) => c.customer_id === customerId) ?? null,
    [customers, customerId],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Back bar */}
      <div className="flex items-center gap-2 border-b bg-background px-4 sm:px-6 py-2 sticky top-0 z-10">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 -ml-2 text-muted-foreground min-h-9"
          onClick={() => router.push('/invoices/pending-payments')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="text-sm font-semibold text-foreground truncate">
          {customer?.customer_name ?? 'Customer'}
        </span>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-destructive px-6 text-center">
          Failed to load customer. {error instanceof Error ? error.message : ''}
        </div>
      ) : !customer ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-muted-foreground">
            Customer not found, or no pending invoices remain.
          </p>
          <Button variant="outline" size="sm" onClick={() => router.push('/invoices/pending-payments')}>
            Back to Pending Payments
          </Button>
        </div>
      ) : (
        <CustomerInvoiceDetailContent customer={customer} />
      )}
    </div>
  )
}
