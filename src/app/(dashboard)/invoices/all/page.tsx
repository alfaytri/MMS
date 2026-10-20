'use client'

import { useState, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { CreditCard, FileText, Receipt, RotateCcw } from 'lucide-react'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ALL_INVOICES_LIMIT, httpUrl, invoiceKind, payLinkFor, remainingAmount, useAllInvoices,
  type AllInvoiceRow,
} from '@/hooks/useAllInvoices'
import { humanizeDbError } from '@/lib/dbErrors'
import type { InvoiceType } from '@/lib/invoices/types'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

type BadgeMeta = { label: string; variant: ComponentProps<typeof StatusBadge>['variant']; className?: string }

// Typed on InvoiceType: adding a business line without a label here fails to compile.
const KIND_LABEL: Record<InvoiceType, string> = {
  service: 'Service',
  sales: 'Sales',
  contract: 'Contract',
}

// `invoice_payment_status` enum.
const PAYMENT_STATUS_META: Record<string, BadgeMeta> = {
  unpaid:         { label: 'Unpaid',         variant: 'inactive' },
  partially_paid: { label: 'Partially paid', variant: 'warning' },
  paid:           { label: 'Paid',           variant: 'success' },
  overdue:        { label: 'Overdue',        variant: 'destructive' },
  void:           { label: 'Void',           variant: 'inactive', className: 'line-through' },
}

// `dispatch_status` CHECK values: has the invoice been sent to the customer. The normal
// outcome ('sent') stays quiet so a pending or failed send is what catches the eye.
const SEND_STATUS_META: Record<string, BadgeMeta> = {
  pending: { label: 'Pending', variant: 'pending' },
  sent:    { label: 'Sent',    variant: 'inactive' },
  failed:  { label: 'Failed',  variant: 'destructive' },
  skipped: { label: 'Skipped', variant: 'inactive' },
}

type ChipOption<T extends string> = { value: T | undefined; label: string }

const TYPE_OPTIONS: ChipOption<InvoiceType>[] = [
  { value: undefined, label: 'All' },
  ...(Object.keys(KIND_LABEL) as InvoiceType[]).map((value) => ({ value, label: KIND_LABEL[value] })),
]
const STATUS_OPTIONS: ChipOption<string>[] = [
  { value: undefined, label: 'All' },
  ...Object.entries(PAYMENT_STATUS_META).map(([value, meta]) => ({ value, label: meta.label })),
]

function ChipGroup<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T | undefined
  options: ChipOption<T>[]
  onChange: (value: T | undefined) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full border px-3 py-1 min-h-11 md:min-h-0 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function Dash() {
  return <span className="text-muted-foreground">—</span>
}

function KindBadge({ detailTable, hideWhenUnknown }: { detailTable: string | null; hideWhenUnknown?: boolean }) {
  // A legacy hub row has no detail key, hence no kind.
  const kind = invoiceKind(detailTable)
  if (!kind) return hideWhenUnknown ? null : <Dash />
  return <Badge variant="outline" className="font-medium">{KIND_LABEL[kind]}</Badge>
}

function PaymentBadge({ status }: { status: string }) {
  const meta: BadgeMeta = PAYMENT_STATUS_META[status] ?? { label: status, variant: 'inactive' }
  return <StatusBadge variant={meta.variant} className={meta.className}>{meta.label}</StatusBadge>
}

function SendBadge({ status, sentAt }: { status: string; sentAt: string | null }) {
  // A backfilled row is 'sent' with no sent_at: nothing says it actually went out, so don't claim it.
  if (status === 'sent' && !sentAt) return <Dash />
  const meta: BadgeMeta = SEND_STATUS_META[status] ?? { label: status, variant: 'inactive' }
  return (
    <StatusBadge variant={meta.variant}>
      <span title={status === 'sent' && sentAt ? `Sent ${formatDateTime(sentAt)}` : undefined}>{meta.label}</span>
    </StatusBadge>
  )
}

function DocLink({ href, label, icon: Icon, invoiceId, labelled }: {
  href: string | null
  label: string
  icon: ComponentType<{ className?: string }>
  invoiceId: string
  /** Name the missing link ("Pay link —") where no column header does it (mobile cards). */
  labelled?: boolean
}) {
  if (!href) {
    return labelled
      ? <span className="text-xs text-muted-foreground">{label} —</span>
      : <Dash />
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} for invoice ${invoiceId} (opens in a new tab)`}
      className="inline-flex min-h-11 md:min-h-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  )
}

function Money({ value }: { value: number }) {
  return <span className="block text-right text-xs font-medium tabular-nums">{formatCurrency(value)}</span>
}

function Remaining({ row }: { row: AllInvoiceRow }) {
  // Clamped: an overpaid hub row (paid > total) must never show a negative balance.
  const remaining = remainingAmount(row.total_amount, row.paid_amount)
  // A voided invoice owes nothing, whatever its amounts say: strike the figure through.
  const voided = row.payment_status === 'void'
  return (
    <span
      className={cn(
        'block text-right text-xs tabular-nums',
        voided ? 'text-muted-foreground line-through' : remaining > 0 ? 'font-semibold' : 'text-muted-foreground',
      )}
    >
      {formatCurrency(remaining)}
    </span>
  )
}

// Column headers wrap rather than truncate (the shared TableHead is nowrap).
const header = (title: string, align?: 'right') => (
  <div className={cn('whitespace-normal break-words', align === 'right' && 'text-right')}>{title}</div>
)

const COLUMNS: ColumnDef<AllInvoiceRow>[] = [
  {
    id: 'invoice',
    header: () => header('Invoice #'),
    cell: ({ row }) => (
      <div>
        <span className="font-mono text-sm font-semibold">{row.original.invoice_id}</span>
        <div className="text-xs text-muted-foreground">{formatDate(row.original.created_at)}</div>
      </div>
    ),
  },
  { id: 'type', header: () => header('Type'), cell: ({ row }) => <KindBadge detailTable={row.original.detail_table} /> },
  {
    id: 'customer',
    header: () => header('Customer'),
    // Wraps rather than truncates, so the full name is always readable.
    cell: ({ row }) => (
      <span className="block max-w-56 xl:max-w-72 2xl:max-w-96 whitespace-normal break-words text-sm">
        {row.original.customer_name ?? '—'}
      </span>
    ),
  },
  { id: 'total', header: () => header('Total', 'right'), cell: ({ row }) => <Money value={row.original.total_amount} /> },
  { id: 'paid', header: () => header('Paid', 'right'), cell: ({ row }) => <Money value={row.original.paid_amount} /> },
  { id: 'remaining', header: () => header('Remaining', 'right'), cell: ({ row }) => <Remaining row={row.original} /> },
  { id: 'payment', header: () => header('Payment'), cell: ({ row }) => <PaymentBadge status={row.original.payment_status} /> },
  {
    id: 'send-status',
    header: () => header('Send status'),
    cell: ({ row }) => <SendBadge status={row.original.dispatch_status} sentAt={row.original.sent_at} />,
  },
  {
    id: 'pay-link',
    header: () => header('Pay link'),
    // Only while money is owed, and only a plain http(s) URL (see payLinkFor / httpUrl).
    cell: ({ row }) => (
      <DocLink href={payLinkFor(row.original)} label="Pay link" icon={CreditCard} invoiceId={row.original.invoice_id} />
    ),
  },
  {
    id: 'pdf',
    header: () => header('PDF'),
    cell: ({ row }) => <DocLink href={httpUrl(row.original.pdf_url)} label="PDF" icon={FileText} invoiceId={row.original.invoice_id} />,
  },
]

// Three columns only hold a 7-digit amount ("QAR 1,234,567.50") from about 410px up
// (measured), so below 420px the figures stack as label / value rows instead of
// overflowing or overlapping.
function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-[420px]:block">
      <div className="text-xs uppercase tracking-wide text-muted-foreground min-[420px]:text-right">{label}</div>
      {children}
    </div>
  )
}

function MobileCard({ invoice }: { invoice: AllInvoiceRow }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-semibold">{invoice.invoice_id}</span>
            <KindBadge detailTable={invoice.detail_table} hideWhenUnknown />
          </div>
          <p className="break-words text-sm">{invoice.customer_name ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{formatDate(invoice.created_at)}</p>
        </div>
        <PaymentBadge status={invoice.payment_status} />
      </div>
      <div className="grid grid-cols-1 gap-1 min-[420px]:grid-cols-3 min-[420px]:gap-2">
        <Labeled label="Total"><Money value={invoice.total_amount} /></Labeled>
        <Labeled label="Paid"><Money value={invoice.paid_amount} /></Labeled>
        <Labeled label="Remaining"><Remaining row={invoice} /></Labeled>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <SendBadge status={invoice.dispatch_status} sentAt={invoice.sent_at} />
        <div className="flex items-center gap-4">
          <DocLink href={payLinkFor(invoice)} label="Pay link" icon={CreditCard} invoiceId={invoice.invoice_id} labelled />
          <DocLink href={httpUrl(invoice.pdf_url)} label="PDF" icon={FileText} invoiceId={invoice.invoice_id} labelled />
        </div>
      </div>
    </div>
  )
}

const NO_ROWS: AllInvoiceRow[] = []

export default function AllInvoicesPage() {
  const [type, setType] = useState<InvoiceType | undefined>()
  const [status, setStatus] = useState<string | undefined>()
  const [q, setQ] = useState('')

  const { data, isLoading, isFetching, isError, error, refetch } = useAllInvoices({ type, status, q })
  const rows = data ?? NO_ROWS

  const hasFilters = Boolean(type || status || q.trim())
  const clearFilters = () => {
    setType(undefined)
    setStatus(undefined)
    setQ('')
  }

  return (
    <PageContainer>
      <PageHeader
        title="All Invoices"
        description="Every customer invoice (service, sales and contract) in one place"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search invoice # or customer…" />
        <ChipGroup label="Type" value={type} options={TYPE_OPTIONS} onChange={setType} />
        <ChipGroup label="Payment" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      </div>

      <div className="space-y-2">
        {/* Fixed height, so the Clear button appearing never nudges the table. */}
        <div className="flex min-h-11 md:min-h-8 items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {isError ? '' : isLoading ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'invoice' : 'invoices'}`}
          </p>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="min-h-11 md:min-h-0 gap-1.5 text-xs" onClick={clearFilters}>
              <RotateCcw className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          )}
        </div>

        {isError ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">Could not load invoices</p>
            <p className="mt-1 text-muted-foreground">{humanizeDbError(error)}</p>
            <Button variant="outline" size="sm" className="mt-3 min-h-11 md:min-h-0" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div aria-busy={isFetching} className={cn('transition-opacity', isFetching && !isLoading && 'opacity-60')}>
            <DataTable
              columns={COLUMNS}
              data={rows}
              isLoading={isLoading}
              pageSize={25}
              mobileCardRender={(invoice) => <MobileCard invoice={invoice} />}
              emptyState={{
                title: 'No invoices found',
                description: hasFilters
                  ? 'Try a different search, or clear the filters.'
                  : 'Invoices appear here as they are created.',
                icon: <Receipt className="h-6 w-6 text-muted-foreground" />,
              }}
            />
          </div>
        )}

        {!isError && rows.length >= ALL_INVOICES_LIMIT && (
          <p className="text-xs text-muted-foreground">
            Showing the {ALL_INVOICES_LIMIT} most recent invoices. Use the search or the filters to find older ones.
          </p>
        )}
      </div>
    </PageContainer>
  )
}
