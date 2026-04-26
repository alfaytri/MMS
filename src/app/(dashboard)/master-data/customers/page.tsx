'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
import { useAllCustomers } from '@/hooks/useSaleOrders'
import { useCreditGroups, useAssignCreditGroup } from '@/hooks/useCreditGroups'

const PAGE_SIZE = 50

export default function CustomersPage() {
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage]                       = useState(0)
  const debounceRef                           = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleSearch(val: string) {
    setSearch(val)
    setPage(0)
    // useRef — does NOT trigger a re-render, unlike useState
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300)
  }

  const { data, isLoading }  = useAllCustomers(debouncedSearch, page)
  const customers             = data?.customers ?? []
  const total                 = data?.total ?? 0
  const totalPages            = Math.ceil(total / PAGE_SIZE)

  const { data: groups = [] } = useCreditGroups()
  const assignGroup           = useAssignCreditGroup()

  function handleAssign(customerId: string, groupId: string) {
    assignGroup.mutate(
      { customerId, groupId },
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

      <Input
        placeholder="Search by name…"
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Phone</TableHead>
              <TableHead className="hidden md:table-cell">Type</TableHead>
              <TableHead>Credit Group</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-36" /></TableCell>
                  </TableRow>
                ))
              : customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{c.name}</div>
                      {c.is_blocked && (
                        <Badge variant="outline" className="text-[9px] border-destructive text-destructive mt-0.5">Blocked</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {c.phone ?? '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground capitalize">
                      {c.customer_type ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={c.credit_group_id ?? ''}
                        onValueChange={(val) => handleAssign(c.id, val as string)}
                        disabled={assignGroup.isPending}
                      >
                        <SelectTrigger className="h-8 w-40 text-xs">
                          <SelectValue placeholder="Assign group…" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
