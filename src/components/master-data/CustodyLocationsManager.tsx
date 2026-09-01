'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useMemo, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ChevronDown, MoreHorizontal, Pencil, Power, Users2, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
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
  const { data: allWarehouses = [], isLoading: whLoading } = useCustodyWarehouses()
  // Project-flagged warehouses are managed by Warehouse → Projects (structured
  // projects + disciplines + milestones), so they drop out of these tabs — there's
  // no separate, unstructured "Add location" for projects here anymore.
  const warehouses = useMemo(() => allWarehouses.filter((w) => !w.is_project_warehouse), [allWarehouses])
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
  // Collapsed division groups (keyed by division label). Empty = all expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

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

  // Numeric-aware sort so "Team 2" precedes "Team 10" (a plain string sort put
  // "Team 10" straight after "Team 1"). Also orders the division groups.
  const collator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }),
    [],
  )
  // Group locations by division (label fallback "Unassigned"); divisions A→Z,
  // rows within each group numeric-name-sorted.
  const groups = useMemo(() => {
    const map = new Map<string, CustodyLocationRow[]>()
    for (const r of filtered) {
      const key = r.division_name ?? 'Unassigned'
      const arr = map.get(key)
      if (arr) arr.push(r)
      else map.set(key, [r])
    }
    const entries = Array.from(map.entries())
    entries.sort((a, b) => collator.compare(a[0], b[0]))
    for (const [, arr] of entries) arr.sort((a, b) => collator.compare(a.name, b.name))
    return entries
  }, [filtered, collator])
  // While searching, force-expand so matches inside a collapsed group still show.
  const effectiveCollapsed = search.trim() ? new Set<string>() : collapsed

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
        onError: (e) => toast.error(humanizeDbError(e)),
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
            <div className="space-y-4">
              {groups.map(([division, items]) => {
                const isCollapsed = effectiveCollapsed.has(division)
                return (
                  <div key={division} className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev)
                          if (next.has(division)) next.delete(division)
                          else next.add(division)
                          return next
                        })
                      }
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-accent/40"
                      aria-expanded={!isCollapsed}
                    >
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                          isCollapsed && '-rotate-90',
                        )}
                      />
                      <span className="text-sm font-semibold">{division}</span>
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
                        {items.length}
                      </Badge>
                    </button>

                    {!isCollapsed && (
                      <div className="space-y-2.5 sm:pl-6">
                        {items.map((r, i) => (
                          <Card key={r.id} className={cn(r.is_active ? undefined : 'opacity-60', STAGGER_IN)} style={staggerDelay(i)}>
                            <CardHeader className="py-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                  <Users2 className="h-4 w-4" />
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <h3 className="text-sm font-semibold truncate">{r.name}</h3>
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
                  </div>
                )
              })}
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
