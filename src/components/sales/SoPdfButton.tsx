'use client'

/**
 * SO Quotation PDF — View / Download buttons.
 *
 * Replaces the old @react-pdf/renderer-based PDFDownloadLink (which crashed on
 * Next 15's React 19-canary internals). Now hits the server route, which
 * generates the PDF via Puppeteer if needed and returns a cached URL.
 *
 * View    → opens the PDF in a new tab (storage URL is public).
 * Download → downloads the PDF as a blob with a clean filename.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Eye, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { SaleOrder } from '@/hooks/useSaleOrders'

interface SoPdfButtonProps {
  so: SaleOrder
}

interface PdfResult {
  url:        string
  storageKey: string
  soNumber:   string
}

async function fetchPdfUrl(soId: string): Promise<PdfResult> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not authenticated')
  }
  const res = await fetch(`/api/sales/so/${soId}/quotation-pdf`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export function SoPdfButton({ so }: SoPdfButtonProps) {
  const [busy, setBusy] = useState<'view' | 'download' | null>(null)

  async function handleView() {
    if (busy) return
    setBusy('view')
    try {
      const { url } = await fetchPdfUrl(so.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open PDF')
    } finally {
      setBusy(null)
    }
  }

  async function handleDownload() {
    if (busy) return
    setBusy('download')
    try {
      const { url, soNumber } = await fetchPdfUrl(so.id)
      const pdfRes = await fetch(url)
      if (!pdfRes.ok) throw new Error(`Failed to fetch PDF (${pdfRes.status})`)
      const blob = await pdfRes.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `Quotation-${soNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download PDF')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleView} disabled={busy !== null}>
        {busy === 'view'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Eye className="h-3.5 w-3.5" />}
        <span className="ml-1.5">View PDF</span>
      </Button>
      <Button variant="outline" size="sm" onClick={handleDownload} disabled={busy !== null}>
        {busy === 'download'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Download className="h-3.5 w-3.5" />}
        <span className="ml-1.5">Download</span>
      </Button>
    </>
  )
}
