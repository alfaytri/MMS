'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Eye, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
interface Props {
  note: { id: string }
  noteKind?: 'credit' | 'debit'
  /** @deprecated resolved server-side now; kept for call-site compatibility */
  referenceNumber?: string
  /** @deprecated resolved server-side now; kept for call-site compatibility */
  returnNumber?: string
}

async function fetchPdfUrl(noteId: string, noteKind: 'credit' | 'debit'): Promise<{ url: string; noteId: string }> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not authenticated')
  }
  const qs = noteKind === 'debit' ? '?noteType=debit' : ''
  const res = await fetch(`/api/sales/credit-notes/${noteId}/pdf${qs}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export function CreditDebitNoteDownloadButton({ note, noteKind = 'credit' }: Props) {
  const [busy, setBusy] = useState<'generate' | 'download' | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const prefix = noteKind === 'credit' ? 'CreditNote' : 'DebitNote'

  async function handleGenerate() {
    if (busy) return
    setBusy('generate')
    try {
      const { url } = await fetchPdfUrl(note.id, noteKind)
      setPdfUrl(url)
      toast.success('PDF generated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally {
      setBusy(null)
    }
  }

  function handleView() {
    if (pdfUrl) window.open(pdfUrl, '_blank', 'noopener,noreferrer')
  }

  async function handleDownload() {
    if (!pdfUrl || busy) return
    setBusy('download')
    try {
      const pdfRes = await fetch(pdfUrl)
      if (!pdfRes.ok) throw new Error(`Failed to fetch PDF (${pdfRes.status})`)
      const blob = await pdfRes.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${prefix}-${note.id}.pdf`
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

  if (!pdfUrl) {
    return (
      <Button variant="outline" size="sm" onClick={handleGenerate} disabled={busy !== null} className="gap-1.5">
        {busy === 'generate'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Eye className="h-3.5 w-3.5" />}
        {busy === 'generate' ? 'Generating...' : 'Generate PDF'}
      </Button>
    )
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleView} className="gap-1.5">
        <Eye className="h-3.5 w-3.5" />
        View PDF
      </Button>
      <Button variant="outline" size="sm" onClick={handleDownload} disabled={busy !== null} className="gap-1.5">
        {busy === 'download'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Download className="h-3.5 w-3.5" />}
        Download
      </Button>
    </>
  )
}
