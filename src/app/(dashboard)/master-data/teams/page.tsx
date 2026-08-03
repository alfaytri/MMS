'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus, Users2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { TeamFormDialog } from '@/components/master-data/TeamFormDialog'
import { useTeams, useUpdateTeam, type TeamRow } from '@/hooks/useTeamSubContainers'

/**
 * Master Data → Teams. Lists every Team sub-container grouped by division,
 * with create/rename/activate-toggle actions. Backed by the shared
 * `Teams` virtual warehouse (kind='teams', seeded by migration
 * 20260815000100).
 */
export default function TeamsPage() {
  const [search, setSearch]     = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing]   = useState<TeamRow | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<TeamRow | null>(null)

  const { data: teams = [], isLoading } = useTeams()
  const toggle = useUpdateTeam()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return teams
    return teams.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      t.division_name.toLowerCase().includes(q),
    )
  }, [teams, search])

  // Group by division (division_name → team rows), sorted alphabetically.
  const grouped = useMemo(() => {
    const map = new Map<string, TeamRow[]>()
    for (const t of filtered) {
      const key = t.division_name
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(t: TeamRow) {
    setEditing(t)
    setFormOpen(true)
  }
  function handleConfirmToggle() {
    const t = confirmToggle
    if (!t) return
    toggle.mutate(
      { id: t.id, is_active: !t.is_active },
      {
        onSuccess: () => {
          toast.success(t.is_active ? 'Team deactivated' : 'Team reactivated')
          setConfirmToggle(null)
        },
        onError: (err) => {
          toast.error(err.message)
          setConfirmToggle(null)
        },
      },
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Teams"
        description="Field teams hold stock assigned out of the warehouse. Each team is scoped to one division. Stock stays on the books until the team consumes it."
        actions={
          <Button onClick={openNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Team
          </Button>
        }
      />

      <div className="mb-4 max-w-md">
        <Input
          placeholder="Search by team name or division…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<Users2 className="h-6 w-6 text-muted-foreground" />}
          title={search ? 'No matches' : 'No teams yet'}
          description={search ? 'Try a different search term.' : 'Add your first team to start assigning stock out of the warehouse.'}
          action={!search ? (
            <Button onClick={openNew} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Team
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([divisionName, rows]) => (
            <div key={divisionName} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{divisionName}</h3>
                <span className="text-[11px] text-muted-foreground">
                  {rows.length} team{rows.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="rounded-lg border bg-card overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team</TableHead>
                      <TableHead>Responsible Person</TableHead>
                      <TableHead className="w-28 text-center">Status</TableHead>
                      <TableHead className="w-32 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-xs">
                          {t.responsible_person_name ? (
                            <div className="flex flex-col">
                              <span className="text-foreground">{t.responsible_person_name}</span>
                              {t.responsible_person_phone && (
                                <span className="text-[11px] text-muted-foreground">{t.responsible_person_phone}</span>
                              )}
                            </div>
                          ) : (
                            <span className="italic text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={t.is_active ? 'default' : 'secondary'}
                            className={t.is_active ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15' : ''}
                          >
                            {t.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmToggle(t)}
                              disabled={toggle.isPending}
                              className="h-8 text-xs"
                            >
                              {t.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(t)}
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
            </div>
          ))}
        </div>
      )}

      <TeamFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        team={editing}
      />

      <AlertDialog open={!!confirmToggle} onOpenChange={(o) => !o && setConfirmToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmToggle?.is_active ? `Deactivate ${confirmToggle?.name}?` : `Reactivate ${confirmToggle?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.is_active
                ? 'This team will stop appearing on the Custody page and consumption pickers. Existing stock stays on its books until returned or consumed.'
                : 'This team will start appearing again on the Custody page and consumption pickers.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggle.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmToggle}
              disabled={toggle.isPending}
              className={confirmToggle?.is_active ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {toggle.isPending ? 'Saving…' : (confirmToggle?.is_active ? 'Deactivate' : 'Reactivate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  )
}
