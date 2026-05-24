// src/app/pay/[invoiceId]/page.tsx
// Public customer-facing page — no auth required.
// Redirects to Dibsy checkout if invoice is unpaid, otherwise shows status.
import { redirect, notFound } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = {
  title: 'Invoice Payment — MMS',
  description: 'Complete your payment securely.',
}

interface Props {
  params: Promise<{ invoiceId: string }>
}

export default async function PayPage({ params }: Props) {
  const { invoiceId } = await params

  const supabase = createAdminClient()
  const { data: invoice } = await supabase
    .from('tl_invoices')
    .select('id, invoice_number, order_id, payment_status, dibsy_checkout_url, total_amount')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice) {
    notFound()
  }

  if (invoice.payment_status === 'paid') {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-sm w-full rounded-xl border p-6 text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
          <h1 className="text-lg font-bold">Invoice Already Settled</h1>
          <p className="text-sm text-muted-foreground">
            Invoice <span className="font-mono font-medium">{invoice.invoice_number}</span>
            {invoice.order_id && ` for order ${invoice.order_id}`} has already been paid.
            Thank you!
          </p>
        </div>
      </main>
    )
  }

  if (invoice.dibsy_checkout_url) {
    redirect(invoice.dibsy_checkout_url)
  }

  // Fallback: payment link not generated yet
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-sm w-full rounded-xl border p-6 text-center space-y-3">
        <h1 className="text-lg font-bold">Payment Link Not Ready</h1>
        <p className="text-sm text-muted-foreground">
          The payment link for invoice{' '}
          <span className="font-mono font-medium">{invoice.invoice_number}</span>{' '}
          is not ready yet. Please contact us for assistance.
        </p>
      </div>
    </main>
  )
}
