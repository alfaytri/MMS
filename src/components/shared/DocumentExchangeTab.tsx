'use client'

import { useState } from 'react'
import { BookedRateLockRow } from './BookedRateLockRow'
import { ChangeBookedRateDialog } from './ChangeBookedRateDialog'
import { useDocumentExchangeSummary } from '@/hooks/useDocumentExchangeSummary'
import {
  useExchangeRateChangeLog,
  type DocumentType,
} from '@/hooks/useExchangeRateChangeLog'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

function fmt(n: number, code?: string) {
  const prefix = code ? `${code} ` : ''
  return `${prefix}${n.toLocaleString('en-QA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function DocumentExchangeTab({
  documentType,
  documentId,
}: {
  documentType: DocumentType
  documentId: string
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { data: summary, isLoading } = useDocumentExchangeSummary(
    documentType,
    documentId,
  )
  const { data: history = [] } = useExchangeRateChangeLog(
    documentType,
    documentId,
  )

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground min-h-[240px]">
        Loading…
      </div>
    )
  }
  if (!summary || summary.currency === 'QAR') {
    return (
      <div className="p-4 text-sm text-muted-foreground min-h-[240px]">
        This document is in QAR — no exchange gain/loss applies.
      </div>
    )
  }

  return (
    <div className="p-4 space-y-5 min-h-[400px]">
      {/* Booking */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Booking
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm max-w-xl">
          <div>Currency</div>
          <div className="font-medium">{summary.currency}</div>
          <div>Booked value ({summary.currency})</div>
          <div className="font-medium tabular-nums">
            {fmt(summary.totalForeign)}
          </div>
          <div>Booked value QAR</div>
          <div className="font-semibold tabular-nums">
            {fmt(summary.bookedQar, 'QAR')}
          </div>
          <div>Rate captured at</div>
          <div className="tabular-nums">
            {summary.capturedAt
              ? new Date(summary.capturedAt).toLocaleDateString('en-QA')
              : '—'}
          </div>
        </div>
        <BookedRateLockRow
          currency={summary.currency}
          initialRate={summary.initialRate}
          onEditClick={() => setDialogOpen(true)}
        />
      </section>

      {/* Payments */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Payments
        </h3>
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-right px-3 py-2">
                  Amount ({summary.currency})
                </th>
                <th className="text-right px-3 py-2">Pay rate</th>
                <th className="text-right px-3 py-2">Amount QAR</th>
                <th className="text-right px-3 py-2">FX gain</th>
                <th className="text-right px-3 py-2">FX loss</th>
              </tr>
            </thead>
            <tbody>
              {summary.payments.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-4 text-center text-muted-foreground"
                  >
                    No payments yet.
                  </td>
                </tr>
              )}
              {summary.payments.map((p, i) => (
                <tr key={p.id} className={cn('border-t', STAGGER_IN)} style={staggerDelay(i)}>
                  <td className="px-3 py-2 tabular-nums">
                    {new Date(p.date).toLocaleDateString('en-QA')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(Number(p.amount))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(p.exchange_rate).toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(Number(p.amount_qar ?? 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-600">
                    {Number(p.exchange_gain) > 0
                      ? `+${fmt(Number(p.exchange_gain))}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-destructive">
                    {Number(p.exchange_loss) > 0
                      ? `−${fmt(Number(p.exchange_loss))}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            {summary.payments.length > 0 && (
              <tfoot className="bg-muted/20 font-semibold">
                <tr>
                  <td className="px-3 py-2">Total paid</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(summary.paidForeign)}
                  </td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(summary.paidQar, 'QAR')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-600">
                    +{fmt(summary.exchangeGain)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-destructive">
                    −{fmt(summary.exchangeLoss)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Realized net */}
      <section className="space-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Realized FX
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm max-w-md">
          <div>Exchange gain</div>
          <div className="tabular-nums text-emerald-600 font-semibold">
            +{fmt(summary.exchangeGain, 'QAR')}
          </div>
          <div>Exchange loss</div>
          <div className="tabular-nums text-destructive font-semibold">
            −{fmt(summary.exchangeLoss, 'QAR')}
          </div>
          <div className="border-t pt-1">Net</div>
          <div
            className={`border-t pt-1 tabular-nums font-bold ${
              summary.exchangeNet >= 0
                ? 'text-emerald-600'
                : 'text-destructive'
            }`}
          >
            {summary.exchangeNet >= 0 ? '+' : '−'}
            {fmt(Math.abs(summary.exchangeNet), 'QAR')}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Outstanding foreign balance: {fmt(summary.outstandingForeign)}{' '}
          {summary.currency}
        </p>
      </section>

      {/* Rate history */}
      {history.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Rate history
          </h3>
          <ul className="text-xs space-y-1">
            {history.map((h) => (
              <li key={h.id} className="tabular-nums text-muted-foreground">
                {new Date(h.changed_at).toLocaleDateString('en-QA')} ·{' '}
                {h.old_rate.toFixed(4)} → {h.new_rate.toFixed(4)} · by{' '}
                {h.changer_name ?? 'unknown'} —{' '}
                <span className="italic">{h.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ChangeBookedRateDialog
        documentType={documentType}
        documentId={documentId}
        currency={summary.currency}
        currentRate={summary.initialRate}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
