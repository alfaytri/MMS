'use client'

import { useState } from 'react'
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
import type { CreditNote, CreditNoteStatus, NoteLineItem, NoteDebitLineItem } from '@/hooks/useCreditNotes'
import { useResolveCreditNoteRefund, useResolveCreditNoteStoreCredit } from '@/hooks/useCreditNotes'

const STATUS_CONFIG: Record<CreditNoteStatus, { label: string; className: string }> = {
  draft:    { label: 'Draft',    className: 'bg-muted text-foreground' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-700' },
  issued:   { label: 'Issued',   className: 'bg-amber-100 text-amber-700' },
  redeemed: { label: 'Redeemed', className: 'bg-green-100 text-green-700' },
}

function conditionLabel(line: NoteDebitLineItem): string {
  if (!line.condition) return '—'
  if (line.condition === 'other') return line.condition_notes ?? 'Other'
  return line.condition.charAt(0).toUpperCase() + line.condition.slice(1)
}

interface Props {
  note: CreditNote | null
  referenceNumber: string
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function CreditDebitNoteDetailDialog({ note, referenceNumber, open, onOpenChange }: Props) {
  if (!note) return null

  const [showRefundForm, setShowRefundForm] = useState(false)
  const [refundMethod, setRefundMethod] = useState<string>('')
  const [refundReference, setRefundReference] = useState('')

  const resolveRefund = useResolveCreditNoteRefund()
  const resolveStoreCredit = useResolveCreditNoteStoreCredit()

  const isCredit = note.note_type === 'credit'
  const isUnresolved = isCredit && note.status === 'issued' && !note.resolution_type

  const isDebit = note.note_type === 'debit'
  const pdfData = note.line_items ?? { original_lines: [], returned_lines: [] }
  const status = (note.status ?? 'draft') as CreditNoteStatus
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  const partyLabel = isDebit ? 'Supplier' : 'Customer'
  const partyName  = isDebit ? (note.supplier_name ?? '—') : (note.customer_name ?? '—')
  const refLabel   = isDebit ? 'PO #' : 'Invoice #'
  const amtLabel   = isDebit ? 'Debit Amount' : 'Credit Amount'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-fit min-w-[900px] max-w-[98vw] max-h-[90vh] overflow-y-auto overflow-x-visible p-8">

        {/* ── Header ── */}
        <DialogHeader className="pb-3">
          <div className="flex items-center gap-3 pr-8">
            <DialogTitle className="font-mono text-lg leading-none">
              {note.credit_note_id}
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
                        {formatCurrency(line.unit_price, 'QAR')}
                      </TableCell>
                      <TableCell className="text-sm text-right font-medium whitespace-nowrap tabular-nums">
                        {formatCurrency(line.total, 'QAR')}
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
                        {formatCurrency(line.unit_price, 'QAR')}
                      </TableCell>
                      <TableCell className="text-sm text-right font-medium whitespace-nowrap tabular-nums">
                        {formatCurrency(line.total, 'QAR')}
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
              <span className="whitespace-nowrap tabular-nums">{formatCurrency(note.original_total ?? 0, 'QAR')}</span>
            </div>
            <div className="flex justify-between gap-8 text-destructive">
              <span>{amtLabel}</span>
              <span className="whitespace-nowrap tabular-nums">− {formatCurrency(note.total_amount, 'QAR')}</span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between gap-8 font-semibold text-base">
              <span>New Total</span>
              <span className="whitespace-nowrap tabular-nums">{formatCurrency(note.new_total ?? 0, 'QAR')}</span>
            </div>
          </div>
        </div>

        {/* ── Download ── */}
        {note.line_items && (
          <div className="flex justify-end pt-1">
            <CreditDebitNoteDownloadButton
              note={note}
              referenceNumber={referenceNumber}
              returnNumber={note.return_number ?? '—'}
            />
          </div>
        )}

        {/* ── Resolution Actions ── */}
        {isUnresolved && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resolution</p>

            {!showRefundForm ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRefundForm(true)}
                >
                  Refund
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Go to Deliveries
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline">Store Credit</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Add to Customer Credit Balance?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will add {formatCurrency(note.total_amount, 'QAR')} to the
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
                            invoiceId: note.invoice_id ?? '',
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
              </div>
            ) : (
              <div className="space-y-3 rounded-md border p-3">
                <p className="text-sm font-medium">Record Refund</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Method *</label>
                    <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v ?? '')}>
                      <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
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
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowRefundForm(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    disabled={!refundMethod || resolveRefund.isPending}
                    onClick={() => {
                      resolveRefund.mutate({
                        creditNoteId: note.id,
                        refundMethod: refundMethod as 'cash' | 'bank_transfer' | 'cheque' | 'online',
                        refundReference,
                      }, {
                        onSuccess: () => {
                          toast.success('Refund recorded')
                          setShowRefundForm(false)
                        },
                        onError: (e) => { toast.error(e.message) },
                      })
                    }}
                  >
                    Record Refund
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Resolved State Badge ── */}
        {note.resolution_type && (
          <div className="border-t pt-4">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              {note.resolution_type === 'refund' && (
                <span>Refunded via {note.refund_method?.replace(/_/g, ' ')} — Ref: {note.refund_reference || '—'}</span>
              )}
              {note.resolution_type === 'replacement' && (
                <span>Replacement sent</span>
              )}
              {note.resolution_type === 'store_credit' && (
                <span>Added to customer credit balance</span>
              )}
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}
