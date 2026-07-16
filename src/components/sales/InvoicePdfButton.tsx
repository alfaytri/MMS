'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Eye, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { ArInvoice } from '@/types/invoice'

interface Props {
  invoice: ArInvoice
}

async function fetchPdfUrl(invoiceId: string): Promise<{ url: string; invoiceId: string }> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not authenticated')
  }
  const res = await fetch(`/api/sales/invoices/${invoiceId}/pdf`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export function InvoicePdfButton({ invoice }: Props) {
  const [busy, setBusy] = useState<'view' | 'download' | null>(null)

  async function handleView() {
    if (busy) return
    setBusy('view')
    try {
      const { url } = await fetchPdfUrl(invoice.id)
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
      const { url, invoiceId } = await fetchPdfUrl(invoice.id)
      const pdfRes = await fetch(url)
      if (!pdfRes.ok) throw new Error(`Failed to fetch PDF (${pdfRes.status})`)
      const blob = await pdfRes.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `Invoice-${invoiceId}.pdf`
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
