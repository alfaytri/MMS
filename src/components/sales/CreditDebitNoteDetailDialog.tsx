'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { CreditDebitNoteDownloadButton } from './CreditDebitNoteDownloadButton'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import type { CreditNote, CreditNoteStatus, NoteLineItem, NoteDebitLineItem, ResolutionLineInput } from '@/hooks/useCreditNotes'
import {
  useResolveCreditNoteRefund, useResolveCreditNoteStoreCredit,
  useResolveDebitNoteSupplierCredit, useResolveDebitNoteReplacement,
} from '@/hooks/useCreditNotes'
import { useReturnLineProgress, useReturnProgress, type ReturnLineProgress } from '@/hooks/useSaleReturns'
import type { DebitNote, DebitNoteLine } from '@/types/invoice'

/** DebitNote with joined relations from useDebitNotes */
type DebitNoteWithJoins = DebitNote & {
  debit_note_lines?: DebitNoteLine[]
  return_number?: string | null
  po_number?: string | null
}
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { ReplacementReceivalDialog } from '@/components/purchase/ReplacementReceivalDialog'

const STATUS_CONFIG: Record<CreditNoteStatus, { label: string; className: string }> = {
  open:        { label: 'Open',        className: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  resolved:    { label: 'Resolved',    className: 'bg-green-100 text-green-700' },
  void:        { label: 'Void',        className: 'bg-muted text-muted-foreground' },
}

function conditionLabel(line: NoteDebitLineItem): string {
  if (!line.condition) return '—'
  if (line.condition === 'other') return line.condition_notes ?? 'Other'
  return line.condition.charAt(0).toUpperCase() + line.condition.slice(1)
}

interface Props {
  note: CreditNote | DebitNoteWithJoins | null
  noteKind?: 'credit' | 'debit'
  referenceNumber: string
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function CreditDebitNoteDetailDialog({ note, noteKind = 'credit', referenceNumber, open, onOpenChange }: Props) {
  const [showRefundForm, setShowRefundForm] = useState(false)
  const [showStoreCreditForm, setShowStoreCreditForm] = useState(false)
  const [refundMethod, setRefundMethod] = useState<string>('')
  const [refundReference, setRefundReference] = useState('')
  const [refundQtyByLine, setRefundQtyByLine] = useState<Record<string, number>>({})
  const [storeCreditQtyByLine, setStoreCreditQtyByLine] = useState<Record<string, number>>({})
  const [showReplacementReceival, setShowReplacementReceival] = useState(false)

  const resolveRefund = useResolveCreditNoteRefund()
  const resolveStoreCredit = useResolveCreditNoteStoreCredit()
  const resolveSupplierCredit = useResolveDebitNoteSupplierCredit()
  const resolveDebitReplacement = useResolveDebitNoteReplacement()
  const { data: dbMethods = [] } = usePaymentMethods()

  const isCredit = noteKind === 'credit'
  const linkedReturnId = isCredit && note ? (note as CreditNote).source_return_id : null
  const { data: lineProgress = [] } = useReturnLineProgress(open ? linkedReturnId : null)
  const { data: returnProgress } = useReturnProgress(open ? linkedReturnId : null)

  // Build unit-price-per-return-line map by matching return_lines to CN's
  // returned credit_note_lines by brand_variant_id (SKU/item fallback).
  const priceByReturnLineId = useMemo(() => {
    const map: Record<string, number> = {}
    if (!note || !isCredit) return map
    const returnedCnLines = ((note as CreditNote).credit_note_lines ?? [])
      .filter((l) => l.line_type === 'returned')
    for (const p of lineProgress) {
      const match = returnedCnLines.find((l) => {
        if (p.brand_variant_id && (l as unknown as { brand_variant_id?: string | null }).brand_variant_id) {
          return (l as unknown as { brand_variant_id?: string | null }).brand_variant_id === p.brand_variant_id
        }
        return (l.sku ?? null) === (p.sku ?? null) && (l.description ?? '') === p.item_name
      })
      map[p.return_line_id] = match?.unit_price ?? 0
    }
    return map
  }, [note, isCredit, lineProgress])

  // Sort damaged after good for readability.
  const progressRows: ReturnLineProgress[] = useMemo(() => {
    return lineProgress
      .slice()
      .sort((a, b) => {
        const order = (c: string) => (c === 'good' ? 0 : c === 'damaged' ? 2 : 1)
        return order(a.condition) - order(b.condition) || a.item_name.localeCompare(b.item_name)
      })
  }, [lineProgress])

  const anyRemaining = progressRows.some((p) => p.customer_remaining_qty > 0)

  // Pre-fill qtys with remaining when the form opens. Depend on
  // lineProgress.length (a stable number) — the useReturnLineProgress data ?? []
  // fallback would produce a fresh array reference every render and cause
  // this effect to loop forever otherwise.
  useEffect(() => {
    if (!showRefundForm) return
    const next: Record<string, number> = {}
    for (const p of lineProgress) next[p.return_line_id] = p.customer_remaining_qty > 0 ? p.customer_remaining_qty : 0
    setRefundQtyByLine(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRefundForm, lineProgress.length])

  useEffect(() => {
    if (!showStoreCreditForm) return
    const next: Record<string, number> = {}
    for (const p of lineProgress) next[p.return_line_id] = p.customer_remaining_qty > 0 ? p.customer_remaining_qty : 0
    setStoreCreditQtyByLine(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStoreCreditForm, lineProgress.length])

  if (!note) return null

  // Under the ledger model, the resolution_type column on credit_notes is
  // only stamped when the return is fully covered by _maybe_close_return.
  // Partial resolutions (e.g. 3 store_credit + 2 remaining) leave the column
  // NULL — so gate the action UI on ledger remaining, not resolution_type,
  // whenever a return is linked. Under Phase 8.1b vocabulary, `open` and
  // `in_progress` are both actionable; only `resolved` and `void` hide the
  // action UI.
  const ledgerRemaining = linkedReturnId ? (returnProgress?.customer_remaining ?? null) : null
  const ledgerMix = linkedReturnId ? (returnProgress?.customer_resolutions_by_type ?? null) : null
  const hasLedgerHistory = !!ledgerMix && Object.values(ledgerMix).some((qty) => qty > 0)
  const isUnresolved = isCredit
    && note.status !== 'resolved' && note.status !== 'void'
    && (
      linkedReturnId
        ? (ledgerRemaining === null || ledgerRemaining > 0)  // still resolving
        : !note.resolution_type                              // invoice-adjustment fallback
    )
  const isFullyResolvedViaLedger = isCredit && !!linkedReturnId && ledgerRemaining === 0

  const RESOLUTION_LABEL: Record<string, string> = {
    replacement:  'replacement',
    refund:       'refund',
    store_credit: 'store credit',
    write_off:    'write-off',
  }
  const ledgerSummaryText = ledgerMix
    ? Object.entries(ledgerMix)
        .filter(([, qty]) => qty > 0)
        .map(([type, qty]) => `${qty} ${RESOLUTION_LABEL[type] ?? type}`)
        .join(' · ')
    : ''

  const isDebit = noteKind === 'debit'
  // DN status flows 'open' → 'in_progress' → 'resolved' (some legacy DNs
  // still carry 'issued'). Any non-terminal status with no resolution_type
  // means the resolution section should show.
  const isDebitUnresolved =
    isDebit
    && (note.status === 'open' || note.status === 'in_progress' || note.status === 'issued')
    && !note.resolution_type

  const noteDisplayId = isDebit
    ? (note as DebitNoteWithJoins).debit_note_id
    : (note as CreditNote).credit_note_id

  const allLines = isDebit
    ? ((note as DebitNoteWithJoins).debit_note_lines ?? [])
    : ((note as CreditNote).credit_note_lines ?? [])
  const pdfData = {
    original_lines: allLines
      .filter((l) => l.line_type === 'original')
      .map((l) => ({
        item_name:  l.description ?? 'Item',
        sku:        l.sku ?? null,
        qty:        l.qty,
        unit_price: l.unit_price,
        total:      l.total ?? l.qty * l.unit_price,
      })) as NoteLineItem[],
    returned_lines: allLines
      .filter((l) => l.line_type === 'returned')
      .map((l) => ({
        item_name:       l.description ?? 'Item',
        sku:             l.sku ?? null,
        qty:             l.qty,
        unit_price:      l.unit_price,
        total:           l.total ?? l.qty * l.unit_price,
        condition:       l.condition ?? undefined,
        condition_notes: l.condition_notes ?? undefined,
      })) as NoteDebitLineItem[],
  }
  const status = (note.status ?? 'draft') as CreditNoteStatus
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open
  const partyLabel = isDebit ? 'Supplier' : 'Customer'
  const partyName  = isDebit
    ? ((note as DebitNoteWithJoins).supplier_name ?? '—')
    : ((note as CreditNote).customer_name ?? '—')
  const refLabel   = isDebit ? 'PO #' : 'Invoice #'
  const amtLabel   = isDebit ? 'Debit Amount' : 'Credit Amount'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg max-h-[90vh] overflow-y-auto p-4 sm:p-8">

        {/* ── Header ── */}
        <DialogHeader className="pb-3">
          <div className="flex items-center gap-3 pr-8">
            <DialogTitle className="font-mono text-lg leading-none">
              {noteDisplayId}
            </DialogTitle>
            <Badge className={cn('text-xs shrink-0', cfg.className)}>{cfg.label}</Badge>
          </div>
        </DialogHeader>

        {/* ── Meta grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">{partyLabel}</p>
            <p className="font-medium break-words">{partyName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">{refLabel}</p>
            <p className="font-medium break-words">{referenceNumber}</p>
          </div>
          {note.return_number && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Return #</p>
              <p className="font-medium font-mono">{note.return_number}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Date</p>
            <p className="font-medium">{formatDate(note.created_at)}</p>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <p className="text-xs text-muted-foreground mb-0.5">Reason</p>
            <p className="font-medium">{note.reason}</p>
          </div>
        </div>

        <Separator />

        {/* ── Original Items ── */}
        {pdfData.original_lines.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Original Items
            </p>
            <div className="rounded-md border">
              <Table className="w-full min-w-[850px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs text-right">Unit Price</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pdfData.original_lines.map((line: NoteLineItem, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm">{line.item_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{line.sku ?? '—'}</TableCell>
                      <TableCell className="text-sm text-right">{line.qty}</TableCell>
                      <TableCell className="text-sm text-right whitespace-nowrap tabular-nums">
                        {formatCurrency(line.unit_price, note.currency ?? 'QAR')}
                      </TableCell>
                      <TableCell className="text-sm text-right font-medium whitespace-nowrap tabular-nums">
                        {formatCurrency(line.total, note.currency ?? 'QAR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ── Returned Items ── */}
        {pdfData.returned_lines.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Returned Items
            </p>
            <div className="rounded-md border">
              <Table className="w-full min-w-[850px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    {isDebit && <TableHead className="text-xs">Condition</TableHead>}
                    <TableHead className="text-xs text-right">Unit Price</TableHead>
                    <TableHead className="text-xs text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pdfData.returned_lines.map((line: NoteDebitLineItem, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm">{line.item_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{line.sku ?? '—'}</TableCell>
                      <TableCell className="text-sm text-right">{line.qty}</TableCell>
                      {isDebit && (
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{conditionLabel(line)}</TableCell>
                      )}
                      <TableCell className="text-sm text-right whitespace-nowrap tabular-nums">
                        {formatCurrency(line.unit_price, note.currency ?? 'QAR')}
                      </TableCell>
                      <TableCell className="text-sm text-right font-medium whitespace-nowrap tabular-nums">
                        {formatCurrency(line.total, note.currency ?? 'QAR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <Separator />

        {/* ── Totals ── */}
        <div className="flex justify-end">
          <div className="flex flex-col gap-1.5 text-sm w-64">
            <div className="flex justify-between gap-8">
              <span className="text-muted-foreground">Original Total</span>
              <span className="whitespace-nowrap tabular-nums">{formatCurrency(note.original_total ?? 0, note.currency ?? 'QAR')}</span>
            </div>
            <div className="flex justify-between gap-8 text-destructive">
              <span>{amtLabel}</span>
              <span className="whitespace-nowrap tabular-nums">− {formatCurrency(note.total_amount, note.currency ?? 'QAR')}</span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between gap-8 font-semibold text-base">
              <span>New Total</span>
              <span className="whitespace-nowrap tabular-nums">{formatCurrency(note.new_total ?? 0, note.currency ?? 'QAR')}</span>
            </div>
          </div>
        </div>

        {/* ── Download ── */}
        {allLines.length > 0 && (
          <div className="flex justify-end pt-1">
            <CreditDebitNoteDownloadButton
              note={note}
              noteKind={noteKind}
              referenceNumber={referenceNumber}
              returnNumber={note.return_number ?? '—'}
            />
          </div>
        )}

        {/* ── Resolution Actions ── */}
        {isUnresolved && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resolution</p>
              {linkedReturnId && returnProgress && (
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {hasLedgerHistory && <span>{ledgerSummaryText} · </span>}
                  <span className={returnProgress.customer_remaining > 0 ? 'text-amber-700 dark:text-amber-400 font-medium' : ''}>
                    {returnProgress.customer_remaining} of {returnProgress.total_returned} remaining
                  </span>
                </p>
              )}
            </div>

            {!showRefundForm && !showStoreCreditForm && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRefundForm(true)}
                  disabled={!!linkedReturnId && !anyRemaining}
                >
                  Refund
                </Button>
                {linkedReturnId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowStoreCreditForm(true)}
                    disabled={!anyRemaining}
                  >
                    Store Credit
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline">Store Credit</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Add to Customer Credit Balance?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will add {formatCurrency(note.total_amount, note.currency ?? 'QAR')} to the
                          customer&apos;s credit balance for use on future orders.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={resolveStoreCredit.isPending}
                          onClick={() => {
                            resolveStoreCredit.mutate({
                              creditNoteId: note.id,
                              invoiceId: (note as CreditNote).invoice_id ?? '',
                              amount: note.total_amount,
                            }, {
                              onSuccess: () => { toast.success('Credit added to customer balance') },
                              onError: (e) => { toast.error(e.message) },
                            })
                          }}
                        >
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}

            {showRefundForm && (
              <ResolutionForm
                title="Record Refund"
                actionLabel="Record Refund"
                busyLabel="Recording…"
                totalLabel="Refund total"
                subtotalTone="text-destructive"
                currency={note.currency ?? 'QAR'}
                cnTotal={note.total_amount}
                rows={progressRows}
                qtyByLine={refundQtyByLine}
                setQty={(id, qty) => setRefundQtyByLine((prev) => ({ ...prev, [id]: qty }))}
                priceByLine={priceByReturnLineId}
                linkedReturnId={linkedReturnId}
                isPending={resolveRefund.isPending}
                onCancel={() => setShowRefundForm(false)}
                extraHeader={
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Method *</label>
                      <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v ?? '')}>
                        <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {dbMethods.map((m) => (
                            <SelectItem key={m.id} value={m.slug}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Reference</label>
                      <Input
                        placeholder="Transaction / cheque #"
                        value={refundReference}
                        onChange={(e) => setRefundReference(e.target.value)}
                      />
                    </div>
                  </div>
                }
                canSubmit={!!refundMethod}
                onSubmit={(lines) => {
                  resolveRefund.mutate({
                    creditNoteId:    note.id,
                    refundMethod,
                    refundReference,
                    lines:           linkedReturnId ? lines : undefined,
                  }, {
                    onSuccess: () => {
                      toast.success('Refund recorded')
                      setShowRefundForm(false)
                    },
                    onError: (e) => { toast.error(e.message) },
                  })
                }}
              />
            )}

            {showStoreCreditForm && (
              <ResolutionForm
                title="Add to Customer Credit"
                actionLabel="Add to Customer Credit"
                busyLabel="Adding…"
                totalLabel="Store credit total"
                subtotalTone="text-blue-700 dark:text-blue-300"
                currency={note.currency ?? 'QAR'}
                cnTotal={note.total_amount}
                rows={progressRows}
                qtyByLine={storeCreditQtyByLine}
                setQty={(id, qty) => setStoreCreditQtyByLine((prev) => ({ ...prev, [id]: qty }))}
                priceByLine={priceByReturnLineId}
                linkedReturnId={linkedReturnId}
                isPending={resolveStoreCredit.isPending}
                onCancel={() => setShowStoreCreditForm(false)}
                canSubmit={true}
                onSubmit={(lines) => {
                  resolveStoreCredit.mutate({
                    creditNoteId: note.id,
                    invoiceId:    (note as CreditNote).invoice_id ?? '',
                    amount:       note.total_amount,
                    lines:        linkedReturnId ? lines : undefined,
                  }, {
                    onSuccess: () => {
                      toast.success('Credit added to customer balance')
                      setShowStoreCreditForm(false)
                    },
                    onError: (e) => { toast.error(e.message) },
                  })
                }}
              />
            )}
          </div>
        )}

        {/* ── Debit Note Resolution ── */}
        {isDebitUnresolved && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resolution</p>
            <div className="flex flex-wrap gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline">Supplier Credit</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apply to supplier bill?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Apply {noteDisplayId} ({formatCurrency(note.total_amount, note.currency ?? 'QAR')}) against the supplier bill for this PO.
                      Bill outstanding will be reduced by up to this amount; any excess stays on the debit note.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={resolveSupplierCredit.isPending}
                      onClick={() => {
                        resolveSupplierCredit.mutate(note.id, {
                          onSuccess: () => { toast.success('DN applied to supplier bill') },
                          onError: (e) => { toast.error(e.message) },
                        })
                      }}
                    >
                      Apply
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  resolveDebitReplacement.mutate(note.id, {
                    onSuccess: () => {
                      toast.success('Marked as replacement')
                      setShowReplacementReceival(true)
                    },
                    onError: (e) => { toast.error(e.message) },
                  })
                }}
                disabled={resolveDebitReplacement.isPending}
              >
                {resolveDebitReplacement.isPending ? 'Processing…' : 'Replacement'}
              </Button>
            </div>
          </div>
        )}

        {/* ── Resolved State Badge ── */}
        {(note.resolution_type || isFullyResolvedViaLedger) && (
          <div className="border-t pt-4">
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
              {isFullyResolvedViaLedger && hasLedgerHistory ? (
                <span>Fully resolved via ledger — {ledgerSummaryText}
                  {(note as CreditNote).refund_method && <> · Refund via {(note as CreditNote).refund_method?.replace(/_/g, ' ')}
                    {(note as CreditNote).refund_reference && <> (Ref: {(note as CreditNote).refund_reference})</>}
                  </>}
                </span>
              ) : note.resolution_type === 'refund' ? (
                <span>Refunded via {(note as CreditNote).refund_method?.replace(/_/g, ' ')} — Ref: {(note as CreditNote).refund_reference || '—'}</span>
              ) : note.resolution_type === 'replacement' ? (
                <span>Replacement sent</span>
              ) : note.resolution_type === 'store_credit' ? (
                <span>Added to customer credit balance</span>
              ) : note.resolution_type === 'supplier_credit' ? (
                <span>Supplier credit — deduct from future bills</span>
              ) : null}
            </div>
          </div>
        )}

        {showReplacementReceival && isDebit && (note as DebitNoteWithJoins).purchase_order_id && (
          <ReplacementReceivalDialog
            open={showReplacementReceival}
            onOpenChange={(v) => { if (!v) setShowReplacementReceival(false) }}
            debitNote={note as DebitNoteWithJoins}
            onSuccess={() => {
              setShowReplacementReceival(false)
              onOpenChange(false)
            }}
          />
        )}

      </DialogContent>
    </Dialog>
  )
}

interface ResolutionFormProps {
  title:           string
  actionLabel:     string
  busyLabel:       string
  totalLabel:      string
  subtotalTone:    string
  currency:        string
  cnTotal:         number
  rows:            ReturnLineProgress[]
  qtyByLine:       Record<string, number>
  setQty:          (returnLineId: string, qty: number) => void
  priceByLine:     Record<string, number>
  linkedReturnId:  string | null
  isPending:       boolean
  canSubmit:       boolean
  onCancel:        () => void
  onSubmit:        (lines: ResolutionLineInput[]) => void
  extraHeader?:    ReactNode
}

function ResolutionForm({
  title, actionLabel, busyLabel, totalLabel, subtotalTone,
  currency, cnTotal, rows, qtyByLine, setQty, priceByLine,
  linkedReturnId, isPending, canSubmit, onCancel, onSubmit, extraHeader,
}: ResolutionFormProps) {
  const subtotal = useMemo(() => {
    if (!linkedReturnId) return cnTotal
    return rows.reduce((s, r) => {
      const qty = qtyByLine[r.return_line_id] ?? 0
      const price = priceByLine[r.return_line_id] ?? 0
      return s + qty * price
    }, 0)
  }, [linkedReturnId, cnTotal, rows, qtyByLine, priceByLine])

  const totalPickedQty = useMemo(
    () => Object.values(qtyByLine).reduce((s, q) => s + (q || 0), 0),
    [qtyByLine],
  )

  const overCap = linkedReturnId ? subtotal > cnTotal + 0.0001 : false
  const needsQty = !!linkedReturnId && totalPickedQty <= 0

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">{title}</p>

      {extraHeader}

      {linkedReturnId && (
        <div className="rounded-md border overflow-x-auto">
          <Table className="w-full min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs w-16 text-center">Returned</TableHead>
                <TableHead className="text-xs w-20 text-center">Remaining</TableHead>
                <TableHead className="text-xs w-24 text-right">Unit Price</TableHead>
                <TableHead className="text-xs w-24 text-center">Qty</TableHead>
                <TableHead className="text-xs w-28 text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-3">
                    Loading return progress…
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const qty = qtyByLine[r.return_line_id] ?? 0
                const price = priceByLine[r.return_line_id] ?? 0
                const disabled = r.customer_remaining_qty <= 0
                const isDamaged = r.condition === 'damaged'
                return (
                  <TableRow key={r.return_line_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="text-sm truncate">{r.item_name}</div>
                          {r.sku && (
                            <div className="text-xs text-muted-foreground">{r.sku}</div>
                          )}
                        </div>
                        {isDamaged && (
                          <Badge variant="destructive" className="shrink-0 text-[10px]">
                            Damaged
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-center">{r.returned_qty}</TableCell>
                    <TableCell className="text-sm text-center">{r.customer_remaining_qty}</TableCell>
                    <TableCell className="text-sm text-right whitespace-nowrap tabular-nums">
                      {formatCurrency(price, currency)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min={0}
                        max={r.customer_remaining_qty}
                        value={qty}
                        disabled={disabled}
                        onChange={(e) => {
                          const raw = Number(e.target.value)
                          const clamped = Math.max(0, Math.min(r.customer_remaining_qty, Number.isFinite(raw) ? Math.floor(raw) : 0))
                          setQty(r.return_line_id, clamped)
                        }}
                        className="h-8 w-20 mx-auto text-center"
                      />
                    </TableCell>
                    <TableCell className="text-sm text-right whitespace-nowrap tabular-nums">
                      {formatCurrency(qty * price, currency)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          CN amount: <span className="text-foreground whitespace-nowrap tabular-nums">{formatCurrency(cnTotal, currency)}</span>
        </span>
        <span className={cn('font-medium whitespace-nowrap tabular-nums', subtotalTone)}>
          {totalLabel}: {formatCurrency(subtotal, currency)}
        </span>
      </div>

      {overCap && (
        <p className="text-[11px] text-destructive text-right">
          Selected total exceeds the credit-note amount. Reduce quantities before continuing.
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          disabled={!canSubmit || isPending || overCap || needsQty}
          onClick={() => {
            const lines: ResolutionLineInput[] = rows
              .filter((r) => (qtyByLine[r.return_line_id] ?? 0) > 0)
              .map((r) => ({ return_line_id: r.return_line_id, qty: qtyByLine[r.return_line_id] ?? 0 }))
            onSubmit(lines)
          }}
        >
          {isPending ? busyLabel : actionLabel}
        </Button>
      </div>
    </div>
  )
}
