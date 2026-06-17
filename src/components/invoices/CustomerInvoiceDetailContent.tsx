'use client'

import { useMemo, useState } from 'react'
import { CreditCard, Loader2, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { toast } from 'sonner'
import type {
  CustomerPending,
  CustomerPhone,
  PendingInvoice,
} from '@/hooks/usePendingPayments'

const SOURCE_COLORS: Record<string, string> = {
  order:     'bg-blue-100 text-blue-700',
  contract:  'bg-emerald-100 text-emerald-700',
  quotation: 'bg-amber-100 text-amber-700',
  sale:      'bg-amber-100 text-amber-700',
  purchase:  'bg-purple-100 text-purple-700',
}

interface Props {
  customer: CustomerPending
  /** Called with the Dibsy checkout URL after a batch link is created. */
  onLinkCreated?: (url: string) => void
}

interface PhoneGroup {
  phone: CustomerPhone | null  // null = "Other"
  invoices: PendingInvoice[]
}

function groupInvoicesByPhone(
  phones: CustomerPhone[],
  invoices: PendingInvoice[],
): PhoneGroup[] {
  const phoneMap = new Map<string, CustomerPhone>()
  for (const p of phones) phoneMap.set(p.id, p)

  const byPhone = new Map<string | null, PendingInvoice[]>()
  byPhone.set(null, [])
  for (const p of phones) byPhone.set(p.id, [])

  for (const inv of invoices) {
    const key = inv.phone_id && phoneMap.has(inv.phone_id) ? inv.phone_id : null
    byPhone.get(key)!.push(inv)
  }

  const groups: PhoneGroup[] = []
  for (const phone of phones) {
    const list = byPhone.get(phone.id) ?? []
    if (list.length > 0) groups.push({ phone, invoices: list })
  }
  const other = byPhone.get(null) ?? []
  if (other.length > 0) groups.push({ phone: null, invoices: other })

  return groups
}

export function CustomerInvoiceDetailContent({ customer, onLinkCreated }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  const unpaid = useMemo(
    () => customer.invoices.filter((inv) => inv.total_amount - inv.paid_amount > 0),
    [customer.invoices],
  )

  const groups = useMemo(
    () => groupInvoicesByPhone(customer.phones, unpaid),
    [customer.phones, unpaid],
  )

  const outstandingTotal = useMemo(
    () => unpaid.reduce((s, i) => s + (i.total_amount - i.paid_amount), 0),
    [unpaid],
  )

  const selectedTotal = useMemo(
    () =>
      unpaid
        .filter((i) => selected.has(i.id))
        .reduce((s, i) => s + (i.total_amount - i.paid_amount), 0),
    [unpaid, selected],
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(invoices: PendingInvoice[]) {
    const allSelected = invoices.every((i) => selected.has(i.id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const i of invoices) next.delete(i.id)
      } else {
        for (const i of invoices) next.add(i.id)
      }
      return next
    })
  }

  async function handleGenerateLink() {
    if (selected.size === 0) return
    setSending(true)
    try {
      const res = await fetch('/api/payments/dibsy/create-customer-batch-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_ids: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? 'Failed to create payment link')
      }
      const url = data.checkout_url as string
      await navigator.clipboard.writeText(url).catch(() => {})
      toast.success('Payment link copied to clipboard')
      onLinkCreated?.(url)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create payment link')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 md:px-6 border-b bg-background">
        <h2 className="text-lg md:text-xl 2xl:text-2xl font-semibold truncate">
          {customer.customer_name}
        </h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {customer.phones.length === 0 ? (
            <span className="text-xs text-muted-foreground">No phone on file</span>
          ) : (
            customer.phones.map((p) => (
              <Badge
                key={p.id}
                variant="outline"
                className="font-mono text-xs gap-1 px-1.5 py-0.5"
              >
                <Phone className="h-3 w-3" />
                {p.phone}
                {p.is_primary && (
                  <span className="text-[10px] text-primary font-semibold">·primary</span>
                )}
                {p.label && <span className="text-[10px] text-muted-foreground">·{p.label}</span>}
              </Badge>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Outstanding:{' '}
          <span className="font-semibold text-foreground">
            {formatCurrency(outstandingTotal)}
          </span>
        </p>
      </div>

      {/* ── Phone-grouped invoice list ─────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-3 space-y-5">
        {groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No pending invoices
          </p>
        ) : (
          groups.map((g) => {
            const allSelected =
              g.invoices.length > 0 && g.invoices.every((i) => selected.has(i.id))
            return (
              <section key={g.phone?.id ?? 'other'} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-mono text-sm font-semibold truncate">
                      {g.phone ? g.phone.phone : 'Other'}
                    </span>
                    {g.phone?.is_primary && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">
                        Primary
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      · {g.invoices.length}
                    </span>
                  </div>
                  {g.invoices.length > 1 && (
                    <button
                      type="button"
                      className="text-xs font-medium text-primary hover:underline shrink-0 min-h-9 px-2"
                      onClick={() => toggleGroup(g.invoices)}
                    >
                      {allSelected ? 'Clear group' : 'Select group'}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {g.invoices.map((inv) => {
                    const remaining = inv.total_amount - inv.paid_amount
                    const paidPct =
                      inv.total_amount > 0
                        ? (inv.paid_amount / inv.total_amount) * 100
                        : 0
                    const isOverdue = inv.payment_status === 'overdue'
                    const isSelected = selected.has(inv.id)
                    return (
                      <button
                        key={inv.id}
                        type="button"
                        onClick={() => toggle(inv.id)}
                        className={cn(
                          'w-full text-left rounded-lg border p-3 space-y-2 transition-colors min-h-11',
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-accent/30',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            tabIndex={-1}
                            className="h-4 w-4 rounded border-input mt-0.5 shrink-0 pointer-events-none"
                          />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-sm font-semibold">
                                {inv.invoice_id}
                              </span>
                              {inv.division_name && (
                                <Badge variant="outline" className="text-[10px]">
                                  {inv.division_name}
                                </Badge>
                              )}
                              {inv.source_type && (
                                <Badge
                                  className={cn(
                                    'text-[10px] px-1.5 py-0',
                                    SOURCE_COLORS[inv.source_type] ??
                                      'bg-muted text-muted-foreground',
                                  )}
                                >
                                  {inv.source_type}
                                </Badge>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              <span>Issued {formatDate(inv.issued_date)}</span>
                              <span className={cn(isOverdue && 'text-destructive font-medium')}>
                                Due {formatDate(inv.due_date)}
                                {isOverdue && ' · overdue'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span>
                                Paid {formatCurrency(inv.paid_amount)} /{' '}
                                {formatCurrency(inv.total_amount)}
                              </span>
                              <span className="font-semibold text-destructive">
                                {formatCurrency(remaining)} due
                              </span>
                            </div>
                            <Progress value={paidPct} className="h-1.5" />
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })
        )}
      </div>

      {/* ── Sticky pay bar ─────────────────────────────────────── */}
      <div className="border-t bg-background px-4 md:px-6 py-3 flex items-center gap-3">
        <div className="text-xs text-muted-foreground flex-1 min-w-0">
          {selected.size > 0 ? (
            <>
              <span className="font-semibold text-foreground">{selected.size}</span> selected ·{' '}
              <span className="font-semibold text-foreground">
                {formatCurrency(selectedTotal)}
              </span>
            </>
          ) : (
            'Select invoices to generate a payment link'
          )}
        </div>
        <Button
          onClick={handleGenerateLink}
          disabled={selected.size === 0 || sending}
          className="gap-1.5 h-10 shrink-0"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          <span className="hidden sm:inline">
            {sending ? 'Creating…' : 'Generate Link'}
          </span>
          <span className="sm:hidden">{sending ? '…' : 'Link'}</span>
        </Button>
      </div>
    </div>
  )
}
