// src/components/quotations/QuotationPdfPreview.tsx
'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { QuotationDraft } from '@/types/quotations'

interface DivisionRecord {
  id: string
  name: string
  name_ar: string | null
  address_en: string | null
  logo_url: string | null
  stamp_url: string | null
  default_currency: string | null
}

function useDivisionBySlug(slug: string | null) {
  return useQuery<DivisionRecord | null>({
    queryKey: ['division-by-slug', slug],
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('divisions')
        .select('id, name, name_ar, address_en, logo_url, stamp_url, default_currency')
        .eq('slug', slug)
        .single()
      if (error) return null
      return data as DivisionRecord
    },
  })
}

interface Props {
  draft: QuotationDraft
  total: number
}

export function QuotationPdfPreview({ draft, total }: Props) {
  const { data: division } = useDivisionBySlug(draft.division || null)
  const currency = division?.default_currency ?? 'QAR'
  const today = format(new Date(), 'dd MMM yyyy')

  const expiryDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return format(d, 'dd MMM yyyy')
  })()

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto bg-slate-100 p-6">
      <div
        className="w-full max-w-2xl rounded bg-white shadow-xl"
        style={{ minHeight: '297mm' }}
      >
        <div className="p-10 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              {division?.logo_url ? (
                <img
                  src={division.logo_url}
                  alt={division.name}
                  className="h-12 w-auto object-contain"
                />
              ) : (
                <div className="text-lg font-bold text-slate-900">
                  {division?.name ?? '—'}
                </div>
              )}
              {division?.address_en && (
                <p className="text-xs text-slate-500">{division.address_en}</p>
              )}
            </div>
            <div className="text-right space-y-0.5">
              <p className="text-2xl font-bold tracking-tight text-slate-900 uppercase">
                Quotation
              </p>
              <p className="text-sm font-mono text-slate-700">
                {draft.quotationId || '—'}
              </p>
              <p className="text-xs text-slate-500">Date: {today}</p>
              <p className="text-xs text-slate-500">Valid Until: {expiryDate}</p>
            </div>
          </div>

          <div className="border-t border-slate-200" />

          {/* Bill To */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Bill To
            </p>
            {draft.customerName ? (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  {draft.customerName}
                </p>
                <p className="text-sm text-slate-500">{draft.phone}</p>
              </>
            ) : (
              <p className="text-sm text-slate-300 italic">
                Customer will appear here after selection
              </p>
            )}
          </div>

          {/* Line Items Table */}
          <div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border border-slate-200">
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">
                    Service
                  </th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-700 w-16">
                    Qty
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700 w-28">
                    Price
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700 w-28">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.services.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-slate-300 italic border border-slate-100"
                    >
                      Add services from the left panel
                    </td>
                  </tr>
                ) : (
                  draft.services.map((s, i) => (
                    <tr
                      key={`${s.serviceId}-${i}`}
                      className="border border-slate-100 even:bg-slate-50/50"
                    >
                      <td className="px-3 py-2 text-slate-800">
                        <p className="font-medium">{s.name}</p>
                        {s.path.length > 1 && (
                          <p className="text-[11px] text-slate-400">
                            {s.path.slice(0, -1).join(' › ')}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-700">
                        {s.qty}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {currency} {s.price.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700 font-medium">
                        {currency} {(s.price * s.qty).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border border-slate-200 bg-slate-50">
                  <td
                    colSpan={3}
                    className="px-3 py-2 text-right font-bold text-slate-900 uppercase text-sm"
                  >
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-900">
                    {currency} {total.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          {draft.notes && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Notes
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {draft.notes}
              </p>
            </div>
          )}

          <p className="text-xs text-slate-400 italic">
            Valid for 30 days from issue date.
          </p>

          {/* Footer */}
          <div className="flex items-end justify-between pt-8 border-t border-slate-100">
            {division?.stamp_url ? (
              <img
                src={division.stamp_url}
                alt="stamp"
                className="h-16 w-auto object-contain opacity-80"
              />
            ) : (
              <div />
            )}
            <p className="text-sm text-slate-400">Thank you for choosing us.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
