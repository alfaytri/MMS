// src/components/quotations/QuotationPdfPreviewIframe.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type { QuotationDraft } from '@/types/quotations'

interface PreviewLineItem {
  name:      string
  pathLabel: string
  qty:       number
  unitPrice: number
  subtotal:  number
}

interface PreviewBody {
  quotationNumber: string
  customerName:    string
  customerPhone:   string
  services:        PreviewLineItem[]
  subtotal:        number
  discount:        number
  total:           number
  notes:           string
  preparedBy:      string
  issuingDate:     string
  validUntilDate:  string
  validityDays:    number
}

// Admin-configurable validity (days). Same cache key as the legacy component
// so we share the cache.
function useQuotationValidityDays() {
  return useQuery<number>({
    queryKey: ['app_settings', 'order_quotation_validity_days'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'order_quotation_validity_days')
        .maybeSingle()
      const days = Number((data?.value as { days?: number } | null)?.days)
      return Number.isFinite(days) && days > 0 ? days : 30
    },
  })
}

interface Props {
  draft:          QuotationDraft
  subtotal:       number
  discountAmount: number
  total:          number
  creatorName:    string | null
  // Optional pre-formatted dates — pass these when previewing an already-saved
  // quotation so the iframe shows its original issuing/expiry dates instead of
  // today's. Falls back to today + (today + validityDays) when omitted (the
  // editor's "new" / "in-progress" case).
  issuingDate?:    string
  validUntilDate?: string
}

export function QuotationPdfPreviewIframe({
  draft,
  subtotal,
  discountAmount,
  total,
  creatorName,
  issuingDate: issuingDateProp,
  validUntilDate: validUntilProp,
}: Props) {
  const { data: validityDays = 30 } = useQuotationValidityDays()

  const today = format(new Date(), 'dd MMM yyyy')
  const validUntil = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + validityDays)
    return format(d, 'dd MMM yyyy')
  }, [validityDays])

  const issuingDate    = issuingDateProp || today
  const validUntilDate = validUntilProp  || validUntil

  // Pack the body into a stable, memoised value so we only refetch when
  // something the user actually edits changes.
  const body: PreviewBody = useMemo(() => ({
    quotationNumber: draft.quotationId || '',
    customerName:    draft.customerName || '',
    customerPhone:   draft.phone || '',
    services: draft.services.map((s) => ({
      name:      s.name,
      pathLabel: s.path.length > 1 ? s.path.slice(0, -1).join(' › ') : '',
      qty:       s.qty,
      unitPrice: s.price,
      subtotal:  s.qty * s.price,
    })),
    subtotal,
    discount:    discountAmount,
    total,
    notes:       draft.notes || '',
    preparedBy:  creatorName || '',
    issuingDate,
    validUntilDate,
    validityDays,
  }), [draft, subtotal, discountAmount, total, creatorName, issuingDate, validUntilDate, validityDays])

  const [html, setHtml] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  // Bump on each request; only the latest response is applied so a slow
  // request can't overwrite a newer one.
  const requestSeq = useRef(0)

  useEffect(() => {
    const seq = ++requestSeq.current
    setIsLoading(true)

    // Debounce so typing in a quantity input doesn't fire on every keystroke.
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

        const res = await fetch('/api/quotations/preview-html', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        })
        if (!res.ok) return
        const text = await res.text()
        if (seq === requestSeq.current) setHtml(text)
      } catch {
        // Keep the previous HTML on failure so the preview doesn't blank out.
      } finally {
        if (seq === requestSeq.current) setIsLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [body])

  return (
    <div className="relative flex h-full items-start justify-center overflow-y-auto bg-slate-100 p-6">
      <div
        className="relative bg-white shadow-xl"
        style={{ width: '210mm', minHeight: '297mm' }}
      >
        <iframe
          title="Quotation preview"
          srcDoc={html}
          sandbox="allow-same-origin"
          className="block h-full w-full border-0"
          style={{ width: '210mm', minHeight: '297mm' }}
        />
        {isLoading && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white">
            Updating…
          </div>
        )}
      </div>
    </div>
  )
}
