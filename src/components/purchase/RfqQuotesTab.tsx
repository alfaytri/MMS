'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import {
  useRfqQuotes,
  useSaveQuote,
  useAwardQuote,
  type RfqQuote,
  type AwardQuoteInput,
} from '@/hooks/useRfqQuotes'

// ─── Status badge colours ────────────────────────────────────────────────────

const statusStyles: Record<string, string> = {
  pending:  'bg-slate-100 text-slate-600',
  received: 'bg-blue-100 text-blue-700',
  awarded:  'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  poId: string
  poNumber: string
  currency: string
  lineItems: {
    id: string
    item_name: string
    qty: number
    unit: string
    unit_price: number
  }[]
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RfqQuotesTab({ poId, poNumber, currency, lineItems }: Props) {
  const { data: quotes = [], isLoading } = useRfqQuotes(poId)
  const saveQuote = useSaveQuote()
  const awardQuote = useAwardQuote()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editPrices, setEditPrices] = useState<Record<string, number>>({})
  const [awardTarget, setAwardTarget] = useState<AwardQuoteInput | null>(null)

  // ── Helpers ──

  /** Initialise edit prices when a card is expanded */
  function initPrices(quote: RfqQuote) {
    const prices: Record<string, number> = {}
    for (const li of lineItems) {
      const existing = quote.po_rfq_quote_items.find(
        (qi) => qi.po_line_item_id === li.id
      )
      prices[li.id] = existing ? existing.quoted_price : li.unit_price
    }
    setEditPrices(prices)
  }

  function toggleCard(quote: RfqQuote) {
    if (expandedId === quote.id) {
      setExpandedId(null)
      setEditPrices({})
    } else {
      setExpandedId(quote.id)
      initPrices(quote)
    }
  }

  async function handleSave(quote: RfqQuote) {
    const items = lineItems.map((li) => ({
      po_line_item_id: li.id,
      quoted_price: editPrices[li.id] ?? li.unit_price,
      quoted_qty: li.qty,
    }))
    try {
      await saveQuote.mutateAsync({ quoteId: quote.id, items })
      toast.success('Quote saved')
      setExpandedId(null)
      setEditPrices({})
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save quote')
    }
  }

  async function handleAward() {
    if (!awardTarget) return
    try {
      await awardQuote.mutateAsync(awardTarget)
      toast.success(`PO awarded to ${awardTarget.supplierName}`)
      setAwardTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to award quote')
    }
  }

  // ── Comparison data ──

  const receivedQuotes = useMemo(
    () => quotes.filter((q) => q.status === 'received'),
    [quotes]
  )
  const showComparison = receivedQuotes.length >= 2

  /** For each line item, find the lowest quoted price among received quotes */
  const lowestPerItem = useMemo(() => {
    const map: Record<string, number> = {}
    for (const li of lineItems) {
      let min = Infinity
      for (const q of receivedQuotes) {
        const qi = q.po_rfq_quote_items.find(
          (i) => i.po_line_item_id === li.id
        )
        if (qi && qi.quoted_price < min) min = qi.quoted_price
      }
      if (min !== Infinity) map[li.id] = min
    }
    return map
  }, [lineItems, receivedQuotes])

  const lowestTotal = useMemo(() => {
    if (receivedQuotes.length === 0) return null
    let min = Infinity
    for (const q of receivedQuotes) {
      if (q.total_amount < min) min = q.total_amount
    }
    return min === Infinity ? null : min
  }, [receivedQuotes])

  // ── Render ──

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Loading quotes...
      </p>
    )
  }

  if (quotes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No supplier quotes for this RFQ.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Supplier Cards ────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Supplier Quotes
        </h3>
        {quotes.map((quote) => {
          const isExpanded = expandedId === quote.id
          const supplierName = quote.suppliers?.name ?? 'Unknown Supplier'

          return (
            <div key={quote.id} className="rounded-md border">
              {/* Card header */}
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                onClick={() => toggleCard(quote)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-medium truncate">{supplierName}</span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'shrink-0 border-0 text-xs',
                      statusStyles[quote.status] ?? ''
                    )}
                  >
                    {quote.status}
                  </Badge>
                  {quote.status === 'awarded' && (
                    <Trophy className="h-4 w-4 text-green-600 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {quote.status !== 'pending' && (
                    <span className="text-sm font-medium">
                      {formatCurrency(quote.total_amount, currency)}
                    </span>
                  )}
                  {quote.status === 'received' && !isExpanded && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-700 border-green-300 hover:bg-green-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        setAwardTarget({
                          quoteId: quote.id,
                          poId,
                          supplierId: quote.supplier_id,
                          supplierName,
                        })
                      }}
                    >
                      <Trophy className="h-3.5 w-3.5 mr-1" />
                      Award
                    </Button>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded: quote entry form */}
              {isExpanded && (
                <div className="border-t px-4 py-4 space-y-4">
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Target Price</TableHead>
                          <TableHead className="text-right">Quoted Price</TableHead>
                          <TableHead className="hidden sm:table-cell">Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((li, i) => (
                          <TableRow key={li.id} className={STAGGER_IN} style={staggerDelay(i)}>
                            <TableCell className="font-medium text-sm">
                              {li.item_name}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {li.qty} {li.unit}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {formatCurrency(li.unit_price, currency)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                className="w-28 ml-auto text-right h-8"
                                value={editPrices[li.id] ?? ''}
                                onChange={(e) =>
                                  setEditPrices((prev) => ({
                                    ...prev,
                                    [li.id]: parseFloat(e.target.value) || 0,
                                  }))
                                }
                              />
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <Input
                                placeholder="Optional"
                                className="h-8 text-sm"
                                disabled
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setExpandedId(null)
                        setEditPrices({})
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={saveQuote.isPending}
                      onClick={() => handleSave(quote)}
                    >
                      {saveQuote.isPending ? 'Saving...' : 'Save Quote'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Comparison Table ──────────────────────────────────────── */}
      {showComparison && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Quote Comparison
          </h3>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Item</TableHead>
                  {receivedQuotes.map((q) => (
                    <TableHead key={q.id} className="text-center min-w-[120px]">
                      <div className="space-y-1">
                        <div className="font-medium">
                          {q.suppliers?.name ?? 'Supplier'}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-700 border-green-300 hover:bg-green-50 h-7 text-xs"
                          onClick={() =>
                            setAwardTarget({
                              quoteId: q.id,
                              poId,
                              supplierId: q.supplier_id,
                              supplierName: q.suppliers?.name ?? 'Supplier',
                            })
                          }
                        >
                          <Trophy className="h-3 w-3 mr-1" />
                          Award
                        </Button>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((li, ri) => (
                  <TableRow key={li.id} className={STAGGER_IN} style={staggerDelay(ri)}>
                    <TableCell className="font-medium text-sm">
                      {li.item_name}
                    </TableCell>
                    {receivedQuotes.map((q) => {
                      const qi = q.po_rfq_quote_items.find(
                        (i) => i.po_line_item_id === li.id
                      )
                      const price = qi?.quoted_price ?? null
                      const isLowest =
                        price !== null && lowestPerItem[li.id] === price
                      return (
                        <TableCell
                          key={q.id}
                          className={cn(
                            'text-center text-sm',
                            isLowest && 'text-green-700 font-bold'
                          )}
                        >
                          {price !== null
                            ? formatCurrency(price, currency)
                            : '—'}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
                {/* Total row */}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  {receivedQuotes.map((q) => {
                    const isLowest =
                      lowestTotal !== null && q.total_amount === lowestTotal
                    return (
                      <TableCell
                        key={q.id}
                        className={cn(
                          'text-center',
                          isLowest && 'text-green-700 font-bold'
                        )}
                      >
                        {formatCurrency(q.total_amount, currency)}
                      </TableCell>
                    )
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── Award Confirmation Dialog ─────────────────────────────── */}
      <AlertDialog
        open={!!awardTarget}
        onOpenChange={(open) => {
          if (!open) setAwardTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Award Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              Award <span className="font-semibold">{poNumber}</span> to{' '}
              <span className="font-semibold">{awardTarget?.supplierName}</span>?
              {awardTarget && (
                <>
                  {' '}The quoted prices will be applied to the PO line items
                  and the PO type will change to draft.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={awardQuote.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={awardQuote.isPending}
              onClick={(e) => {
                e.preventDefault()
                handleAward()
              }}
            >
              {awardQuote.isPending ? 'Awarding...' : 'Confirm Award'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
