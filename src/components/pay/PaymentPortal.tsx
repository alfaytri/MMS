'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, AlertCircle, Phone } from 'lucide-react'

interface InvoiceItem {
  id: string
  invoice_number: string
  order_id: string
  total_amount: number
  created_at: string
  customer_phone: string
}

export interface PhoneGroup {
  phone: string
  invoices: InvoiceItem[]
}

interface Props {
  clickedInvoiceId: string
  customerName?: string
  phoneGroups: PhoneGroup[]
  showSuccess?: boolean
  showNotReady?: boolean
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length <= 4) return raw
  return `+${digits.slice(0, -8)} ${digits.slice(-8, -4)} ${digits.slice(-4)}`
}

export default function PaymentPortal({
  clickedInvoiceId,
  customerName,
  phoneGroups,
  showSuccess,
  showNotReady,
}: Props) {
  const allInvoices = phoneGroups.flatMap((g) => g.invoices)

  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    if (allInvoices.some((inv) => inv.id === clickedInvoiceId)) {
      initial.add(clickedInvoiceId)
    }
    return initial
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (showSuccess) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-muted" dir="rtl">
        <div className="max-w-sm w-full rounded-xl border bg-white p-6 text-center space-y-3">
          <CheckCircle2 className="h-14 w-14 text-success mx-auto" />
          <h1 className="text-xl font-bold text-foreground">تم الدفع بنجاح</h1>
          <p className="text-lg font-semibold text-foreground">Payment Successful</p>
          <p className="text-sm text-muted-foreground">شكراً لكم — Thank you for your payment</p>
        </div>
      </main>
    )
  }

  if (showNotReady) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-muted">
        <div className="max-w-sm w-full rounded-xl border bg-white p-6 text-center space-y-3">
          <h1 className="text-lg font-bold">Payment Link Not Ready</h1>
          <p className="text-sm text-muted-foreground">
            The payment link is not ready yet. Please contact us for assistance.
          </p>
        </div>
      </main>
    )
  }

  if (allInvoices.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-muted" dir="rtl">
        <div className="max-w-sm w-full rounded-xl border bg-white p-6 text-center space-y-3">
          <CheckCircle2 className="h-14 w-14 text-success mx-auto" />
          <h1 className="text-xl font-bold text-foreground">تم تسوية جميع الفواتير</h1>
          <p className="text-lg font-semibold text-foreground">All Invoices Settled</p>
          <p className="text-sm text-muted-foreground">شكراً لكم — Thank you</p>
        </div>
      </main>
    )
  }

  const toggleInvoice = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const togglePhoneGroup = (group: PhoneGroup) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = group.invoices.every((inv) => next.has(inv.id))
      if (allSelected) {
        group.invoices.forEach((inv) => next.delete(inv.id))
      } else {
        group.invoices.forEach((inv) => next.add(inv.id))
      }
      return next
    })
  }

  const selectedTotal = allInvoices
    .filter((inv) => selected.has(inv.id))
    .reduce((sum, inv) => sum + inv.total_amount, 0)

  const handlePay = async () => {
    if (selected.size === 0) return
    setLoading(true)
    setError(null)

    const selectedInvoices = allInvoices.filter((inv) => selected.has(inv.id))
    const phones = [...new Set(selectedInvoices.map((inv) => inv.customer_phone).filter(Boolean))]

    try {
      const res = await fetch('/api/payments/dibsy/create-batch-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_ids: Array.from(selected),
          customer_phone: phones[0] ?? '',
          customer_phones: phones,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 400) {
          setError('تفاصيل الفاتورة تغيرت. يرجى تحديث الصفحة.\nInvoice details have changed. Please refresh.')
        } else {
          setError(data.error ?? 'حدث خطأ. يرجى المحاولة مرة أخرى.\nSomething went wrong. Please try again.')
        }
        setLoading(false)
        return
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      }
    } catch {
      setError('خطأ في الاتصال. يرجى المحاولة مرة أخرى.\nConnection error. Please try again.')
      setLoading(false)
    }
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return iso
    }
  }

  const hasMultiplePhones = phoneGroups.length > 1

  return (
    <main className="min-h-screen bg-muted pb-24" dir="rtl">
      <div className="bg-white border-b px-4 py-4 text-center">
        <h1 className="text-lg font-bold text-foreground">الفيتري للصيانة</h1>
        <p className="text-xs text-muted-foreground">Alfaytri Maintenance</p>
        {customerName && (
          <p className="text-sm font-medium text-foreground mt-1">{customerName}</p>
        )}
      </div>

      <div className={`mx-auto px-4 py-4 ${hasMultiplePhones ? 'max-w-3xl' : 'max-w-lg'}`}>
        <p className="text-sm text-muted-foreground font-medium mb-3">
          الفواتير المستحقة — Outstanding Invoices
        </p>

        <div className={hasMultiplePhones
          ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
          : 'space-y-3'
        }>
          {phoneGroups.map((group) => {
            const groupTotal = group.invoices.reduce((s, inv) => s + inv.total_amount, 0)
            const allGroupSelected = group.invoices.every((inv) => selected.has(inv.id))
            const someGroupSelected = group.invoices.some((inv) => selected.has(inv.id))

            return (
              <div key={group.phone} className={hasMultiplePhones
                ? 'rounded-xl border border-border bg-white p-3 space-y-2'
                : 'space-y-3'
              }>
                {hasMultiplePhones && (
                  <button
                    type="button"
                    onClick={() => togglePhoneGroup(group)}
                    className="w-full flex items-center justify-between gap-2 pb-2 border-b border-slate-100"
                  >
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-mono font-semibold text-foreground" dir="ltr">
                        {formatPhone(group.phone)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        ({group.invoices.length})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {groupTotal.toFixed(2)} QAR
                      </span>
                      <div
                        className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          allGroupSelected
                            ? 'bg-orange-500 border-orange-500'
                            : someGroupSelected
                              ? 'bg-orange-200 border-orange-400'
                              : 'border-border bg-white'
                        }`}
                      >
                        {allGroupSelected && (
                          <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {someGroupSelected && !allGroupSelected && (
                          <div className="h-1.5 w-1.5 rounded-sm bg-orange-500" />
                        )}
                      </div>
                    </div>
                  </button>
                )}

                <div className="space-y-2">
                  {group.invoices.map((inv) => {
                    const isChecked = selected.has(inv.id)
                    const isClicked = inv.id === clickedInvoiceId

                    return (
                      <button
                        key={inv.id}
                        type="button"
                        onClick={() => toggleInvoice(inv.id)}
                        className={`w-full rounded-xl border bg-white p-4 text-right transition-colors ${
                          isChecked
                            ? 'border-orange-400 ring-2 ring-orange-100'
                            : 'border-border'
                        } ${isClicked && isChecked ? 'bg-orange-50/50' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-foreground">
                                {inv.invoice_number}
                              </span>
                              {inv.order_id && (
                                <span className="text-xs text-muted-foreground">#{inv.order_id}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{formatDate(inv.created_at)}</p>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-base font-bold text-foreground whitespace-nowrap">
                              {inv.total_amount.toFixed(2)} QAR
                            </span>
                            <div
                              className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 ${
                                isChecked
                                  ? 'bg-orange-500 border-orange-500'
                                  : 'border-border bg-white'
                              }`}
                            >
                              {isChecked && (
                                <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {error && (
        <div className={`mx-auto px-4 pb-2 ${hasMultiplePhones ? 'max-w-3xl' : 'max-w-lg'}`}>
          <div className="rounded-lg bg-destructive/10 border border-red-200 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 bg-white border-t px-4 py-4 safe-area-bottom">
        <div className={`mx-auto ${hasMultiplePhones ? 'max-w-3xl' : 'max-w-lg'}`}>
          <button
            type="button"
            onClick={handlePay}
            disabled={selected.size === 0 || loading}
            className="w-full h-12 rounded-xl bg-orange-500 text-white font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:bg-orange-600 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>جاري المعالجة...</span>
              </>
            ) : selected.size === 0 ? (
              <span>اختر فاتورة للدفع — Select invoice to pay</span>
            ) : (
              <span>ادفع الآن {selectedTotal.toFixed(2)} QAR</span>
            )}
          </button>
        </div>
      </div>
    </main>
  )
}
