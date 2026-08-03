'use client'

import { useState } from 'react'
import { Plus, Pencil, Power, PowerOff, Package, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  useWarehouseSubContainersAdmin,
  useDeactivateWarehouseSubContainer,
  useReactivateWarehouseSubContainer,
  type WarehouseSubContainer,
} from '@/hooks/useWarehouseSubContainers'
import { SubContainerFormDialog } from '@/components/master-data/SubContainerFormDialog'

interface Props {
  warehouseId: string
  warehouseName: string
  warehouseIsVirtual: boolean
  warehouseKind?: string | null
}

export function WarehouseSubContainersSection({
  warehouseId,
  warehouseName,
  warehouseIsVirtual,
  warehouseKind,
}: Props) {
  const { data: subs = [], isLoading } = useWarehouseSubContainersAdmin(warehouseId)
  const deactivate = useDeactivateWarehouseSubContainer()
  const reactivate = useReactivateWarehouseSubContainer()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseSubContainer | null>(null)
  const [toggleTarget, setToggleTarget] =
    useState<WarehouseSubContainer | null>(null)

  function handleConfirmToggle() {
    if (!toggleTarget) return
    const isActive = toggleTarget.is_active
    const runner = isActive ? deactivate : reactivate
    runner
      .mutateAsync({ id: toggleTarget.id, warehouse_id: warehouseId })
      .then(
        () => {
          toast.success(`"${toggleTarget.name}" ${isActive ? 'deactivated' : 'reactivated'}`)
          setToggleTarget(null)
        },
        (err: Error) => {
          toast.error(err.message)
          setToggleTarget(null)
        },
      )
  }

  return (
    <div className="pl-4 py-3 bg-muted/30 border-l-2 border-primary/20 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Package className="h-3 w-3" />
          Sub-containers
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
            {subs.length}
          </Badge>
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 min-h-11 md:min-h-0 text-xs gap-1"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-2">Loading…</p>
      ) : subs.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 italic">
          No sub-containers yet. Add one to start placing stock in this warehouse.
        </p>
      ) : (
        <div className="space-y-1">
          {subs.map((sc) => (
            <div
              key={sc.id}
              className={`flex items-start justify-between gap-2 rounded-sm px-2 py-1.5 text-xs bg-background border ${
                sc.is_active ? '' : 'opacity-60'
              }`}
            >
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{sc.name}</span>
                  {sc.division_name ? (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">
                      {sc.division_name}
                    </Badge>
                  ) : warehouseIsVirtual ? (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">
                      Virtual (no division)
                    </Badge>
                  ) : null}
                  {!sc.is_active && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 flex-shrink-0">
                      Inactive
                    </Badge>
                  )}
                </div>
                {sc.responsible_person_name ? (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <UserRound className="h-3 w-3 shrink-0" />
                    <span className="truncate">{sc.responsible_person_name}</span>
                    {sc.responsible_person_phone && (
                      <span className="text-[10px]">· {sc.responsible_person_phone}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground italic">
                    <UserRound className="h-3 w-3 shrink-0" />
                    <span>Unassigned</span>
                  </div>
                )}
              </div>
              <div className="flex gap-0.5 flex-shrink-0 pt-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  aria-label="Edit sub-container"
                  onClick={() => {
                    setEditing(sc)
                    setDialogOpen(true)
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={`h-6 w-6 ${sc.is_active ? 'text-destructive hover:text-destructive' : 'text-primary hover:text-primary'}`}
                  aria-label={sc.is_active ? 'Deactivate sub-container' : 'Reactivate sub-container'}
                  onClick={() => setToggleTarget(sc)}
                >
                  {sc.is_active ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SubContainerFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        warehouseId={warehouseId}
        warehouseName={warehouseName}
        warehouseIsVirtual={warehouseIsVirtual}
        warehouseKind={warehouseKind}
        subContainer={editing}
      />

      <AlertDialog
        open={!!toggleTarget}
        onOpenChange={(open) => !open && setToggleTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.is_active ? 'Deactivate' : 'Reactivate'} sub-container?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active ? (
                <>
                  This marks <strong>{toggleTarget?.name}</strong> as inactive.
                  Existing stock rows keep pointing to it (deactivation does not delete),
                  but operators will no longer be able to route new stock into it.
                  You can reactivate later.
                </>
              ) : (
                <>
                  This makes <strong>{toggleTarget?.name}</strong> active again.
                  Operators will be able to route new stock into it from pickers.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivate.isPending || reactivate.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={toggleTarget?.is_active ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
              onClick={handleConfirmToggle}
              disabled={deactivate.isPending || reactivate.isPending}
            >
              {(deactivate.isPending || reactivate.isPending) ? 'Saving…' : (toggleTarget?.is_active ? 'Deactivate' : 'Reactivate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
