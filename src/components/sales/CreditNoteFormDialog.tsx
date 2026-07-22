// src/components/sales/CreditNoteFormDialog.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useCreateCreditNote, useCreditNotes } from '@/hooks/useCreditNotes'
import { useCustomerInvoices } from '@/hooks/useCustomerInvoices'
import { useReasonLists } from '@/hooks/useReasonLists'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

type CreditMode = 'full' | 'partial' | 'line'

type LineDraft = {
  invoice_line_id: string
  description: string
  original_qty: number
  original_unit_price: number
  checked: boolean
  credit_qty: number
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
}

const CUSTOM_REASON = '__custom__'

export function CreditNoteFormDialog({ open, onOpenChange }: Props) {
  const createCreditNote = useCreateCreditNote()
  const { data: invoices } = useCustomerInvoices()
  const { data: allCreditNotes = [] } = useCreditNotes()
  const { reasons, isLoading: loadingReasons } = useReasonLists('refund')

  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [mode, setMode] = useState<CreditMode>('full')
  const [partialAmount, setPartialAmount] = useState('')
  const [reasonPick, setReasonPick] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [saving, setSaving] = useState(false)

  const eligibleInvoices = useMemo(
    () => invoices ?? [],
    [invoices]
  )

  const selectedInvoice = useMemo(
    () => eligibleInvoices.find((inv) => inv.id === selectedInvoiceId) ?? null,
    [eligibleInvoices, selectedInvoiceId]
  )

  const alreadyCredited = useMemo(() => {
    if (!selectedInvoice) return 0
    return allCreditNotes
      .filter(
        (cn) =>
          cn.invoice_id === selectedInvoice.id &&
          cn.status !== null &&
          ['approved', 'issued', 'redeemed'].includes(cn.status)
      )
      .reduce((s, cn) => s + (cn.total_amount ?? 0), 0)
  }, [allCreditNotes, selectedInvoice])

  const invoiceTotal = selectedInvoice?.total_amount ?? 0
  const remainingCreditable = Math.max(0, invoiceTotal - alreadyCredited)

  // Reset dialog when opened
  useEffect(() => {
    if (open) {
      setSelectedInvoiceId('')
      setMode('full')
      setPartialAmount('')
      setReasonPick('')
      setCustomReason('')
      setLines([])
    }
  }, [open])

  // Populate line drafts when invoice changes
  useEffect(() => {
    if (!selectedInvoice) {
      setLines([])
      return
    }
    setLines(
      (selectedInvoice.invoice_line_items ?? []).map((li) => ({
        invoice_line_id: li.id,
        description: li.description ?? '',
        original_qty: li.qty ?? 0,
        original_unit_price: li.unit_price ?? 0,
        checked: true,
        credit_qty: li.qty ?? 0,
      }))
    )
  }, [selectedInvoice])

  // Compute CN total based on active mode
  const cnTotal = useMemo(() => {
    if (!selectedInvoice) return 0
    if (mode === 'full') return remainingCreditable
    if (mode === 'partial') return parseFloat(partialAmount) || 0
    return lines
      .filter((l) => l.checked && l.credit_qty > 0)
      .reduce((s, l) => s + l.credit_qty * l.original_unit_price, 0)
  }, [mode, partialAmount, lines, selectedInvoice, remainingCreditable])

  const overLimit = cnTotal > remainingCreditable + 0.001
  const finalReason = reasonPick === CUSTOM_REASON ? customReason.trim() : reasonPick

  const isValid = useMemo(() => {
    if (!selectedInvoice) return false
    if (!finalReason) return false
    if (cnTotal <= 0) return false
    if (overLimit) return false
    if (mode === 'line' && !lines.some((l) => l.checked && l.credit_qty > 0)) return false
    return true
  }, [selectedInvoice, finalReason, cnTotal, overLimit, mode, lines])

  const close = () => onOpenChange(false)

  const submit = async () => {
    if (!selectedInvoice || !isValid) return

    let payloadLines: {
      invoice_line_id: string | null
      description: string
      qty: number
      unit_price: number
    }[] = []

    if (mode === 'full') {
      // Mirror invoice lines proportionally against remaining balance.
      // If nothing already credited, mirror exactly. Otherwise, allocate the
      // remaining amount into a single summary line.
      if (alreadyCredited === 0) {
        payloadLines = (selectedInvoice.invoice_line_items ?? []).map((li) => ({
          invoice_line_id: li.id,
          description: li.description ?? '',
          qty: li.qty ?? 1,
          unit_price: li.unit_price ?? 0,
        }))
      } else {
        payloadLines = [
          {
            invoice_line_id: null,
            description: `Full credit for remaining balance — ${finalReason}`,
            qty: 1,
            unit_price: remainingCreditable,
          },
        ]
      }
    } else if (mode === 'partial') {
      payloadLines = [
        {
          invoice_line_id: null,
          description: `Partial credit — ${finalReason}`,
          qty: 1,
          unit_price: cnTotal,
        },
      ]
    } else {
      payloadLines = lines
        .filter((l) => l.checked && l.credit_qty > 0)
        .map((l) => ({
          invoice_line_id: l.invoice_line_id,
          description: l.description,
          qty: l.credit_qty,
          unit_price: l.original_unit_price,
        }))
    }

    setSaving(true)
    try {
      await createCreditNote.mutateAsync({
        invoice_id: selectedInvoice.id,
        customer_name: selectedInvoice.customer_name ?? '',
        reason: finalReason,
        lines: payloadLines,
      })
      toast.success('Credit note created')
      close()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:max-w-2xl sm:rounded-lg flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-primary" />
            Create Credit Note
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 sm:flex-initial overflow-y-auto overflow-x-hidden px-6 py-4 space-y-4">
          {/* Step 1: Invoice picker */}
          <div className="space-y-1.5">
            <Label htmlFor="cn-invoice">Original Invoice <span className="text-destructive">*</span></Label>
            <Select value={selectedInvoiceId} onValueChange={(v) => setSelectedInvoiceId(v ?? '')}>
              <SelectTrigger id="cn-invoice">
                <SelectValue placeholder="Select an invoice…" />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {eligibleInvoices.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No eligible invoices</div>
                )}
                {eligibleInvoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    <span className="font-mono text-xs">{inv.invoice_id}</span>
                    <span className="mx-1 text-muted-foreground">·</span>
                    {inv.customer_name}
                    <span className="mx-1 text-muted-foreground">·</span>
                    <span className="tabular-nums">{formatCurrency(inv.total_amount ?? 0, 'QAR')}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Everything below is gated on invoice selection */}
          {selectedInvoice && (
            <>
              {/* Summary card */}
              <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Invoice total</div>
                  <div className="font-semibold tabular-nums">{formatCurrency(invoiceTotal, 'QAR')}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Already credited</div>
                  <div className={cn(
                    'font-semibold tabular-nums',
                    alreadyCredited > 0 && 'text-amber-600'
                  )}>
                    {formatCurrency(alreadyCredited, 'QAR')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Remaining creditable</div>
                  <div className={cn(
                    'font-semibold tabular-nums',
                    remainingCreditable === 0 ? 'text-destructive' : 'text-foreground'
                  )}>
                    {formatCurrency(remainingCreditable, 'QAR')}
                  </div>
                </div>
              </div>

              {remainingCreditable === 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  This invoice is fully credited. No further credit can be issued against it.
                </div>
              )}

              {remainingCreditable > 0 && (
                <>
                  {/* Type toggle */}
                  <div className="space-y-1.5">
                    <Label>Credit Type <span className="text-destructive">*</span></Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'full', label: 'Full', desc: 'Credit remaining balance' },
                        { value: 'partial', label: 'Partial', desc: 'Single amount' },
                        { value: 'line', label: 'Line-by-line', desc: 'Pick invoice lines' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setMode(opt.value)}
                          aria-pressed={mode === opt.value}
                          className={cn(
                            'rounded-md border p-2.5 text-left transition-colors min-h-[64px]',
                            mode === opt.value
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                              : 'border-border hover:bg-accent'
                          )}
                        >
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Full mode preview */}
                  {mode === 'full' && (
                    <div className="rounded-md border bg-background p-3 text-sm">
                      <div className="text-muted-foreground text-xs mb-1">Will credit the full remaining balance</div>
                      <div className="text-lg font-semibold tabular-nums">{formatCurrency(remainingCreditable, 'QAR')}</div>
                    </div>
                  )}

                  {/* Partial mode input */}
                  {mode === 'partial' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="cn-partial">
                        Amount <span className="text-destructive">*</span>
                        <span className="ml-1 text-xs text-muted-foreground font-normal">
                          (max {formatCurrency(remainingCreditable, 'QAR')})
                        </span>
                      </Label>
                      <Input
                        id="cn-partial"
                        type="number"
                        min={0.01}
                        max={remainingCreditable}
                        step={0.01}
                        value={partialAmount}
                        onChange={(e) => setPartialAmount(e.target.value)}
                        placeholder="0.00"
                        className="tabular-nums"
                      />
                    </div>
                  )}

                  {/* Line-by-line editor */}
                  {mode === 'line' && (
                    <div className="space-y-2">
                      <Label>Select Lines to Credit <span className="text-destructive">*</span></Label>
                      {lines.length === 0 ? (
                        <div className="rounded-md border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                          This invoice has no line items to credit.
                        </div>
                      ) : (
                        <div className="rounded-md border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr className="text-muted-foreground text-xs">
                                <th className="w-10 py-2 pl-2"></th>
                                <th className="text-left py-2 pr-2 font-medium">Description</th>
                                <th className="text-right py-2 px-2 font-medium w-16">Orig.</th>
                                <th className="text-right py-2 px-2 font-medium w-24">Credit Qty</th>
                                <th className="text-right py-2 px-2 font-medium w-24">Unit Price</th>
                                <th className="text-right py-2 pr-3 font-medium w-24">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((line, idx) => {
                                const lineTotal = line.checked ? line.credit_qty * line.original_unit_price : 0
                                return (
                                  <tr key={line.invoice_line_id} className={cn('border-t', !line.checked && 'opacity-50')}>
                                    <td className="py-2 pl-2">
                                      <Checkbox
                                        checked={line.checked}
                                        onCheckedChange={(v) =>
                                          setLines((prev) =>
                                            prev.map((l, i) => (i === idx ? { ...l, checked: !!v } : l))
                                          )
                                        }
                                      />
                                    </td>
                                    <td className="py-2 pr-2 text-xs">{line.description || <span className="text-muted-foreground">—</span>}</td>
                                    <td className="text-right py-2 px-2 text-xs tabular-nums text-muted-foreground">{line.original_qty}</td>
                                    <td className="py-2 px-2">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={line.original_qty}
                                        step={0.01}
                                        disabled={!line.checked}
                                        value={line.credit_qty}
                                        onChange={(e) => {
                                          const v = Math.min(line.original_qty, Math.max(0, Number(e.target.value)))
                                          setLines((prev) =>
                                            prev.map((l, i) => (i === idx ? { ...l, credit_qty: v } : l))
                                          )
                                        }}
                                        className="h-8 text-right text-xs tabular-nums"
                                      />
                                    </td>
                                    <td className="text-right py-2 px-2 text-xs tabular-nums text-muted-foreground">
                                      {formatCurrency(line.original_unit_price, 'QAR')}
                                    </td>
                                    <td className="text-right py-2 pr-3 text-xs tabular-nums font-medium">
                                      {formatCurrency(lineTotal, 'QAR')}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reason */}
                  <div className="space-y-1.5">
                    <Label htmlFor="cn-reason">Reason <span className="text-destructive">*</span></Label>
                    <Select value={reasonPick} onValueChange={(v) => setReasonPick(v ?? '')} disabled={loadingReasons}>
                      <SelectTrigger id="cn-reason">
                        <SelectValue placeholder="Select reason…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {reasons.map((r) => (
                          <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_REASON}>Other (specify)…</SelectItem>
                      </SelectContent>
                    </Select>
                    {reasonPick === CUSTOM_REASON && (
                      <Textarea
                        rows={2}
                        placeholder="Describe the reason for this credit note…"
                        value={customReason}
                        onChange={(e) => setCustomReason(e.target.value)}
                      />
                    )}
                  </div>

                  {/* Total + validation banner */}
                  <div className={cn(
                    'rounded-md border p-3 flex items-center justify-between',
                    overLimit
                      ? 'border-destructive/40 bg-destructive/5'
                      : 'border-border bg-muted/30'
                  )}>
                    <div className="text-sm">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">CN Total</div>
                      <div className={cn(
                        'text-lg font-bold tabular-nums',
                        overLimit && 'text-destructive'
                      )}>
                        {formatCurrency(cnTotal, 'QAR')}
                      </div>
                    </div>
                    {overLimit && (
                      <div className="text-xs text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Exceeds remaining {formatCurrency(remainingCreditable, 'QAR')}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 px-6 py-4 border-t shrink-0 bg-background rounded-b-lg">
          <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!isValid || saving}>
            {saving ? 'Creating…' : 'Create Draft CN'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
