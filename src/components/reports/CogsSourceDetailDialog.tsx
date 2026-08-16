'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useProfitLossCogsDetail, type CogsDetailRow } from '@/hooks/reports/useProfitLossCogsDetail'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'
import { cn } from '@/lib/utils'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })

// Cost types that make up the P&L COGS. Sales/landed-costs add cost (red);
// returns/reversals credit it back (green).
const TYPE_META: Record<CogsDetailRow['source_type'], { label: string; cls: string }> = {
  sale:                 { label: 'Sale',        cls: 'border-border text-foreground' },
  sale_return:          { label: 'Return',      cls: 'border-green-300 text-green-600 dark:text-green-400' },
  consumption:          { label: 'Consumption', cls: 'border-blue-300 text-blue-600 dark:text-blue-400' },
  landed_cost:          { label: 'Landed Cost', cls: 'border-orange-300 text-orange-600 dark:text-orange-400' },
  landed_cost_reversal: { label: 'LC Reversal', cls: 'border-green-300 text-green-600 dark:text-green-400' },
}

export function CogsSourceDetailDialog({
  open,
  onOpenChange,
  filters,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  filters: ReportFilters
}) {
  const { data: rows = [], isLoading } = useProfitLossCogsDetail(filters, open)
  const total = rows.reduce((s, r) => s + (r.total_cost ?? 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-5xl 2xl:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Cost of Goods Sold — by entry</DialogTitle>
          <DialogDescription>
            Every cost that flowed through COGS {filters.start} → {filters.end}: customer sales,
            sale returns, internal consumption, and landed-cost adjustments (net). Sums to Total COGS.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Reference</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Division</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Qty</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Cost (QAR)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-3 py-2"><div className="h-3 w-16 animate-pulse rounded bg-muted" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    No cost of goods sold in this period.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const meta = TYPE_META[r.source_type]
                  return (
                    <tr key={r.cogs_id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.date}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={cn('text-[10px] font-normal whitespace-nowrap', meta.cls)}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="max-w-[340px]">
                          <div className="font-medium line-clamp-2" title={r.item_name}>{r.item_name}</div>
                          {r.code && <div className="text-[11px] text-muted-foreground font-mono">{r.code}</div>}
                        </div>
                      </td>
                      <td className="hidden px-3 py-2 sm:table-cell whitespace-nowrap">
                        {r.reference ?? '—'}
                        {r.counterparty && <span className="ml-1 text-[11px] text-muted-foreground">{r.counterparty}</span>}
                      </td>
                      <td className="hidden px-3 py-2 md:table-cell whitespace-nowrap">{r.division_name ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.qty}</td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular-nums whitespace-nowrap',
                          (r.total_cost ?? 0) < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                        )}
                      >
                        {QAR.format(r.total_cost ?? 0)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="sticky bottom-0 bg-muted/60 backdrop-blur">
                <tr className="border-t-2 border-foreground/20">
                  <td colSpan={6} className="px-3 py-2 font-semibold">Total COGS</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap">
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
