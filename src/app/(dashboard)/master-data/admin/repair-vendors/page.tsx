'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useMemo, useState } from 'react'
import { MoreHorizontal, Pencil, Power, Wrench, Phone, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RepairVendorFormDialog } from '@/components/master-data/RepairVendorFormDialog'
import {
  useRepairVendors,
  useUpdateRepairVendor,
  type RepairVendor,
} from '@/hooks/useRepairVendors'

export default function RepairVendorsPage() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RepairVendor | null>(null)
  const { data: vendors = [], isLoading } = useRepairVendors()
  const update = useUpdateRepairVendor()

  const filtered = useMemo(() => {
    if (!search.trim()) return vendors
    const q = search.trim().toLowerCase()
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.phone ?? '').toLowerCase().includes(q) ||
        (v.address ?? '').toLowerCase().includes(q),
    )
  }, [vendors, search])

  function setActive(v: RepairVendor, isActive: boolean) {
    update.mutate(
      { id: v.id, is_active: isActive },
      {
        onSuccess: () => toast.success(isActive ? 'Vendor activated' : 'Vendor deactivated'),
        onError: (e) => toast.error(humanizeDbError(e)),
      },
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Repair Vendors"
        description="External repair shops — each gets a virtual repair warehouse for send-out & return tracking"
        action={{
          label: 'Add Repair Vendor',
          onClick: () => {
            setEditing(null)
            setDialogOpen(true)
          },
        }}
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Search repair vendors…" />

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Loading repair vendors…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">
          {search.trim()
            ? 'No repair vendors match your search.'
            : 'No repair vendors yet. Click "Add Repair Vendor" to create one.'}
        </p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((v, i) => (
            <Card key={v.id} className={cn(v.is_active ? undefined : 'opacity-60', STAGGER_IN)} style={staggerDelay(i)}>
              <CardHeader className="py-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Wrench className="h-4 w-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-sm font-semibold truncate">{v.name}</h3>
                      {!v.is_active && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {v.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" />
                          {v.phone}
                        </span>
                      )}
                      {v.address && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{v.address}</span>
                        </span>
                      )}
                      {!v.phone && !v.address && <span>No contact details</span>}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label="Open actions"
                        />
                      }
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(v)
                          setDialogOpen(true)
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setActive(v, !v.is_active)}>
                        <Power className="h-4 w-4 mr-2" />
                        {v.is_active ? 'Deactivate' : 'Activate'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <RepairVendorFormDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setEditing(null)
        }}
        vendor={editing}
      />
    </PageWrapper>
  )
}
