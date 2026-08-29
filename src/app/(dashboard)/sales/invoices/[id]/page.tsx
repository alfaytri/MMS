'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer, Loader2, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCustomerInvoice } from '@/hooks/useCustomerInvoices'
import { useWarrantyRecordsForDelivery } from '@/hooks/useWarrantyRecordsForDelivery'
import { useSaleOrder } from '@/hooks/useSaleOrders'
import { useHasPermission } from '@/hooks/usePermissions'
import { SoPaymentDialog } from '@/components/sales/SoPaymentDialog'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const PAY_STATUS_COLORS: Record<string, string> = {
  unpaid:         'bg-slate-100 text-slate-600',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid:           'bg-green-100 text-green-700',
  overdue:        'bg-red-100 text-red-700',
}

function InvoiceDetailContent() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { data: invoice } = useCustomerInvoice(id)

  const paymentStatus = invoice?.payment_status ?? 'unpaid'

  // Record-payment parity with the SO view: load the invoice's sale order and
  // reuse SoPaymentDialog. Only SO-backed invoices (not contract/quotation) can
  // record here — the dialog is SO-specific.
  const canManagePayments = useHasPermission('sales.payments.manage')
  const { data: saleOrder } = useSaleOrder(invoice?.sale_order_id ?? null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const canRecordPayment = canManagePayments && !!saleOrder && paymentStatus !== 'paid'

  // so_invoices doesn't carry sale_delivery_id directly (source is
  // 'sale_order' | 'contract' | 'quotation'), so we resolve via the invoice's
  // sale_order_id: pick the newest delivery under that SO that produced any
  // warranty coverage. Good enough for MVP — Phase 2 can add a picker if
  // an SO ever needs per-delivery certificate splitting.
  const { data: linkedDeliveryId } = useQuery({
    queryKey: ['invoice-warranty-delivery-id', id],
    queryFn: async () => {
      if (!id) return null
      const supabase = createClient()
      const { data: inv, error: invErr } = await supabase
        .from('so_invoices')
        .select('sale_order_id')
        .eq('id', id)
        .maybeSingle()
      if (invErr) throw invErr
      if (!inv?.sale_order_id) return null

      const { data: records, error: recErr } = await supabase
        .from('warranty_records')
        .select('sale_delivery_lines!inner(sale_delivery_id, sale_deliveries!inner(id, date))')
        .eq('sale_order_id', inv.sale_order_id)
        .limit(200)
      if (recErr) throw recErr

      type Row = { sale_delivery_lines: { sale_delivery_id: string; sale_deliveries: { id: string; date: string | null } | null } | null }
      const rows = (records ?? []) as unknown as Row[]
      // Newest delivery first
      const sorted = rows
        .map((r) => r.sale_delivery_lines?.sale_deliveries)
        .filter((d): d is { id: string; date: string | null } => !!d)
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      return sorted[0]?.id ?? null
    },
    enabled: !!id,
    staleTime: 60_000,
  })
  const { data: warrantyRecords = [] } = useWarrantyRecordsForDelivery(linkedDeliveryId ?? null)
  const [warrantyBusy, setWarrantyBusy] = useState(false)

  async function handlePrintWarranty() {
    if (warrantyBusy || !linkedDeliveryId) return
    setWarrantyBusy(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch(`/api/sales/deliveries/${linkedDeliveryId}/warranty-certificate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate certificate')
    } finally {
      setWarrantyBusy(false)
    }
  }

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
              <Badge className={cn('text-xs', PAY_STATUS_COLORS[paymentStatus] ?? '')}>
                {paymentStatus.replace(/_/g, ' ')}
              </Badge>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canRecordPayment && (
            <Button size="sm" onClick={() => setPaymentOpen(true)}>
              <Wallet className="h-3.5 w-3.5 mr-1.5" />
              Record Payment
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
          {warrantyRecords.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrintWarranty}
              disabled={warrantyBusy}
            >
              {warrantyBusy
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />}
              {warrantyBusy ? 'Generating…' : 'Warranty Certificate'}
            </Button>
          )}
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

      {/* Record customer payment — reuses the SO view's dialog (S2 parity). */}
      {saleOrder && (
        <SoPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} so={saleOrder} />
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
