'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Printer, Download, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PdfDivisionPicker } from '@/components/shared/PdfDivisionPicker'
import type { PoPdfVariant } from '@/lib/purchase/generate-po-pdf'

interface Props {
  poId:             string
  poNumber:         string
  variant:          PoPdfVariant
  snapshotVersion?: number
}

const FILENAME_PREFIX: Record<PoPdfVariant, string> = {
  rfq:       'RFQ',
  draft:     'Draft-PO',
  po:        'PO',
  confirmed: 'Confirmed-PO',
}

async function fetchPdf(
  poId:            string,
  variant:         PoPdfVariant,
  snapshotVersion: number | undefined,
  divisionId:      string,
): Promise<{ url: string; filename: string; isBlob: boolean }> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  const params = new URLSearchParams()
  params.set('variant', variant)
  params.set('divisionId', divisionId)
  if (snapshotVersion !== undefined) params.set('snapshotVersion', String(snapshotVersion))

  const res = await fetch(`/api/purchase/po/${poId}/pdf?${params}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/pdf')) {
    const blob = await res.blob()
    const disposition = res.headers.get('content-disposition') ?? ''
    const nameMatch = /filename="([^"]+)"/.exec(disposition)
    const filename = nameMatch?.[1] ?? `snapshot.pdf`
    return { url: URL.createObjectURL(blob), filename, isBlob: true }
  }

  const json = await res.json()
  return {
    url:      json.url,
    filename: '',
    isBlob:   false,
  }
}

export function PoPdfButton({ poId, poNumber, variant, snapshotVersion }: Props) {
  const [busy, setBusy] = useState<'print' | 'download' | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerAction, setPickerAction] = useState<'print' | 'download' | null>(null)

  function liveFilename(): string {
    return `${FILENAME_PREFIX[variant]}-${poNumber}.pdf`
  }

  function handlePrint() {
    setPickerAction('print')
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
      if (action === 'print') {
        const { url, isBlob } = await fetchPdf(poId, variant, snapshotVersion, divisionId)
        window.open(url, '_blank', 'noopener,noreferrer')
        if (isBlob) {
          setTimeout(() => URL.revokeObjectURL(url), 60_000)
        }
      } else {
        const { url, filename, isBlob } = await fetchPdf(poId, variant, snapshotVersion, divisionId)

        let objectUrl: string
        let name: string
        let toRevoke: string | null = null

        if (isBlob) {
          objectUrl = url
          name      = filename
          toRevoke  = url
        } else {
          const pdfRes = await fetch(url)
          if (!pdfRes.ok) throw new Error(`Failed to fetch PDF (${pdfRes.status})`)
          const blob = await pdfRes.blob()
          objectUrl = URL.createObjectURL(blob)
          name      = liveFilename()
          toRevoke  = objectUrl
        }

        const a = document.createElement('a')
        a.href = objectUrl
        a.download = name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        if (toRevoke) URL.revokeObjectURL(toRevoke)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : action === 'print' ? 'Failed to generate PDF' : 'Failed to download PDF')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handlePrint} disabled={busy !== null}>
        {busy === 'print'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          : <Printer className="h-3.5 w-3.5 mr-1.5" />}
        Print
      </Button>
      <Button variant="outline" size="sm" onClick={handleDownload} disabled={busy !== null}>
        {busy === 'download'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          : <Download className="h-3.5 w-3.5 mr-1.5" />}
        Download
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
