'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { RepairVendorFormDialog } from '@/components/warehouse/RepairVendorFormDialog'
import {
  useRepairVendors, useUpdateRepairVendor, type RepairVendor,
} from '@/hooks/useRepairVendors'
import { toast } from 'sonner'

export default function RepairVendorsPage() {
  const [search, setSearch]         = useState('')
  const [formOpen, setFormOpen]     = useState(false)
  const [editing, setEditing]       = useState<RepairVendor | null>(null)

  const { data: vendors = [], isLoading } = useRepairVendors()
  const toggle = useUpdateRepairVendor()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vendors
    return vendors.filter((v) =>
      v.name.toLowerCase().includes(q) ||
      (v.phone ?? '').toLowerCase().includes(q) ||
      (v.address ?? '').toLowerCase().includes(q),
    )
  }, [vendors, search])

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(v: RepairVendor) {
    setEditing(v)
    setFormOpen(true)
  }
  function handleToggleActive(v: RepairVendor) {
    toggle.mutate(
      { id: v.id, is_active: !v.is_active },
      {
        onSuccess: () => toast.success(v.is_active ? 'Vendor deactivated' : 'Vendor reactivated'),
        onError:   (err) => toast.error(err.message),
      },
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Repair Vendors"
        description="Off-site repair centers where damaged units get sent. Each vendor is backed by an auto-provisioned virtual warehouse for tracking units while they're out."
        actions={
          <Button onClick={openNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Vendor
          </Button>
        }
      />

      <div className="mb-4 max-w-md">
        <Input
          placeholder="Search by name, phone, or address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-6 w-6 text-muted-foreground" />}
          title={search ? 'No matches' : 'No repair vendors yet'}
          description={search ? 'Try a different search term.' : 'Add your first repair vendor to start sending damaged units for repair.'}
          action={!search ? (
            <Button onClick={openNew} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Vendor
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden lg:table-cell">Address</TableHead>
                <TableHead className="hidden xl:table-cell">Notes</TableHead>
                <TableHead className="w-28 text-center">Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {v.phone ?? '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-xs truncate">
                    {v.address ?? '—'}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-xs text-muted-foreground max-w-sm truncate">
                    {v.notes ?? '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={v.is_active ? 'default' : 'secondary'} className={v.is_active ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15' : ''}>
                      {v.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(v)}
                        disabled={toggle.isPending}
                        className="h-8 text-xs"
                      >
                        {v.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(v)}
                        className="h-8 w-8"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RepairVendorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        vendor={editing}
      />
    </PageWrapper>
  )
}
