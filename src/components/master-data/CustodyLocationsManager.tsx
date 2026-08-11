'use client'

import { useMemo, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Power, Users2, User } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  CustodyLocationFormDialog,
  type CustodyLocationSubmitValues,
} from './CustodyLocationFormDialog'
import {
  useCustodyWarehouses,
  useCustodyLocations,
  useCreateCustodyLocation,
  useUpdateCustodyLocation,
  type CustodyLocationRow,
} from '@/hooks/useCustodyLocations'

/**
 * Master-data admin for custody locations (teams / projects / sites). Custody
 * warehouses are picked with a tab row; each warehouse holds its own set of
 * locations (sub-containers). Self-contained — the route page just renders it.
 */
export function CustodyLocationsManager() {
  const { data: warehouses = [], isLoading: whLoading } = useCustodyWarehouses()
  const [selectedWhId, setSelectedWhId] = useState<string>('')
  useEffect(() => {
    if (!selectedWhId && warehouses.length > 0) setSelectedWhId(warehouses[0].id)
  }, [warehouses, selectedWhId])

  const { data: rows = [], isLoading } = useCustodyLocations(selectedWhId || null)
  const create = useCreateCustodyLocation()
  const update = useUpdateCustodyLocation()
  const isPending = create.isPending || update.isPending

  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CustodyLocationRow | null>(null)

  const selectedWh = warehouses.find((w) => w.id === selectedWhId)
  // The list query is already warehouse-scoped, but guard the transient window
  // between mount (selectedWhId='') and the effect that picks the first tab.
  const rowsForWh = useMemo(() => rows.filter((r) => r.warehouse_id === selectedWhId), [rows, selectedWhId])
  const filtered = useMemo(() => {
    if (!search.trim()) return rowsForWh
    const q = search.trim().toLowerCase()
    return rowsForWh.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.division_name ?? '').toLowerCase().includes(q) ||
        (r.responsible_person_name ?? '').toLowerCase().includes(q),
    )
  }, [rowsForWh, search])

  async function handleCreate(v: CustodyLocationSubmitValues) {
    await create.mutateAsync({ warehouse_id: selectedWhId, ...v })
  }
  async function handleUpdate(id: string, v: CustodyLocationSubmitValues) {
    await update.mutateAsync({ id, warehouse_id: selectedWhId, ...v })
  }
  function handleSetActive(id: string, isActive: boolean) {
    update.mutate(
      { id, warehouse_id: selectedWhId, is_active: isActive },
      {
        onSuccess: () => toast.success(isActive ? 'Location activated' : 'Location deactivated'),
        onError: (e) => toast.error((e as Error).message),
      },
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Custody Locations"
        description="Teams, projects, and off-site sites that hold and consume stock out of the warehouse."
        action={
          selectedWhId
            ? { label: 'Add Location', onClick: () => { setEditing(null); setDialogOpen(true) } }
            : undefined
        }
      />

      {whLoading ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Loading…</p>
      ) : warehouses.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">
          No custody warehouses yet. Create one in Master Data → Warehouses (Type = Custody) first.
        </p>
      ) : (
        <>
          {warehouses.length > 1 && (
            <Tabs value={selectedWhId} onValueChange={setSelectedWhId}>
              <TabsList className="self-start">
                {warehouses.map((w) => (
                  <TabsTrigger key={w.id} value={w.id} className="gap-1.5">
                    <Users2 className="h-3.5 w-3.5" /> {w.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          <SearchInput value={search} onChange={setSearch} placeholder="Search locations…" />

          {isLoading ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Loading locations…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              {search.trim()
                ? 'No locations match your search.'
                : `No locations in ${selectedWh?.name ?? 'this warehouse'} yet. Click "Add Location" to create one.`}
            </p>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((r) => (
                <Card key={r.id} className={r.is_active ? undefined : 'opacity-60'}>
                  <CardHeader className="py-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Users2 className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-sm font-semibold truncate">{r.name}</h3>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                            {r.division_name ?? 'Unassigned'}
                          </Badge>
                          {!r.is_active && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">Inactive</Badge>
                          )}
                        </div>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3 shrink-0" />
                          <span className="truncate">{r.responsible_person_name || 'Unassigned'}</span>
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Open actions" />
                          }
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditing(r); setDialogOpen(true) }}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSetActive(r.id, !r.is_active)}>
                            <Power className="h-4 w-4 mr-2" /> {r.is_active ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <CustodyLocationFormDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null) }}
        warehouseName={selectedWh?.name ?? 'Custody'}
        row={editing}
        isPending={isPending}
        onSubmit={(v) => (editing ? handleUpdate(editing.id, v) : handleCreate(v))}
      />
    </PageWrapper>
  )
}
