'use client'

import { useState } from 'react'
import { Plus, Pencil, PowerOff, Package } from 'lucide-react'
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
  useWarehouseSubContainers,
  useDeactivateWarehouseSubContainer,
  type WarehouseSubContainer,
} from '@/hooks/useWarehouseSubContainers'
import { SubContainerFormDialog } from '@/components/master-data/SubContainerFormDialog'

interface Props {
  warehouseId: string
  warehouseName: string
  warehouseIsVirtual: boolean
}

export function WarehouseSubContainersSection({
  warehouseId,
  warehouseName,
  warehouseIsVirtual,
}: Props) {
  const { data: subs = [], isLoading } = useWarehouseSubContainers(warehouseId)
  const deactivate = useDeactivateWarehouseSubContainer()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseSubContainer | null>(null)
  const [deactivateTarget, setDeactivateTarget] =
    useState<WarehouseSubContainer | null>(null)

  function handleDeactivate() {
    if (!deactivateTarget) return
    deactivate.mutateAsync(deactivateTarget.id).then(
      () => {
        toast.success(`"${deactivateTarget.name}" deactivated`)
        setDeactivateTarget(null)
      },
      (err: Error) => {
        toast.error(err.message)
        setDeactivateTarget(null)
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
              className={`flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs bg-background border ${
                sc.is_active ? '' : 'opacity-60'
              }`}
            >
              <div className="flex-1 min-w-0 flex items-center gap-2">
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
              <div className="flex gap-0.5 flex-shrink-0">
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
                {sc.is_active && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    aria-label="Deactivate sub-container"
                    onClick={() => setDeactivateTarget(sc)}
                  >
                    <PowerOff className="h-3 w-3" />
                  </Button>
                )}
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
        subContainer={editing}
      />

      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate sub-container?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks <strong>{deactivateTarget?.name}</strong> as inactive.
              Existing stock rows keep pointing to it (deactivation does not delete),
              but operators will no longer be able to route new stock into it.
              You can reactivate later by editing the sub-container.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeactivate}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
