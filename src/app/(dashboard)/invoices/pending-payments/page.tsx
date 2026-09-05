'use client'

import { useState, useMemo } from 'react'
import { Receipt, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { CustomerPendingCard } from '@/components/invoices/CustomerPendingCard'
import { CustomerInvoiceDetailDialog } from '@/components/invoices/CustomerInvoiceDetailDialog'
import { usePendingPayments, type CustomerPending } from '@/hooks/usePendingPayments'
import { formatCurrency } from '@/lib/utils/formatters'

export default function PendingPaymentsPage() {
  const { data: customers = [], isLoading } = usePendingPayments()
  const [search, setSearch] = useState('')
  const [detailTarget, setDetailTarget] = useState<CustomerPending | null>(null)

  // Filter by name / phone (list is already sorted by total_pending DESC from the RPC).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) =>
      c.customer_name.toLowerCase().includes(q) ||
      c.phones.some((p) => p.phone.toLowerCase().includes(q)) ||
      (c.customer_phone ?? '').toLowerCase().includes(q)
    )
  }, [customers, search])

  const totalOutstanding = useMemo(
    () => customers.reduce((sum, c) => sum + c.total_pending, 0),
    [customers]
  )

  return (
    <PageWrapper>
      {/* ── Header + search ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl 2xl:text-3xl font-bold">Pending Payments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Total Pending Payments:{' '}
            <span className="font-semibold text-foreground">
              {formatCurrency(totalOutstanding, 'QAR')}
            </span>
            {' · '}
            {customers.length} customer{customers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
      </div>

      {/* ── Customer grid ───────────────────────────────────────────── */}
      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Receipt className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            {search.trim() ? 'No customers match your search' : 'No pending payments'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {filtered.map((customer) => (
            <CustomerPendingCard
              key={customer.group_key}
              customer={customer}
              onView={setDetailTarget}
            />
          ))}
        </div>
      )}

      {/* ── Detail dialog ───────────────────────────────────────────── */}
      <CustomerInvoiceDetailDialog
        open={!!detailTarget}
        onOpenChange={(v) => { if (!v) setDetailTarget(null) }}
        customer={detailTarget}
      />
    </PageWrapper>
  )
}
