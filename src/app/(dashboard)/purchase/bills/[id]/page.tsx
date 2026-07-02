'use client'

import { useState, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Loader2, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useBillViewModel, useBillsByPO, useMarkBillPaymentStatus } from '@/hooks/useSupplierBills'
import { AttachBillDialog } from '@/components/purchase/AttachBillDialog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const PAY_STATUS_COLORS: Record<string, string> = {
  unpaid:         'bg-slate-100 text-slate-600',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid:           'bg-green-100 text-green-700',
  overdue:        'bg-red-100 text-red-700',
}

function BillDetailContent() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const [printing, setPrinting] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const markPaid = useMarkBillPaymentStatus()

  const { data: viewModel, isLoading, isError } = useBillViewModel(id)
  const { data: relatedBills = [] } = useBillsByPO(
    viewModel?.bill.purchase_order_id ?? null
  )

  async function handlePrint() {
    if (printing) return
    setPrinting(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch(`/api/purchase/bills/${id}/pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const json = await res.json() as { url: string }
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate bill PDF')
    } finally {
      setPrinting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
        Loading bill…
      </div>
    )
  }

  if (isError || !viewModel) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Bill not found.</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/purchase/bills')}>
          Back to Bills
        </Button>
      </div>
    )
  }

  const { bill, payments } = viewModel
  const po = bill.purchase_orders
  const currency = po?.currency ?? 'QAR'
  const totalPaid = payments.reduce((s, p) => s + (p.amount ?? 0), 0)
  const balance = (bill.total_amount ?? 0) - totalPaid

  return (
    <div className="min-h-screen bg-muted/30 p-4 lg:p-8">
      {/* Header bar */}
      <div className="max-w-3xl mx-auto mb-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/purchase/bills')}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          {bill.payment_status !== 'paid' && (
            <Button size="sm" variant="outline" onClick={() => setAttachOpen(true)}>
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Attach Payment
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={handlePrint}
            disabled={printing}
          >
            {printing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <Printer className="h-3.5 w-3.5 mr-1.5" />}
            Print Bill
          </Button>
        </div>
      </div>

      {/* Bill summary card */}
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-lg border p-6 lg:p-8 space-y-5">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold font-mono">{bill.invoice_id}</h1>
            {po && (
              <p className="text-sm text-muted-foreground mt-0.5">
                PO: {po.po_number} · {formatDate(po.created_date)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn('text-xs', PAY_STATUS_COLORS[bill.payment_status] ?? '')}>
              {bill.payment_status.replace(/_/g, ' ')}
            </Badge>
            {bill.payment_status !== 'paid' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => markPaid.mutate({ billId: bill.id, status: 'paid' })}
                disabled={markPaid.isPending}
              >
                {markPaid.isPending ? 'Marking…' : 'Mark as Paid'}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => markPaid.mutate({ billId: bill.id, status: 'unpaid' })}
                disabled={markPaid.isPending}
              >
                {markPaid.isPending ? 'Updating…' : 'Mark as Unpaid'}
              </Button>
            )}
          </div>
        </div>

        {/* Related bills */}
        {relatedBills.length > 1 && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-2 text-sm text-amber-800 flex flex-wrap items-center gap-2">
            <span className="font-medium">This PO has {relatedBills.length} bills:</span>
            {relatedBills.map((b) => (
              <button
                key={b.id}
                onClick={() => router.push(`/purchase/bills/${b.id}`)}
                className={cn(
                  'font-mono hover:underline underline-offset-2',
                  b.id === id ? 'font-bold' : 'text-amber-700'
                )}
              >
                {b.invoice_id}
              </button>
            ))}
          </div>
        )}

        {/* Key details grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Supplier</p>
            <p className="font-medium">{bill.suppliers?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Due Date</p>
            <p className="font-medium">{formatDate(bill.due_date)}</p>
          </div>
          {bill.source_label && (
            <div>
              <p className="text-muted-foreground text-xs">Supplier Ref</p>
              <p className="font-medium font-mono">{bill.source_label}</p>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="border-t pt-4">
          <div className="flex justify-end">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Grand Total:</span>
                <span className="font-bold">{formatCurrency(bill.total_amount, currency)}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Total Paid:</span>
                <span className="font-medium">{formatCurrency(totalPaid, currency)}</span>
              </div>
              <div className={cn(
                'flex justify-between font-bold',
                balance > 0 ? 'text-red-600' : 'text-green-600'
              )}>
                <span>Balance:</span>
                <span>{formatCurrency(balance, currency)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Line items count */}
        <div className="border-t pt-4 text-sm text-muted-foreground">
          {(bill.invoice_line_items ?? []).length} line item{(bill.invoice_line_items ?? []).length !== 1 ? 's' : ''} ·
          {' '}{payments.length} payment{payments.length !== 1 ? 's' : ''} linked
        </div>
      </div>

      <AttachBillDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        mode="link-payment"
        billId={bill.id}
        supplierId={bill.supplier_id ?? undefined}
      />
    </div>
  )
}

export default function BillDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <BillDetailContent />
    </Suspense>
  )
}
