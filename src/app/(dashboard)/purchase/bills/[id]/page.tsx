'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useBillViewModel } from '@/hooks/useSupplierBills'
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
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { data: viewModel } = useBillViewModel(id)

  async function generatePdf() {
    setLoading(true)
    setError(null)
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
      setPdfUrl(json.url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate bill PDF'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) generatePdf()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once effect; generatePdf is a local function recreated every render
  }, [id])

  const bill = viewModel?.bill
  const paymentStatus = bill?.payment_status ?? 'unpaid'

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Slim toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/purchase/bills')}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          {bill && (
            <>
              <span className="text-sm font-mono font-bold">{bill.bill_number}</span>
              <Badge className={cn('text-xs', PAY_STATUS_COLORS[paymentStatus] ?? '')}>
                {paymentStatus.replace(/_/g, ' ')}
              </Badge>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => generatePdf()}
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
            Generating bill PDF…
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={() => generatePdf()}>
              Retry
            </Button>
          </div>
        )}
        {pdfUrl && !loading && (
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title="Purchase Bill PDF"
          />
        )}
      </div>
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
