'use client'

import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MatchStatus } from '@/types/invoice'

export type MatchLine = {
  id: string
  description: string
  ordered_qty: number
  ordered_unit_price: number
  received_qty: number | null
  billed_qty: number
  billed_unit_price: number
  match_status: MatchStatus
  match_note: string
}

function computeMatchStatus(line: Pick<MatchLine, 'ordered_qty' | 'ordered_unit_price' | 'received_qty' | 'billed_qty' | 'billed_unit_price'>): MatchStatus {
  if (line.received_qty === null) return 'unmatched'
  if (line.billed_qty !== line.received_qty) return 'qty_discrepancy'
  if (Math.abs(line.billed_unit_price - line.ordered_unit_price) > 0.001) return 'price_discrepancy'
  return 'matched'
}

const MATCH_CONFIG: Record<MatchStatus, { icon: React.ReactNode; className: string; label: string }> = {
  matched:           { icon: <CheckCircle2 className="w-4 h-4" />, className: 'text-green-600', label: 'Matched' },
  qty_discrepancy:   { icon: <AlertTriangle className="w-4 h-4" />, className: 'text-amber-600', label: 'Qty Discrepancy' },
  price_discrepancy: { icon: <AlertTriangle className="w-4 h-4" />, className: 'text-amber-600', label: 'Price Discrepancy' },
  unmatched:         { icon: <XCircle className="w-4 h-4" />, className: 'text-red-600', label: 'Unmatched' },
  accepted_with_note:{ icon: <CheckCircle2 className="w-4 h-4" />, className: 'text-blue-600', label: 'Accepted' },
}

type Props = {
  lines: MatchLine[]
  onChange?: (lines: MatchLine[]) => void
  readOnly?: boolean
}

export function ThreeWayMatchTable({ lines, onChange, readOnly = false }: Props) {
  const update = (idx: number, patch: Partial<MatchLine>) => {
    if (!onChange) return
    const updated = lines.map((l, i) => {
      if (i !== idx) return l
      const merged = { ...l, ...patch }
      merged.match_status = merged.match_status === 'accepted_with_note'
        ? 'accepted_with_note'
        : computeMatchStatus(merged)
      return merged
    })
    onChange(updated)
  }

  const toggleAccept = (idx: number) => {
    const l = lines[idx]
    const next = l.match_status === 'accepted_with_note'
      ? computeMatchStatus(l)
      : 'accepted_with_note' as MatchStatus
    update(idx, { match_status: next, match_note: next === 'accepted_with_note' ? l.match_note : '' })
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
            <th className="text-left py-2 pr-2 min-w-[140px]">Item</th>
            <th className="text-right py-2 px-2">Ord Qty</th>
            <th className="text-right py-2 px-2">Ord Price</th>
            <th className="text-right py-2 px-2">Rcv Qty</th>
            <th className="text-right py-2 px-2">Bill Qty</th>
            <th className="text-right py-2 px-2">Bill Price</th>
            <th className="text-center py-2 px-2 min-w-[120px]">Match</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lines.map((line, idx) => {
            const cfg = MATCH_CONFIG[line.match_status]
            const hasDiscrepancy =
              line.match_status === 'qty_discrepancy' ||
              line.match_status === 'price_discrepancy' ||
              line.match_status === 'unmatched'
            return (
              <>
                <tr key={line.id} className="align-middle">
                  <td className="py-2 pr-2 font-medium">{line.description}</td>
                  <td className="text-right py-2 px-2 text-muted-foreground">{line.ordered_qty}</td>
                  <td className="text-right py-2 px-2 text-muted-foreground">{line.ordered_unit_price.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 text-muted-foreground">
                    {line.received_qty ?? <span className="text-red-500">—</span>}
                  </td>
                  <td className="py-2 px-2">
                    {readOnly ? (
                      <span className="block text-right">{line.billed_qty}</span>
                    ) : (
                      <Input
                        type="number"
                        className="w-20 text-right ml-auto"
                        value={line.billed_qty}
                        min={0}
                        onChange={(e) => update(idx, { billed_qty: Number(e.target.value) })}
                      />
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {readOnly ? (
                      <span className="block text-right">{line.billed_unit_price.toFixed(2)}</span>
                    ) : (
                      <Input
                        type="number"
                        className="w-24 text-right ml-auto"
                        value={line.billed_unit_price}
                        step="0.01"
                        min={0}
                        onChange={(e) => update(idx, { billed_unit_price: Number(e.target.value) })}
                      />
                    )}
                  </td>
                  <td className="text-center py-2 px-2">
                    <div className={cn('flex items-center justify-center gap-1', cfg.className)}>
                      {cfg.icon}
                      <span className="text-xs">{cfg.label}</span>
                    </div>
                    {!readOnly && hasDiscrepancy && line.match_status !== 'accepted_with_note' && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="text-xs h-auto p-0 mt-0.5"
                        onClick={() => toggleAccept(idx)}
                      >
                        Accept with note
                      </Button>
                    )}
                    {!readOnly && line.match_status === 'accepted_with_note' && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="text-xs h-auto p-0 mt-0.5 text-muted-foreground"
                        onClick={() => toggleAccept(idx)}
                      >
                        Undo
                      </Button>
                    )}
                  </td>
                </tr>
                {line.match_status === 'accepted_with_note' && !readOnly && (
                  <tr key={`${line.id}-note`}>
                    <td colSpan={7} className="pb-2 px-2">
                      <Textarea
                        className="text-xs"
                        rows={2}
                        placeholder="Required: explain why you accept this discrepancy…"
                        value={line.match_note}
                        onChange={(e) => update(idx, { match_note: e.target.value })}
                      />
                    </td>
                  </tr>
                )}
                {line.match_status === 'accepted_with_note' && readOnly && line.match_note && (
                  <tr key={`${line.id}-note-ro`}>
                    <td colSpan={7} className="pb-2 px-2">
                      <p className="text-xs text-blue-700 bg-blue-50 rounded p-2">{line.match_note}</p>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export { computeMatchStatus }
export type { MatchLine as ThreeWayMatchLine }
