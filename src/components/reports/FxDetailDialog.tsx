'use client'

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useProfitLossFxDetail, type FxDetailRow } from '@/hooks/reports/useProfitLossFxDetail'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'
import { cn } from '@/lib/utils'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })

/** Where "open document" points, per doc type. PO/SO deep-link into their list
 * pages via a query param the list reads into its search box; Bill/Invoice have
 * their own detail routes. */
function docHref(r: FxDetailRow): string | null {
  switch (r.doc_type) {
    case 'Purchase Order': return r.doc_number ? `/purchase/orders?po=${encodeURIComponent(r.doc_number)}` : null
    case 'Sale Order':     return r.doc_number ? `/sales/orders?so=${encodeURIComponent(r.doc_number)}` : null
    case 'Bill':           return r.doc_id ? `/purchase/bills/${r.doc_id}` : null
    case 'Invoice':        return r.doc_id ? `/sales/invoices/${r.doc_id}` : null
    default:               return null
  }
}

export function FxDetailDialog({
  open,
  onOpenChange,
  filters,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  filters: ReportFilters
}) {
  const { data: rows = [], isLoading } = useProfitLossFxDetail(filters, open)
  const total = rows.reduce((s, r) => s + (r.net_fx ?? 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-3xl">
        <DialogHeader>
          <DialogTitle>Exchange Gain / Loss — by document</DialogTitle>
          <DialogDescription>
            Realized FX from payments settled {filters.start} → {filters.end}. Open a document to confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Date</th>
                <th className="px-3 py-2 font-medium">Document</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Counterparty</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Currency</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">FX (QAR)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-3 py-2"><div className="h-3 w-20 animate-pulse rounded bg-muted" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                    No exchange gain/loss in this period.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const href = docHref(r)
                  const label = r.doc_number ?? r.doc_type
                  return (
                    <tr key={r.payment_id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.payment_date}</td>
                      <td className="px-3 py-2">
                        {href ? (
                          <Link
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            {label}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </Link>
                        ) : (
                          <span className="font-medium">{label}</span>
                        )}
                        <span className="ml-1 text-[11px] text-muted-foreground">{r.doc_type}</span>
                      </td>
                      <td className="hidden px-3 py-2 sm:table-cell">{r.counterparty ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.currency ?? '—'}</td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular-nums whitespace-nowrap',
                          (r.net_fx ?? 0) < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                        )}
                      >
                        {QAR.format(r.net_fx ?? 0)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="sticky bottom-0 bg-muted/60 backdrop-blur">
                <tr className="border-t-2 border-foreground/20">
                  <td colSpan={4} className="px-3 py-2 font-semibold">Net Exchange Gain / Loss</td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap',
                      total < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    {QAR.format(total)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
