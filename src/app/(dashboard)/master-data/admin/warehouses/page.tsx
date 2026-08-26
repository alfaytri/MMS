'use client'

import { useState, useMemo } from 'react'
import { MoreHorizontal, Pencil, Trash2, ChevronDown, ChevronRight, Package, WarehouseIcon, User } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { WarehouseFormDialog } from '@/components/master-data/WarehouseFormDialog'
import { WarehouseSubContainersSection } from '@/components/master-data/WarehouseSubContainersSection'
import { useWarehouses, useDeleteWarehouse, type Warehouse } from '@/hooks/useWarehouses'
import { AddressMapLink } from '@/components/shared/AddressMapLink'
import { formatNumber } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export default function WarehousesPage() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Master data view includes virtual warehouses so admins can manage their
  // sub-containers (repair-vendor shadows).
  const { data: warehouses = [], isLoading } = useWarehouses({ includeVirtual: true })
  const deleteWarehouse = useDeleteWarehouse()

  const filtered = useMemo(() => {
    if (!search.trim()) return warehouses
    const q = search.trim().toLowerCase()
    return warehouses.filter((w) =>
      w.name.toLowerCase().includes(q)
      || (w.location ?? '').toLowerCase().includes(q)
      || (w.company_name ?? '').toLowerCase().includes(q)
    )
  }, [warehouses, search])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteWarehouse.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`"${deleteTarget.name}" deleted`)
        setDeleteTarget(null)
      },
      onError: (err) => {
        toast.error(err.message)
        setDeleteTarget(null)
      },
    })
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Warehouses"
        description="Manage warehouse locations and their sub-containers"
        action={{
          label: 'Add Warehouse',
          onClick: () => {
            setEditing(null)
            setDialogOpen(true)
          },
        }}
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Search warehouses…" />

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Loading warehouses…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">
          {search.trim()
            ? 'No warehouses match your search.'
            : 'No warehouses yet. Click "Add Warehouse" to create one.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((wh, i) => {
            const isOpen = expanded.has(wh.id)
            return (
              <Card key={wh.id} className={cn('overflow-hidden', STAGGER_IN)} style={staggerDelay(i)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0 -ml-1"
                      aria-label={isOpen ? 'Collapse sub-containers' : 'Expand sub-containers'}
                      onClick={() => toggleExpand(wh.id)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                    <WarehouseIcon className="h-4 w-4 text-primary flex-shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-sm font-semibold truncate">{wh.name}</h3>
                        {wh.is_virtual && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">
                            Virtual
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {wh.company_name && (
                          <span className="inline-flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {wh.company_name}
                          </span>
                        )}
                        <AddressMapLink
                          address={wh.location}
                          latitude={wh.latitude}
                          longitude={wh.longitude}
                          emptyLabel="No location"
                        />
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 cursor-help border-b border-dashed border-muted-foreground/40">
                                <User className="h-3 w-3" />
                                {wh.responsible_persons.length > 0
                                  ? wh.responsible_persons
                                      .map((rp) => rp.full_name)
                                      .filter(Boolean)
                                      .join(', ')
                                  : 'Unassigned RPs'}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">Warehouse Responsible Persons</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="hidden md:inline-flex items-center gap-1">
                          {formatNumber(wh.item_count ?? 0)} items
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 flex-shrink-0"
                            aria-label="Open actions"
                          />
                        }
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(wh)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleExpand(wh.id)}>
                          <Package className="h-4 w-4 mr-2" />
                          {isOpen ? 'Hide' : 'Show'} sub-containers
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(wh)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                {isOpen && (
                  <CardContent className="pt-0 pb-0 pl-2 pr-4 md:pl-4">
                    <WarehouseSubContainersSection
                      warehouseId={wh.id}
                      warehouseName={wh.name}
                      warehouseIsVirtual={wh.is_virtual}
                      warehouseKind={wh.warehouse_kind}
                    />
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <WarehouseFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        warehouse={editing}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete warehouse?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. Sub-containers
              and stock rows are protected by database constraints — if the warehouse has any,
              deletion will fail. Deactivate sub-containers first if you need to remove the
              warehouse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  )
}
