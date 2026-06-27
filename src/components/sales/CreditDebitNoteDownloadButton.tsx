'use client'

/**
 * Credit / Debit Note PDF — View / Download buttons.
 * Replaces the @react-pdf/renderer button — see SoPdfButton.tsx for context.
 *
 * `referenceNumber` and `returnNumber` are now resolved server-side from the
 * note's joins, so these props are kept for backward compatibility with the
 * existing call sites but are no longer used.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Eye, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { CreditNote } from '@/hooks/useCreditNotes'

interface Props {
  note: CreditNote
  /** @deprecated resolved server-side now; kept for call-site compatibility */
  referenceNumber?: string
  /** @deprecated resolved server-side now; kept for call-site compatibility */
  returnNumber?: string
}

async function fetchPdfUrl(noteId: string): Promise<{ url: string; noteId: string }> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not authenticated')
  }
  const res = await fetch(`/api/sales/credit-notes/${noteId}/pdf`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export function CreditDebitNoteDownloadButton({ note }: Props) {
  const [busy, setBusy] = useState<'view' | 'download' | null>(null)
  const prefix = note.note_type === 'credit' ? 'CreditNote' : 'DebitNote'

  async function handleView() {
    if (busy) return
    setBusy('view')
    try {
      const { url } = await fetchPdfUrl(note.id)
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
      const { url, noteId } = await fetchPdfUrl(note.id)
      const pdfRes = await fetch(url)
      if (!pdfRes.ok) throw new Error(`Failed to fetch PDF (${pdfRes.status})`)
      const blob = await pdfRes.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${prefix}-${noteId}.pdf`
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
      <Button variant="outline" size="sm" onClick={handleView} disabled={busy !== null} className="gap-1.5">
        {busy === 'view'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Eye className="h-3.5 w-3.5" />}
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
