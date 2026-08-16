'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Layers, Lock, Package, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/shared/EmptyState'
import { MilestoneManager } from '@/components/warehouse/projects/MilestoneManager'
import { useDisciplines } from '@/hooks/useDisciplines'
import { useDivisions } from '@/hooks/useDivisions'
import { useHasManagePermission } from '@/hooks/usePermissions'
import { useWarehouseStock, type WarehouseStockItem } from '@/hooks/useWarehouseOperations'
import {
  useAddProjectDiscipline,
  useCloseProject,
  type ProjectDisciplineTag,
  type ProjectWithRollup,
} from '@/hooks/useProjects'

// Matches the sibling rendering of the same `warehouse_sub_container_totals`
// view in ProjectsTab.tsx / WhWarehousesTab.tsx (QR prefix + en-QA locale,
// 2dp) — kept consistent rather than introducing formatCurrency()'s
// different "QAR " style for the same underlying number.
function formatValue(value: number): string {
  return `QR ${value.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface Props {
  project: ProjectWithRollup | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProjectDetail({ project, open, onOpenChange }: Props) {
  const canManage = useHasManagePermission('warehouse.projects')
  const { data: divisions = [] } = useDivisions()
  const {
    data: disciplines = [],
    isLoading: disciplinesLoading,
    isError: disciplinesIsError,
    error: disciplinesError,
  } = useDisciplines()
  // One fetch for the whole warehouse, filtered per discipline bucket below —
  // mirrors CustodyTab's `useWarehouseStock(warehouseId, null)` + client-side
  // `stock.filter(s => s.sub_container_id === sub.id)` pattern, instead of
  // issuing one query per bucket.
  const {
    data: stock = [],
    isLoading: stockLoading,
    isError: stockIsError,
    error: stockError,
  } = useWarehouseStock(project?.warehouse_id, null)
  const addDiscipline = useAddProjectDiscipline()
  const closeProject = useCloseProject()

  const [pickedDisciplineId, setPickedDisciplineId] = useState('')
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  // Defensively close if the caller opened us with an id that no longer
  // resolves (e.g. the division filter changed under the dialog) — avoids
  // rendering a blank dialog shell.
  useEffect(() => {
    if (open && !project) onOpenChange(false)
  }, [open, project, onOpenChange])

  // Reset ephemeral (non-persisted) local state whenever the dialog opens,
  // or when it's re-targeted at a different project while already open.
  useEffect(() => {
    if (!open) return
    setPickedDisciplineId('')
    setCloseError(null)
    setConfirmCloseOpen(false)
  }, [open, project?.id])

  const divisionLabel = useMemo(() => {
    if (!project) return '—'
    const d = divisions.find((x) => x.id === project.division_id)
    return d?.short_name || d?.name || '—'
  }, [divisions, project])

  // Disciplines not yet on this project — the add-discipline picker only
  // ever offers what the `add_project_discipline` partial unique index
  // would actually accept (UUID-guard: value=id, display=name, never id).
  const remainingDisciplines = useMemo(() => {
    if (!project) return []
    const existingIds = new Set(project.disciplines.filter((d) => d.is_active).map((d) => d.discipline_id))
    return disciplines.filter((d) => !existingIds.has(d.id))
  }, [disciplines, project])

  // Stock lives in the ONE project pool; discipline is a spend tag (Option B).
  const poolStock = useMemo(
    () => (project?.poolSubContainerId ? stock.filter((s) => s.sub_container_id === project.poolSubContainerId) : []),
    [stock, project?.poolSubContainerId],
  )
  const activeDisciplines = useMemo(() => project?.disciplines.filter((d) => d.is_active) ?? [], [project])

  // Single-option pre-select, mirroring ProjectFormDialog's division/
  // warehouse selects. Re-fires whenever the remaining set shrinks (e.g.
  // right after a successful add), so the last remaining discipline is
  // pre-picked without the user re-opening the dropdown.
  useEffect(() => {
    if (!open) return
    if (remainingDisciplines.length === 1) {
      setPickedDisciplineId(remainingDisciplines[0].id)
    }
  }, [open, remainingDisciplines])

  async function handleAddDiscipline() {
    if (!project || !pickedDisciplineId) return
    const discipline = disciplines.find((d) => d.id === pickedDisciplineId)
    try {
      await addDiscipline.mutateAsync({ project_id: project.id, discipline_id: pickedDisciplineId })
      toast.success(`${discipline?.name ?? 'Discipline'} added to ${project.project_number}`)
      setPickedDisciplineId('')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function handleConfirmClose() {
    if (!project) return
    try {
      await closeProject.mutateAsync(project.id)
      toast.success(`Project ${project.project_number} closed`)
      setCloseError(null)
      onOpenChange(false)
    } catch (e) {
      // Surfaced both ways: a toast for immediate feedback, and a banner
      // inside the (still-open) detail dialog that outlives the AlertDialog
      // — which auto-closes on Action click regardless of the async
      // outcome, same as PoDetailDialog's delete-payment flow. The banner
      // is what lets the operator actually read the stock-guard message.
      const message = (e as Error).message
      setCloseError(message)
      toast.error(message)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-3xl sm:rounded-lg max-h-[90vh] flex flex-col">
          {project && (
            <>
              <DialogHeader className="shrink-0 border-b pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <DialogTitle className="flex items-center gap-1.5 font-mono text-base">
                      <span className="truncate">{project.project_number}</span>
                      {!project.is_active && (
                        <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-normal text-muted-foreground">
                          Closed
                        </Badge>
                      )}
                    </DialogTitle>
                    <DialogDescription className="truncate">{project.name}</DialogDescription>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">{formatValue(project.totalValue)}</div>
                    <div className="text-[10px] text-muted-foreground">{divisionLabel}</div>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-3 py-3">
                {closeError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                    {closeError}
                  </div>
                )}

                {stockIsError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                    {String((stockError as { message?: string } | null)?.message ?? 'Failed to load stock — the item lists below may be incomplete.')}
                  </div>
                )}

                {canManage && project.is_active && (
                  disciplinesLoading ? (
                    <p className="text-xs text-muted-foreground border border-dashed rounded-md px-3 py-2.5">
                      Loading disciplines…
                    </p>
                  ) : disciplinesIsError ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                      {String((disciplinesError as { message?: string } | null)?.message ?? 'Failed to load disciplines — try again shortly.')}
                    </div>
                  ) : remainingDisciplines.length === 0 ? (
                    <p className="text-xs text-muted-foreground border border-dashed rounded-md px-3 py-2.5">
                      {disciplines.length === 0
                        ? 'No disciplines configured yet.'
                        : 'All disciplines are already on this project.'}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center rounded-md border border-dashed p-3">
                      <Select
                        value={pickedDisciplineId}
                        onValueChange={(v) => setPickedDisciplineId(v ?? '')}
                        disabled={remainingDisciplines.length === 1 || addDiscipline.isPending}
                      >
                        <SelectTrigger className="w-full sm:flex-1 h-11 sm:h-9">
                          <SelectValue placeholder="Select discipline to add" />
                        </SelectTrigger>
                        <SelectContent>
                          {remainingDisciplines.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="gap-1.5 min-h-11 sm:min-h-0 w-full sm:w-auto shrink-0"
                        disabled={!pickedDisciplineId || addDiscipline.isPending}
                        onClick={handleAddDiscipline}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {addDiscipline.isPending ? 'Adding…' : 'Add discipline'}
                      </Button>
                    </div>
                  )
                )}

                {/* The project's single stock pool. */}
                <ProjectStockCard stockRows={poolStock} stockLoading={stockLoading} totalValue={project.totalValue} />

                {/* Disciplines are spend tags; each carries its own milestones. */}
                {activeDisciplines.length === 0 ? (
                  <EmptyState
                    icon={<Layers className="h-6 w-6 text-muted-foreground" />}
                    title="No disciplines yet"
                    description={
                      canManage
                        ? 'Add one above to start tagging spend for this project.'
                        : 'No disciplines have been set up for this project.'
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    {activeDisciplines.map((d) => (
                      <DisciplineCard
                        key={d.discipline_id}
                        discipline={d}
                        poolSubContainerId={project.poolSubContainerId}
                        canManage={canManage}
                      />
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="pt-3 border-t mt-0">
                {canManage && project.is_active && (
                  <Button
                    variant="destructive"
                    className="min-h-11 sm:min-h-0"
                    disabled={closeProject.isPending}
                    onClick={() => {
                      setCloseError(null)
                      setConfirmCloseOpen(true)
                    }}
                  >
                    <Lock className="h-3.5 w-3.5 mr-1.5" />
                    Close Project
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 sm:min-h-0 ml-auto"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {project?.project_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deactivates the project and its stock pool. Closing is blocked while the
              project still holds stock — consume or transfer it out first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closeProject.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={closeProject.isPending}
              onClick={handleConfirmClose}
            >
              {closeProject.isPending ? 'Closing…' : 'Close Project'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── Project stock pool card ───────────────────────────────────────────
// Option B: a project holds ALL its stock in ONE pool sub-container. Mirrors
// CustodyCard's header (name + value/count) + item-row style so the visual
// language matches the rest of the app.
function ProjectStockCard({
  stockRows,
  stockLoading,
  totalValue,
}: {
  stockRows: WarehouseStockItem[]
  stockLoading: boolean
  totalValue: number
}) {
  const totalQty = stockRows.reduce((sum, r) => sum + (r.qty ?? 0), 0)

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-start justify-between gap-2 border-b bg-muted/30">
        <div className="min-w-0 flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-semibold text-sm truncate">Project stock</span>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold tabular-nums">{formatValue(totalValue)}</div>
          <div className="text-[10px] text-muted-foreground">
            {stockRows.length} item{stockRows.length === 1 ? '' : 's'} · {totalQty.toLocaleString()} units
          </div>
        </div>
      </div>

      <div className="px-4 py-2">
        {stockLoading ? (
          <div className="space-y-2 py-1.5">
            {[0, 1].map((i) => (
              <div key={i} className="h-8 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : stockRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
            <Package className="h-5 w-5 mb-1 opacity-30" />
            <p className="text-[11px]">No stock in this project yet — transfer stock into it to get started.</p>
          </div>
        ) : (
          <div className="divide-y max-h-64 overflow-y-auto">
            {stockRows.map((r) => (
              <div
                key={r.brand_variant_id}
                className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-2 text-[11px]"
              >
                <div className="min-w-0">
                  <div className="font-medium break-words text-foreground">{r.item_name}</div>
                  {(r.brand || r.sku) && (
                    <div className="text-[10px] text-muted-foreground break-words">
                      {r.brand}
                      {r.brand && r.sku ? ' · ' : ''}
                      {r.sku}
                    </div>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5 tabular-nums shrink-0 sm:flex-col sm:items-end sm:gap-0 sm:text-right">
                  <span className="text-foreground">
                    {r.qty.toLocaleString()} {r.unit}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{formatValue(r.total_value ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Discipline card (a spend tag + its milestones) ────────────────────
// A discipline no longer holds stock — it's a spend category. The card just
// names it and hosts its milestones (the cost tags used when consuming).
function DisciplineCard({
  discipline,
  poolSubContainerId,
  canManage,
}: {
  discipline: ProjectDisciplineTag
  poolSubContainerId: string | null
  canManage: boolean
}) {
  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-1.5 border-b bg-muted/30">
        <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="font-semibold text-sm truncate">{discipline.discipline_name}</span>
      </div>
      {poolSubContainerId ? (
        <MilestoneManager
          subContainerId={poolSubContainerId}
          disciplineId={discipline.discipline_id}
          canManage={canManage}
        />
      ) : (
        <p className="px-4 py-3 text-[11px] text-muted-foreground">No stock pool for this project.</p>
      )}
    </div>
  )
}
