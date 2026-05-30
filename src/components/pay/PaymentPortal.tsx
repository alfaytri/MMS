'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

interface InvoiceItem {
  id: string
  invoice_number: string
  order_id: string
  total_amount: number
  created_at: string
}

interface Props {
  clickedInvoiceId: string
  customerPhone?: string
  invoices: InvoiceItem[]
  showSuccess?: boolean
  showNotReady?: boolean
}

export default function PaymentPortal({
  clickedInvoiceId,
  customerPhone,
  invoices,
  showSuccess,
  showNotReady,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    if (invoices.some((inv) => inv.id === clickedInvoiceId)) {
      initial.add(clickedInvoiceId)
    }
    return initial
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (showSuccess) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50" dir="rtl">
        <div className="max-w-sm w-full rounded-xl border bg-white p-6 text-center space-y-3">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900">تم الدفع بنجاح</h1>
          <p className="text-lg font-semibold text-slate-700">Payment Successful</p>
          <p className="text-sm text-slate-500">شكراً لكم — Thank you for your payment</p>
        </div>
      </main>
    )
  }

  if (showNotReady) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="max-w-sm w-full rounded-xl border bg-white p-6 text-center space-y-3">
          <h1 className="text-lg font-bold">Payment Link Not Ready</h1>
          <p className="text-sm text-slate-500">
            The payment link is not ready yet. Please contact us for assistance.
          </p>
        </div>
      </main>
    )
  }

  if (invoices.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50" dir="rtl">
        <div className="max-w-sm w-full rounded-xl border bg-white p-6 text-center space-y-3">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900">تم تسوية جميع الفواتير</h1>
          <p className="text-lg font-semibold text-slate-700">All Invoices Settled</p>
          <p className="text-sm text-slate-500">شكراً لكم — Thank you</p>
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

  const selectedTotal = invoices
    .filter((inv) => selected.has(inv.id))
    .reduce((sum, inv) => sum + inv.total_amount, 0)

  const handlePay = async () => {
    if (selected.size === 0 || !customerPhone) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/payments/dibsy/create-batch-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_ids: Array.from(selected),
          customer_phone: customerPhone,
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

  return (
    <main className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="bg-white border-b px-4 py-4 text-center">
        <h1 className="text-lg font-bold text-slate-900">الفيتري للصيانة</h1>
        <p className="text-xs text-slate-500">Alfaytri Maintenance</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        <p className="text-sm text-slate-600 font-medium">
          الفواتير المستحقة — Outstanding Invoices
        </p>

        {invoices.map((inv) => {
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
                  : 'border-slate-200'
              } ${isClicked && isChecked ? 'bg-orange-50/50' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      {inv.invoice_number}
                    </span>
                    {inv.order_id && (
                      <span className="text-xs text-slate-400">#{inv.order_id}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{formatDate(inv.created_at)}</p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-base font-bold text-slate-900 whitespace-nowrap">
                    {inv.total_amount.toFixed(2)} QAR
                  </span>
                  <div
                    className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 ${
                      isChecked
                        ? 'bg-orange-500 border-orange-500'
                        : 'border-slate-300 bg-white'
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

      {error && (
        <div className="max-w-lg mx-auto px-4 pb-2">
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 bg-white border-t px-4 py-4 safe-area-bottom">
        <div className="max-w-lg mx-auto">
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
