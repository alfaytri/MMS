'use client'

import { useMemo, useState } from 'react'
import { FolderKanban, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ResponsiveTable, type ResponsiveTableColumn } from '@/components/shared/ResponsiveTable'
import { useProjects, type ProjectWithRollup } from '@/hooks/useProjects'
import { useDivisions } from '@/hooks/useDivisions'
import { useHasManagePermission } from '@/hooks/usePermissions'
import { ProjectFormDialog } from './ProjectFormDialog'

// Matches the sibling rendering of the same `warehouse_sub_container_totals`
// view in WhWarehousesTab.tsx (QR prefix + en-QA locale, 2dp) — kept
// consistent rather than introducing formatCurrency()'s different "QAR "
// style for the same underlying number.
function formatValue(value: number): string {
  return `QR ${value.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function ProjectsTab() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { data: projects = [], isLoading, isError, error } = useProjects()
  const { data: divisions = [] } = useDivisions()
  const canManage = useHasManagePermission('warehouse.projects')

  const divisionLabel = useMemo(() => {
    const map = new Map(divisions.map((d) => [d.id, d.short_name || d.name]))
    return (divisionId: string) => map.get(divisionId) ?? '—'
  }, [divisions])

  const columns: ResponsiveTableColumn<ProjectWithRollup>[] = useMemo(
    () => [
      {
        header: 'Number',
        cell: (p) => (
          <span className="inline-flex items-center gap-1.5 font-medium">
            {p.project_number}
            {!p.is_active && (
              <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-normal text-muted-foreground">
                Closed
              </Badge>
            )}
          </span>
        ),
      },
      {
        header: 'Name',
        cell: (p) => <span className="break-words">{p.name}</span>,
      },
      {
        header: 'Division',
        cell: (p) => <span className="text-muted-foreground">{divisionLabel(p.division_id)}</span>,
      },
      {
        header: 'Disciplines',
        align: 'center',
        cell: (p) => (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums">
            {p.disciplineCount}
          </Badge>
        ),
      },
      {
        header: 'Total Value',
        align: 'right',
        cell: (p) => <span className="tabular-nums">{formatValue(p.totalValue)}</span>,
      },
    ],
    [divisionLabel],
  )

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <FolderKanban className="h-4 w-4 text-primary" />
            Projects
          </h2>
          <p className="text-xs text-muted-foreground">
            {isLoading ? 'Loading…' : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {canManage && (
          <Button size="sm" className="gap-1.5 min-h-11 md:min-h-0" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Project</span>
            <span className="sm:hidden">New</span>
          </Button>
        )}
      </div>

      {isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
          {error instanceof Error ? error.message : 'Failed to load projects'}
        </div>
      ) : (
        <ResponsiveTable
          data={projects}
          columns={columns}
          getRowKey={(p) => p.id}
          isLoading={isLoading}
          emptyState="No projects yet. Click New Project to create one."
          mobileCardRender={(p) => (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{p.project_number}</span>
                {!p.is_active && (
                  <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-normal text-muted-foreground">
                    Closed
                  </Badge>
                )}
              </div>
              <p className="break-words text-sm text-muted-foreground">{p.name}</p>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{divisionLabel(p.division_id)}</span>
                <span>{p.disciplineCount} discipline{p.disciplineCount === 1 ? '' : 's'}</span>
              </div>
              <p className="text-right text-sm font-medium tabular-nums">{formatValue(p.totalValue)}</p>
            </div>
          )}
        />
      )}

      <ProjectFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
