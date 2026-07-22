import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import PaymentPortal from '@/components/pay/PaymentPortal'
import type { PhoneGroup } from '@/components/pay/PaymentPortal'

export const metadata = {
  title: 'Invoice Payment — MMS',
  description: 'Complete your payment securely.',
}

interface Props {
  params: Promise<{ invoiceId: string }>
  searchParams: Promise<{ status?: string }>
}

function phoneLast8(raw: string): string {
  return raw.replace(/\D/g, '').slice(-8)
}

export default async function PayPage({ params, searchParams }: Props) {
  const { invoiceId } = await params
  const { status } = await searchParams

  const supabase = createAdminClient()

  // Try TL invoice first
  const { data: clickedInvoice } = await supabase
    .from('tl_invoices')
    .select('id, invoice_number, order_id, payment_status, customer_phone, customer_name, total_amount, created_at, dibsy_checkout_url')
    .eq('id', invoiceId)
    .maybeSingle()

  // Fall back to regular invoice — use old single-redirect behavior
  if (!clickedInvoice) {
    const { data: regularInvoice } = await supabase
      .from('so_invoices')
      .select('id, invoice_id, payment_status, total_amount, paid_amount')
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
          phoneGroups={[]}
          showSuccess={true}
        />
      )
    }

    // Sales-order (public.invoices) invoices no longer support an online
    // Dibsy checkout link (Option A) — cash / bank transfer / cheque only.
    return (
      <PaymentPortal
        clickedInvoiceId={invoiceId}
        phoneGroups={[]}
        showNotReady={true}
      />
    )
  }

  // TL invoice found — fetch all unpaid invoices for this customer (by name)
  const customerName = clickedInvoice.customer_name ?? ''
  const clickedPhone = clickedInvoice.customer_phone ?? ''

  let allUnpaid: typeof clickedInvoice[] = []
  if (customerName) {
    const { data } = await supabase
      .from('tl_invoices')
      .select('id, invoice_number, order_id, payment_status, customer_phone, customer_name, total_amount, created_at, dibsy_checkout_url')
      .eq('payment_status', 'unpaid')
      .eq('customer_name', customerName)

    allUnpaid = data ?? []
  }

  // Fallback: if no name match, use old phone-based lookup
  if (allUnpaid.length === 0) {
    const phoneDigits = phoneLast8(clickedPhone)
    if (phoneDigits.length >= 7) {
      const { data } = await supabase
        .from('tl_invoices')
        .select('id, invoice_number, order_id, payment_status, customer_phone, customer_name, total_amount, created_at, dibsy_checkout_url')
        .eq('payment_status', 'unpaid')

      allUnpaid = (data ?? []).filter(
        (inv) => phoneLast8(inv.customer_phone ?? '') === phoneDigits,
      )
    }
  }

  const showSuccess = status === 'success' || (
    clickedInvoice.payment_status === 'paid' && allUnpaid.length === 0
  )

  // Group invoices by phone number (last 8 digits as key)
  const phoneMap = new Map<string, { phone: string; invoices: typeof allUnpaid }>()
  for (const inv of allUnpaid) {
    const rawPhone = inv.customer_phone ?? ''
    const key = phoneLast8(rawPhone) || 'unknown'
    const existing = phoneMap.get(key)
    if (existing) {
      existing.invoices.push(inv)
    } else {
      phoneMap.set(key, { phone: rawPhone, invoices: [inv] })
    }
  }

  // Sort: clicked invoice's phone group first
  const clickedPhoneKey = phoneLast8(clickedPhone) || 'unknown'
  const phoneGroups: PhoneGroup[] = []

  for (const [_key, group] of phoneMap) {
    phoneGroups.push({
      phone: group.phone,
      invoices: group.invoices.map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number ?? inv.id,
        order_id: inv.order_id ?? '',
        total_amount: Number(inv.total_amount ?? 0),
        created_at: inv.created_at ?? new Date().toISOString(),
        customer_phone: inv.customer_phone ?? '',
      })),
    })
  }

  // Put the clicked phone's group first
  phoneGroups.sort((a, b) => {
    const aIsClicked = phoneLast8(a.phone) === clickedPhoneKey ? 0 : 1
    const bIsClicked = phoneLast8(b.phone) === clickedPhoneKey ? 0 : 1
    return aIsClicked - bIsClicked
  })

  return (
    <PaymentPortal
      clickedInvoiceId={invoiceId}
      customerName={customerName}
      phoneGroups={phoneGroups}
      showSuccess={showSuccess}
    />
  )
}
