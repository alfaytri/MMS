'use client'

import { useState, useRef, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, Mail, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import { EmptyState } from '@/components/shared/EmptyState'
import { CustomerDialog } from '@/components/master-data/CustomerDialog'
import { CreditGroupPendingDialog } from '@/components/master-data/CreditGroupPendingDialog'
import { CreditBalanceDialog } from '@/components/shared/CreditBalanceDialog'
import { useCustomerCreditBalances, groupBalancesByParty } from '@/hooks/useCreditBalances'
import type { CreditGroupRequest } from '@/hooks/useCreditGroupApprovals'
import { useAllCustomers, type Customer } from '@/hooks/useSaleOrders'
import { useCreditGroups } from '@/hooks/useCreditGroups'
import { useHasPermission } from '@/hooks/usePermissions'
import { useAllCustomerCredit, type CustomerCreditSummary } from '@/hooks/useCustomerCredit'
import { CreditUtilizationBar } from '@/components/shared/CreditUtilizationBar'
import { CreditUtilizationDetailDialog } from '@/components/master-data/CreditUtilizationDetailDialog'
import { usePendingCreditGroupRequests } from '@/hooks/useCreditGroupApprovals'

const PAGE_SIZE = 50

export default function CustomersPage() {
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage]                       = useState(0)
  const debounceRef                           = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [createOpen, setCreateOpen]   = useState(false)
  const [editing, setEditing]         = useState<Customer | null>(null)
  const [pendingView, setPendingView] = useState<{ request: CreditGroupRequest; customerName: string } | null>(null)
  const [balanceView, setBalanceView] = useState<{ id: string; name: string } | null>(null)
  const [creditDetail, setCreditDetail] = useState<CustomerCreditSummary | null>(null)

  function handleSearch(val: string) {
    setSearch(val)
    setPage(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300)
  }

  const { data, isLoading }   = useAllCustomers(debouncedSearch, page)
  const customers              = data?.customers ?? []
  const total                  = data?.total ?? 0
  const totalPages             = Math.ceil(total / PAGE_SIZE)

  const { data: groups = [] }  = useCreditGroups()
  const { data: creditRows = [] } = useAllCustomerCredit()
  const creditByCustomer = new Map(creditRows.map((r) => [r.customer_id, r]))
  const { data: pendingRequests = [] } = usePendingCreditGroupRequests()
  const pendingByCustomer = useMemo(
    () => new Map(pendingRequests.map((r) => [r.customer_id, r])),
    [pendingRequests],
  )
  const { data: customerBalances = [] } = useCustomerCreditBalances()
  const balanceByCustomer = useMemo(() => groupBalancesByParty(customerBalances), [customerBalances])
  const canEditCustomer = useHasPermission('master_data.customers.manage')

  return (
    <PageWrapper>
      <PageHeader
        title="Customers"
        description="Assign credit groups — required before creating a sales order"
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Input
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full sm:max-w-sm"
        />
        <Button size="sm" className="gap-1.5 shrink-0 min-h-11 md:min-h-0" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Customer
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">Email</TableHead>
              <TableHead className="hidden md:table-cell">Type</TableHead>
              <TableHead>Credit Group</TableHead>
              <TableHead className="hidden lg:table-cell">Credit Used</TableHead>
              <TableHead>We Owe</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-36" /></TableCell>
                    <TableCell className="hidden lg:table-cell"><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))
              : customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <EmptyState title="No customers found" />
                    </TableCell>
                  </TableRow>
                )
              : customers.map((c, i) => (
                  <TableRow key={c.id} className={cn(c.is_active === false ? 'opacity-50' : '', STAGGER_IN)} style={staggerDelay(i)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{c.name}</div>
                          {c.entity_type && (
                            <span className="text-[10px] text-muted-foreground capitalize">{c.entity_type}</span>
                          )}
                        </div>
                        {c.is_active === false && (
                          <Badge variant="outline" className="text-[9px] border-muted-foreground text-muted-foreground shrink-0">Disabled</Badge>
                        )}
                        {c.is_blocked && (
                          <Badge variant="outline" className="text-[9px] border-destructive text-destructive shrink-0">Blocked</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {c.phone ?? '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {c.email ? (
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[180px]">{c.email}</span>
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {c.credit_group_id ? 'credit' : 'cash'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const pending = pendingByCustomer.get(c.id)
                        return (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-xs truncate ${c.credit_group_name ? '' : 'text-muted-foreground'}`}>
                              {c.credit_group_name ?? '—'}
                            </span>
                            {pending && (
                              <button
                                type="button"
                                onClick={() => setPendingView({ request: pending, customerName: c.name })}
                                title="View pending request"
                                className="shrink-0"
                              >
                                <Badge
                                  variant="outline"
                                  className="text-[9px] border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/50"
                                >
                                  Pending: {pending.requested_group_name ?? '—'}
                                </Badge>
                              </button>
                            )}
                          </div>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {(() => {
                        const cr = creditByCustomer.get(c.id)
                        if (!cr) return <span className="text-xs text-muted-foreground">—</span>
                        const limit = Number(cr.credit_limit ?? 0)
                        if (limit <= 0) return <span className="text-xs text-muted-foreground">—</span>
                        return (
                          <button
                            type="button"
                            onClick={() => setCreditDetail(cr)}
                            className="rounded-sm text-left hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary/40"
                            title="Click for utilization breakdown"
                          >
                            <CreditUtilizationBar
                              used={Number(cr.credit_used ?? 0)}
                              limit={limit}
                              pct={cr.credit_utilization_pct}
                              compact
                            />
                          </button>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const rows = balanceByCustomer.get(c.id) ?? []
                        if (rows.length === 0) return <span className="text-muted-foreground">—</span>
                        return (
                          <button
                            type="button"
                            onClick={() => setBalanceView({ id: c.id, name: c.name })}
                            className="flex flex-wrap items-center gap-1 hover:opacity-80"
                            title="Click for details"
                          >
                            {rows.map((r) => (
                              <Badge
                                key={r.currency}
                                variant="outline"
                                className="text-[10px] font-mono border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300"
                              >
                                {r.currency} {r.open_amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </Badge>
                            ))}
                          </button>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEditCustomer && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 min-h-11 md:min-h-0 min-w-11 md:min-w-0"
                          onClick={() => setEditing(c)}
                          title="Edit customer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} customers · page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <CustomerDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        groups={groups}
      />
      <CustomerDialog
        mode="edit"
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null) }}
        groups={groups}
        customer={editing}
      />
      {pendingView && (
        <CreditGroupPendingDialog
          open={!!pendingView}
          onOpenChange={(o) => { if (!o) setPendingView(null) }}
          request={pendingView.request}
          customerName={pendingView.customerName}
        />
      )}

      {balanceView && (
        <CreditBalanceDialog
          open={!!balanceView}
          onOpenChange={(o) => { if (!o) setBalanceView(null) }}
          partyId={balanceView.id}
          partyName={balanceView.name}
          kind="customer"
        />
      )}

      <CreditUtilizationDetailDialog
        open={!!creditDetail}
        onOpenChange={(o) => { if (!o) setCreditDetail(null) }}
        summary={creditDetail}
      />
    </PageWrapper>
  )
}
