'use client'

import { useMemo } from 'react'
import { ExternalLink, Wallet } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils/formatters'
import { useOpenDebitNotesForSupplier, useOpenCreditNotesForCustomer, type OpenCreditNoteRow } from '@/hooks/useOpenCreditNotes'

type Props = {
  open:      boolean
  onOpenChange: (v: boolean) => void
  partyId:   string
  partyName: string
  /** 'supplier' → what supplier owes us (DNs). 'customer' → what we owe customer (CNs). */
  kind:      'supplier' | 'customer'
}

function formatAmount(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function CreditBalanceDialog({ open, onOpenChange, partyId, partyName, kind }: Props) {
  const supplierQ = useOpenDebitNotesForSupplier(kind === 'supplier' && open ? partyId : null)
  const customerQ = useOpenCreditNotesForCustomer(kind === 'customer' && open ? partyId : null)
  const isLoading = kind === 'supplier' ? supplierQ.isLoading : customerQ.isLoading
  const rows = useMemo<OpenCreditNoteRow[]>(
    () => (kind === 'supplier' ? (supplierQ.data ?? []) : (customerQ.data ?? [])),
    [kind, supplierQ.data, customerQ.data],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, OpenCreditNoteRow[]>()
    for (const r of rows) {
      const existing = map.get(r.currency)
      if (existing) existing.push(r)
      else map.set(r.currency, [r])
    }
    // Sort each group's rows by date desc (already server-sorted, but be safe).
    for (const list of map.values()) {
      list.sort((a, b) => b.created_at.localeCompare(a.created_at))
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [rows])

  const totalNoteLabel = kind === 'supplier' ? 'Debit note' : 'Credit note'
  const headerCopy = kind === 'supplier'
    ? `Supplier ${partyName} owes you`
    : `You owe customer ${partyName}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" />
            {headerCopy}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-sm">
          {isLoading && (
            <div className="rounded-lg border border-dashed py-6 text-center text-[11px] text-muted-foreground">
              Loading…
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <div className="rounded-lg border border-dashed py-6 text-center text-[11px] text-muted-foreground">
              No open {totalNoteLabel.toLowerCase()}s.
            </div>
          )}

          {grouped.map(([currency, list]) => {
            const groupTotal = list.reduce((s, r) => s + r.amount, 0)
            return (
              <div key={currency} className="space-y-2">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wide">
                  <span className="text-muted-foreground">{currency}</span>
                  <span className="font-semibold text-foreground">{formatAmount(groupTotal, currency)}</span>
                </div>
                <div className="rounded-lg border divide-y">
                  {list.map((r) => (
                    <a
                      key={r.id}
                      href={r.detail_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono font-medium truncate">{r.note_number}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {r.reference ? `${r.reference} · ` : ''}{formatDate(r.created_at)}
                        </div>
                      </div>
                      <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
                        {formatAmount(r.amount, r.currency)}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter className="pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
