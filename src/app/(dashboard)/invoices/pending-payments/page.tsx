'use client'

import { useState, useMemo } from 'react'
import { Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { CustomerPendingCard } from '@/components/invoices/CustomerPendingCard'
import { CustomerInvoiceDetailDialog } from '@/components/invoices/CustomerInvoiceDetailDialog'
import { usePendingPayments, type CustomerPending } from '@/hooks/usePendingPayments'
import { formatCurrency } from '@/lib/utils/formatters'

export default function PendingPaymentsPage() {
  const { data: customers = [], isLoading } = usePendingPayments()
  const [divisionFilter, setDivisionFilter] = useState<string | undefined>()
  const [detailTarget, setDetailTarget] = useState<CustomerPending | null>(null)

  // ── Unique divisions from data ──────────────────────────────────────
  const divisions = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers) {
      if (c.division_id && c.division_name) {
        map.set(c.division_id, c.division_name)
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [customers])

  // ── Filtered list — already sorted by total_pending DESC from RPC ───
  const filtered = useMemo(() => {
    if (!divisionFilter) return customers
    return customers.filter((c) => c.division_id === divisionFilter)
  }, [customers, divisionFilter])

  const totalOutstanding = useMemo(
    () => filtered.reduce((sum, c) => sum + c.total_pending, 0),
    [filtered]
  )

  return (
    <PageWrapper>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold">Pending Payments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} customer{filtered.length !== 1 ? 's' : ''} ·{' '}
            {formatCurrency(totalOutstanding)} outstanding
          </p>
        </div>

        {/* Division toggles — only shown when multiple divisions exist */}
        {divisions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            {divisions.map(([id, name]) => (
              <Button
                key={id}
                variant={divisionFilter === id ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() =>
                  setDivisionFilter(divisionFilter === id ? undefined : id)
                }
              >
                {name}
              </Button>
            ))}
            {divisionFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setDivisionFilter(undefined)}
              >
                Clear
              </Button>
            )}
            <Badge variant="secondary" className="ml-auto text-xs">
              Sorted by amount ↓
            </Badge>
          </div>
        )}
      </div>

      {/* ── Customer grid ──────────────────────────────────────────── */}
      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Receipt className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No pending payments</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((customer) => (
            <CustomerPendingCard
              key={customer.customer_id}
              customer={customer}
              onView={setDetailTarget}
            />
          ))}
        </div>
      )}

      {/* ── Detail dialog ──────────────────────────────────────────── */}
      <CustomerInvoiceDetailDialog
        open={!!detailTarget}
        onOpenChange={(v) => { if (!v) setDetailTarget(null) }}
        customer={detailTarget}
      />
    </PageWrapper>
  )
}
