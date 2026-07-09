'use client'

/**
 * AR Invoice PDF — View / Download buttons.
 * Replaces the @react-pdf/renderer button — see SoPdfButton.tsx for context.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Eye, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PdfDivisionPicker } from '@/components/shared/PdfDivisionPicker'
import type { ArInvoice } from '@/types/invoice'

interface Props {
  invoice: ArInvoice
  // amountPaid / outstanding are computed server-side now, kept in the prop
  // signature so existing call sites don't need to change.
  amountPaid?:  number
  outstanding?: number
}

async function fetchPdfUrl(invoiceId: string, divisionId: string): Promise<{ url: string; invoiceId: string }> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not authenticated')
  }
  const params = new URLSearchParams()
  params.set('divisionId', divisionId)
  const res = await fetch(`/api/sales/invoices/${invoiceId}/pdf?${params}`, {
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerAction, setPickerAction] = useState<'view' | 'download' | null>(null)

  function handleView() {
    setPickerAction('view')
    setPickerOpen(true)
  }

  function handleDownload() {
    setPickerAction('download')
    setPickerOpen(true)
  }

  async function handlePickerConfirm(divisionId: string) {
    setPickerOpen(false)
    const action = pickerAction
    setPickerAction(null)
    if (!action || busy) return

    setBusy(action)
    try {
      if (action === 'view') {
        const { url } = await fetchPdfUrl(invoice.id, divisionId)
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        const { url, invoiceId } = await fetchPdfUrl(invoice.id, divisionId)
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
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : action === 'view' ? 'Failed to open PDF' : 'Failed to download PDF')
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
      <PdfDivisionPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onConfirm={handlePickerConfirm}
        loading={busy !== null}
      />
    </>
  )
}
