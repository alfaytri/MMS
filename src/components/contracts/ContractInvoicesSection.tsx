'use client'

import { useEffect, useMemo, useState } from 'react'
import { CreditCard, FileText, Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import {
  useContractInvoices, useGenerateContractInvoices, useRecordContractInvoicePayment,
} from '@/hooks/useContractInvoices'
import type { ContractInvoice } from '@/types/contracts'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<ContractInvoice['payment_status'], string> = {
  paid:    'bg-emerald-100 text-emerald-700 border-emerald-300',
  partial: 'bg-amber-100 text-amber-700 border-amber-300',
  unpaid:  'bg-muted text-foreground border-border',
}
const STATUS_LABEL: Record<ContractInvoice['payment_status'], string> = {
  paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid',
}

interface Props {
  contractId: string
  /** contracts.live.manage — gates generate + record-payment actions. */
  canManage: boolean
  /** Hide the money actions once a contract is cancelled/completed. */
  locked?: boolean
}

export function ContractInvoicesSection({ contractId, canManage, locked = false }: Props) {
  const { data: invoices = [], isLoading } = useContractInvoices(contractId)
  const generate = useGenerateContractInvoices(contractId)
  const [payTarget, setPayTarget] = useState<ContractInvoice | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const totals = useMemo(() => {
    const total = invoices.reduce((s, i) => s + i.total_amount, 0)
    const paid = invoices.reduce((s, i) => s + i.paid_amount, 0)
    return { total, paid, pending: Math.max(0, total - paid) }
  }, [invoices])

  const handleGenerate = async () => {
    try {
      const n = await generate.mutateAsync()
      toast.success(n > 0 ? `${n} invoice${n === 1 ? '' : 's'} generated` : 'All invoices already exist')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate invoices')
    }
  }

  if (isLoading) {
    return <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices…
    </div>
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No invoices yet for this contract.</p>
        {canManage && !locked && (
          <Button size="sm" className="mt-3" onClick={handleGenerate} disabled={generate.isPending}>
            {generate.isPending
              ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Generating…</>
              : <><RefreshCw className="mr-1 h-3.5 w-3.5" /> Generate invoices from schedule</>}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-4">
        <div>
          <p className="text-xs text-muted-foreground">Billed</p>
          <p className="mt-1 font-semibold">{formatCurrency(totals.total)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Collected</p>
          <p className="mt-1 font-semibold text-emerald-600">{formatCurrency(totals.paid)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="mt-1 text-base font-bold">{formatCurrency(totals.pending)}</p>
        </div>
      </div>

      {/* Invoice list */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="whitespace-normal break-words px-3 py-2 font-semibold">Invoice #</th>
              <th className="whitespace-normal break-words px-3 py-2 font-semibold">Due Date</th>
              <th className="whitespace-normal break-words px-3 py-2 text-right font-semibold">Amount</th>
              <th className="hidden whitespace-normal break-words px-3 py-2 text-right font-semibold sm:table-cell">Paid</th>
              <th className="whitespace-normal break-words px-3 py-2 text-right font-semibold">Balance</th>
              <th className="whitespace-normal break-words px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const balance = Math.max(0, inv.total_amount - inv.paid_amount)
              const overdue = inv.payment_status !== 'paid' && !!inv.due_date && inv.due_date < today
              return (
                <tr key={inv.id} className="border-b border-dashed last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-xs">{inv.invoice_number}</td>
                  <td className={cn('px-3 py-2', overdue && 'font-medium text-red-600')}>
                    {inv.due_date ?? '—'}{overdue && <span className="ml-1 text-[10px] uppercase">overdue</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(inv.total_amount)}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums text-emerald-600 sm:table-cell">{formatCurrency(inv.paid_amount)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(balance)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={cn('text-[10px]', STATUS_STYLE[inv.payment_status])}>
                      {STATUS_LABEL[inv.payment_status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canManage && !locked && inv.payment_status !== 'paid' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPayTarget(inv)}>
                        Record Payment
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <RecordContractPaymentDialog
        contractId={contractId}
        invoice={payTarget}
        open={!!payTarget}
        onOpenChange={(v) => !v && setPayTarget(null)}
      />
    </div>
  )
}

// ── Record-payment dialog ────────────────────────────────────────────────────
function RecordContractPaymentDialog({
  contractId, invoice, open, onOpenChange,
}: {
  contractId: string
  invoice: ContractInvoice | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [amount, setAmount]   = useState('')
  const [methodId, setMethodId] = useState('')
  const [notes, setNotes]     = useState('')

  const { data: methods = [] } = usePaymentMethods()
  const { data: profile }      = useCurrentUserProfile()
  const record                 = useRecordContractInvoicePayment(contractId)

  const total     = invoice?.total_amount ?? 0
  const paid      = invoice?.paid_amount ?? 0
  const remaining = Math.max(0, total - paid)

  useEffect(() => {
    if (open) { setAmount(remaining > 0 ? remaining.toFixed(2) : ''); setMethodId(''); setNotes('') }
  }, [open, remaining])

  const parsed = parseFloat(amount.replace(/,/g, '')) || 0
  const overpay = parsed - remaining > 0.005
  const selectedMethod = methods.find((m) => m.id === methodId)
  const formatDisplay = (v: string) => {
    const n = parseFloat(v.replace(/,/g, ''))
    return isNaN(n) ? v : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const handleSubmit = async () => {
    if (!invoice) return
    if (parsed <= 0)  { toast.error('Amount must be greater than zero'); return }
    if (overpay)      { toast.error(`Amount exceeds remaining balance (${remaining.toFixed(2)})`); return }
    if (!methodId)    { toast.error('Select a payment method'); return }
    try {
      await record.mutateAsync({
        invoiceId:  invoice.id,
        amount:     parsed,
        methodSlug: selectedMethod?.slug ?? null,
        notes:      notes.trim() || null,
        userId:     profile?.id ?? null,
        userName:   profile?.full_name ?? null,
      })
      toast.success('Payment recorded')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Record Payment
          </DialogTitle>
          <DialogDescription>
            For invoice <span className="font-semibold">{invoice?.invoice_number}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Invoice Total</p>
              <p className="mt-1 font-semibold">{formatCurrency(total)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="mt-1 font-semibold text-emerald-600">{formatCurrency(paid)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="mt-1 text-base font-bold">{formatCurrency(remaining)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="ci-pay-amount">Amount</Label>
              <button type="button" onClick={() => setAmount(remaining > 0 ? remaining.toFixed(2) : '')}
                      className="text-xs text-primary hover:underline">
                Full amount ({formatCurrency(remaining)})
              </button>
            </div>
            <Input
              id="ci-pay-amount" type="text" inputMode="decimal" placeholder="0.00" value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
              onBlur={() => setAmount(formatDisplay(amount))}
              className="h-10 font-mono text-lg"
            />
            {overpay && parsed > 0 && (
              <p className="text-xs text-destructive">Amount exceeds remaining balance ({remaining.toFixed(2)})</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ci-pay-method">Payment Method</Label>
              <Select value={methodId} onValueChange={(v) => { if (v) setMethodId(v) }}>
                <SelectTrigger id="ci-pay-method" className="h-10 w-full">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {methods.length === 0 ? (
                    <SelectItem value="__none" disabled>No active payment methods</SelectItem>
                  ) : (
                    methods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Registered By</Label>
              <Input value={profile?.full_name ?? '—'} disabled className="h-10 bg-muted" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ci-pay-notes">Notes (optional)</Label>
            <Textarea id="ci-pay-notes" placeholder="Additional notes…" value={notes}
                      onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={record.isPending || parsed <= 0 || !methodId || overpay}>
            {record.isPending ? 'Recording…' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
