'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, Mail } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { PhoneInputWithCode } from '@/components/shared/PhoneInputWithCode'
import { useAllCustomers, useCreateCustomer } from '@/hooks/useSaleOrders'
import { useCreditGroups, useAssignCreditGroup } from '@/hooks/useCreditGroups'

const PAGE_SIZE = 50

export default function CustomersPage() {
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage]                       = useState(0)
  const debounceRef                           = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Create customer dialog state
  const [createOpen, setCreateOpen]           = useState(false)
  const [newName, setNewName]                 = useState('')
  const [newPhone, setNewPhone]               = useState('')
  const [newCountryCode, setNewCountryCode]   = useState('+974')
  const [newEmail, setNewEmail]               = useState('')
  const [newType, setNewType]                 = useState<'cash' | 'credit'>('credit')
  const [newEntity, setNewEntity]             = useState<'individual' | 'business'>('individual')
  const [newGroupId, setNewGroupId]           = useState('')

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
  const assignGroup            = useAssignCreditGroup()
  const createCustomer         = useCreateCustomer()

  function handleAssign(customerId: string, groupId: string) {
    const groupName = groups.find((g) => g.id === groupId)?.name
    assignGroup.mutate(
      { customerId, groupId, groupName },
      {
        onSuccess: () => toast.success('Credit group updated'),
        onError:   (err) => toast.error(err.message),
      }
    )
  }

  function resetForm() {
    setNewName(''); setNewPhone(''); setNewCountryCode('+974')
    setNewEmail(''); setNewType('credit'); setNewEntity('individual')
    setNewGroupId('')
  }

  function handleCreate() {
    if (!newName.trim() || !newPhone.trim()) {
      toast.error('Name and phone are required')
      return
    }
    if (newType === 'credit' && !newGroupId) {
      toast.error('Select a credit group for credit customers')
      return
    }
    createCustomer.mutate(
      {
        name:            newName.trim(),
        phone:           `${newCountryCode}${newPhone.trim()}`,
        email:           newEmail.trim() || null,
        customer_type:   newType,
        entity_type:     newEntity,
        credit_group_id: newType === 'credit' ? newGroupId : null,
      },
      {
        onSuccess: () => {
          toast.success('Customer created')
          setCreateOpen(false)
          resetForm()
        },
        onError: (err) => toast.error(err.message),
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
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setCreateOpen(true)}>
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
                  </TableRow>
                ))
              : customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{c.name}</div>
                          {c.entity_type && (
                            <span className="text-[10px] text-muted-foreground capitalize">{c.entity_type}</span>
                          )}
                        </div>
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
                      <Select
                        value={c.credit_group_id ?? ''}
                        onValueChange={(val) => { if (val) handleAssign(c.id, val) }}
                        disabled={assignGroup.isPending}
                      >
                        <SelectTrigger className="h-8 w-44 text-xs">
                          <span className={c.credit_group_name ? '' : 'text-muted-foreground'}>
                            {c.credit_group_name ?? 'Assign group…'}
                          </span>
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

      {/* Create Customer Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); resetForm() } else setCreateOpen(true) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Customer name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Phone <span className="text-destructive">*</span></Label>
              <PhoneInputWithCode
                value={newPhone}
                onChange={setNewPhone}
                countryCode={newCountryCode}
                onCountryCodeChange={setNewCountryCode}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Entity Type <span className="text-destructive">*</span></Label>
                <Select value={newEntity} onValueChange={(v) => setNewEntity(v as 'individual' | 'business')}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Customer Type <span className="text-destructive">*</span></Label>
                <Select value={newType} onValueChange={(v) => { setNewType(v as 'cash' | 'credit'); setNewGroupId('') }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newType === 'credit' && (
              <div className="space-y-1.5">
                <Label>Credit Group <span className="text-destructive">*</span></Label>
                <Select value={newGroupId} onValueChange={(v) => { if (v) setNewGroupId(v) }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select group…" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.filter((g) => g.name !== 'Cash Customers').map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm() }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createCustomer.isPending}>
              {createCustomer.isPending ? 'Creating…' : 'Create Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
