import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import PaymentPortal from '@/components/pay/PaymentPortal'

export const metadata = {
  title: 'Invoice Payment — MMS',
  description: 'Complete your payment securely.',
}

interface Props {
  params: Promise<{ invoiceId: string }>
  searchParams: Promise<{ status?: string }>
}

export default async function PayPage({ params, searchParams }: Props) {
  const { invoiceId } = await params
  const { status } = await searchParams

  const supabase = createAdminClient()

  // Try TL invoice first
  const { data: clickedInvoice } = await supabase
    .from('tl_invoices')
    .select('id, invoice_number, order_id, payment_status, customer_phone, total_amount, created_at, dibsy_checkout_url')
    .eq('id', invoiceId)
    .maybeSingle()

  // Fall back to regular invoice — use old single-redirect behavior
  if (!clickedInvoice) {
    const { data: regularInvoice } = await supabase
      .from('invoices')
      .select('id, invoice_id, payment_status, dibsy_checkout_url, total_amount, paid_amount')
      .eq('id', invoiceId)
      .maybeSingle()

    if (!regularInvoice) notFound()

    const paidAmount = regularInvoice.paid_amount ?? 0
    const isPaid =
      regularInvoice.payment_status === 'paid' ||
      (regularInvoice.total_amount != null && paidAmount >= regularInvoice.total_amount)

    if (isPaid) {
      return (
        <PaymentPortal
          clickedInvoiceId={invoiceId}
          invoices={[]}
          showSuccess={true}
        />
      )
    }

    if (regularInvoice.dibsy_checkout_url) {
      redirect(regularInvoice.dibsy_checkout_url)
    }

    return (
      <PaymentPortal
        clickedInvoiceId={invoiceId}
        invoices={[]}
        showNotReady={true}
      />
    )
  }

  // TL invoice found — fetch all unpaid siblings by phone (last 8 digits)
  const phone = clickedInvoice.customer_phone ?? ''
  const phoneDigits = phone.replace(/\D/g, '').slice(-8)

  let allUnpaid: typeof clickedInvoice[] = []
  if (phoneDigits.length >= 7) {
    const { data } = await supabase
      .from('tl_invoices')
      .select('id, invoice_number, order_id, payment_status, customer_phone, total_amount, created_at, dibsy_checkout_url')
      .eq('payment_status', 'unpaid')

    allUnpaid = (data ?? []).filter(
      (inv) => inv.customer_phone?.replace(/\D/g, '').slice(-8) === phoneDigits,
    )
  }

  const showSuccess = status === 'success' || (
    clickedInvoice.payment_status === 'paid' && allUnpaid.length === 0
  )

  const invoicesForPortal = allUnpaid.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number ?? inv.id,
    order_id: inv.order_id ?? '',
    total_amount: Number(inv.total_amount ?? 0),
    created_at: inv.created_at ?? new Date().toISOString(),
  }))

  return (
    <PaymentPortal
      clickedInvoiceId={invoiceId}
      customerPhone={phone}
      invoices={invoicesForPortal}
      showSuccess={showSuccess}
    />
  )
}
