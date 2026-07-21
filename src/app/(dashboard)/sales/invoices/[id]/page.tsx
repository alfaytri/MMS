'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Loader2, RefreshCw, Send, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AttachInvoiceDialog } from '@/components/sales/AttachInvoiceDialog'
import { useUnlinkedIncomingPayments } from '@/hooks/useUnlinkedIncomingPayments'
import { useCustomerInvoice, useSendInvoice } from '@/hooks/useCustomerInvoices'
import { useCustomerPayments } from '@/hooks/useCustomerPayments'
import { PaymentPlanDialog, AR_LABELS } from '@/components/finance/PaymentPlanDialog'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const PAY_STATUS_COLORS: Record<string, string> = {
  unpaid:         'bg-slate-100 text-slate-600',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid:           'bg-green-100 text-green-700',
  overdue:        'bg-red-100 text-red-700',
}

const DOC_STATUS_COLORS: Record<string, string> = {
  draft:         'bg-slate-50 text-slate-500 border-slate-200',
  ready_to_send: 'bg-blue-50 text-blue-600 border-blue-200',
  sent:          'bg-green-50 text-green-600 border-green-200',
}

function InvoiceDetailContent() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)

  const { data: invoice } = useCustomerInvoice(id)
  const { data: payments = [] } = useCustomerPayments(id)
  const { data: unlinkedPayments = [], isLoading: loadingUnlinked } = useUnlinkedIncomingPayments(
    invoice?.customer_id ?? ''
  )
  const sendInvoice = useSendInvoice()

  const hasUnlinkedPayments = unlinkedPayments.length > 0
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const outstanding = (invoice?.total_amount ?? 0) - totalPaid
  const paymentStatus = invoice?.payment_status ?? 'unpaid'
  const docStatus = invoice?.doc_status ?? 'draft'

  async function generatePdf(force = false) {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const qs = force ? '?force=true' : ''
      const res = await fetch(`/api/sales/invoices/${id}/pdf${qs}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const json = await res.json() as { url: string }
      setPdfUrl(json.url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate PDF'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) generatePdf()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-white shrink-0 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => router.push('/sales/invoices')}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          {invoice && (
            <>
              <span className="text-sm font-mono font-bold">{invoice.invoice_id}</span>
              <Badge className={cn('text-xs border', DOC_STATUS_COLORS[docStatus] ?? '')}>
                {docStatus.replace(/_/g, ' ')}
              </Badge>
              <Badge className={cn('text-xs', PAY_STATUS_COLORS[paymentStatus] ?? '')}>
                {paymentStatus.replace(/_/g, ' ')}
              </Badge>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {invoice && docStatus === 'ready_to_send' && (
            <Button
              size="sm"
              disabled={sendInvoice.isPending}
              onClick={() => sendInvoice.mutate(invoice.id, {
                onSuccess: () => toast.success('Invoice marked as sent'),
                onError: () => toast.error('Failed to mark as sent'),
              })}
            >
              <Send className="h-4 w-4 mr-1.5" />
              {sendInvoice.isPending ? 'Sending…' : 'Send'}
            </Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingUnlinked || !hasUnlinkedPayments}
                    onClick={() => setAttachOpen(true)}
                  >
                    <Link2 className="h-4 w-4 mr-1.5" />
                    Attach Payment
                  </Button>
                </span>
              </TooltipTrigger>
              {!hasUnlinkedPayments && (
                <TooltipContent>No unlinked payments for this customer</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {invoice && paymentStatus !== 'paid' && (
            <Button variant="outline" size="sm" onClick={() => setPlanOpen(true)}>
              Payment Plan
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => generatePdf(true)}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
            Refresh
          </Button>
          {pdfUrl && (
            <Button
              size="sm"
              onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              Open PDF
            </Button>
          )}
        </div>
      </div>

      {/* PDF viewer area */}
      <div className="flex-1 bg-muted/40">
        {loading && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Generating invoice PDF…
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={() => generatePdf(true)}>
              Retry
            </Button>
          </div>
        )}
        {pdfUrl && !loading && (
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title="Sales Invoice PDF"
          />
        )}
      </div>

      {planOpen && invoice && (
        <PaymentPlanDialog
          open
          onOpenChange={setPlanOpen}
          invoiceId={invoice.id}
          outstanding={outstanding}
          labels={AR_LABELS}
        />
      )}
      {attachOpen && invoice && (
        <AttachInvoiceDialog
          open
          onOpenChange={(o) => { setAttachOpen(o); if (!o) generatePdf(true) }}
          invoiceId={invoice.id}
          customerId={invoice.customer_id}
          invoicePaid={invoice.payment_status === 'paid'}
        />
      )}
    </div>
  )
}

export default function InvoiceDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <InvoiceDetailContent />
    </Suspense>
  )
}
