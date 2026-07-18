'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, Mail, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { CustomerDialog } from '@/components/master-data/CustomerDialog'
import { useAllCustomers, type Customer } from '@/hooks/useSaleOrders'
import { useCreditGroups, useAssignCreditGroup } from '@/hooks/useCreditGroups'
import { useHasPermission } from '@/hooks/usePermissions'
import { useAllCustomerCredit } from '@/hooks/useCustomerCredit'
import { CreditUtilizationBar } from '@/components/shared/CreditUtilizationBar'
import { useSubmitCreditGroupChange } from '@/hooks/useCreditGroupApprovals'

const PAGE_SIZE = 50

export default function CustomersPage() {
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage]                       = useState(0)
  const debounceRef                           = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [createOpen, setCreateOpen]   = useState(false)
  const [editing, setEditing]         = useState<Customer | null>(null)

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
  const assignGroup            = useAssignCreditGroup()
  const submitGroupChange      = useSubmitCreditGroupChange()
  const canChangeCreditGroup   = useHasPermission('master_data.customers.change_credit_group')
  const canEditCustomer        = useHasPermission('master_data.customers.manage')

  function handleAssign(
    customerId: string,
    groupId: string,
    fromGroupId: string | null,
    fromGroupName: string | null,
  ) {
    if (fromGroupId === groupId) return
    const group = groups.find((g) => g.id === groupId)
    const groupName = group?.name
    // Approval gate: groups with a non-zero credit limit go through the
    // PM → AM → Owner workflow. Zero-limit (cash) groups are assigned
    // directly because there's no credit risk to approve.
    const needsApproval = (group?.credit_limit ?? 0) > 0
    if (needsApproval) {
      submitGroupChange.mutate(
        { customerId, groupId },
        {
          onSuccess: (data) => {
            if (data.status === 'approved') {
              toast.success(`Assigned to ${groupName} (no approval needed)`)
            } else {
              toast.success(`Sent for approval: PM → AM → Owner`)
            }
          },
          onError: (err) => toast.error(err.message),
        }
      )
      return
    }
    assignGroup.mutate(
      { customerId, groupId, groupName, fromGroupId, fromGroupName },
      {
        onSuccess: () => toast.success('Credit group updated'),
        onError:   (err) => toast.error(err.message),
      }
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Customers"
        description="Assign credit groups — required before creating a sales order"
      />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="max-w-sm"
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
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))
              : customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <EmptyState title="No customers found" />
                    </TableCell>
                  </TableRow>
                )
              : customers.map((c) => (
                  <TableRow key={c.id} className={c.is_active === false ? 'opacity-50' : ''}>
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
                        {c.customer_type ?? '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {canChangeCreditGroup ? (
                        <Select
                          value={c.credit_group_id ?? ''}
                          onValueChange={(val) => { if (val) handleAssign(c.id, val, c.credit_group_id ?? null, c.credit_group_name ?? null) }}
                          disabled={assignGroup.isPending || submitGroupChange.isPending}
                        >
                          <SelectTrigger className="h-8 min-h-11 md:min-h-0 w-44 text-xs">
                            <span className={c.credit_group_name ? '' : 'text-muted-foreground'}>
                              {c.credit_group_name ?? 'Assign group…'}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {groups
                              .filter((g) => (g.credit_limit ?? 0) > 0)
                              .map((g) => (
                                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {c.credit_group_name ?? '—'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {(() => {
                        const cr = creditByCustomer.get(c.id)
                        if (!cr) return <span className="text-xs text-muted-foreground">—</span>
                        return (
                          <CreditUtilizationBar
                            used={Number(cr.credit_used    ?? 0)}
                            limit={Number(cr.credit_limit  ?? 0)}
                            pct={cr.credit_utilization_pct}
                            compact
                          />
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
    </PageWrapper>
  )
}
