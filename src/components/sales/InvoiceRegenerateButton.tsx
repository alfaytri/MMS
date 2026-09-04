'use client'

import { useState } from 'react'
import type { MouseEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { RefreshCw, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'

/**
 * Compact force-regenerate for an invoice PDF, surfaced on the invoices list
 * next to the "needs review" ⚠. Bypasses the cached PDF (?force=true), which
 * re-renders it and — via set_invoice_pdf_url — clears needs_refresh; then
 * refetches the list so the ⚠ disappears.
 */
export function InvoiceRegenerateButton({ invoiceId }: { invoiceId: string }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function handle(e: MouseEvent) {
    e.stopPropagation() // don't trigger the row's navigate-to-detail
    if (busy) return
    setBusy(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const res = await fetch(`/api/sales/invoices/${invoiceId}/pdf?force=true`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      qc.invalidateQueries({ queryKey: queryKeys.invoices.all })
      toast.success('PDF regenerated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="ghost" size="sm"
      className="h-6 px-1.5 gap-1 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-800"
      onClick={handle} disabled={busy}
      title="Invoice changed — regenerate its PDF"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
      Regenerate
    </Button>
  )
}
