'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus, MapPin } from 'lucide-react'
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
import { PlaceFormDialog } from '@/components/master-data/PlaceFormDialog'
import { usePlaces, useUpdatePlace, type PlaceRow } from '@/hooks/usePlaceSubContainers'

/**
 * Master Data → Places. Lists every off-site custody location grouped by
 * division. Same shape as the Teams page — backed by the shared 'Places'
 * virtual warehouse (kind='places', seeded by migration 20260815000100).
 */
export default function PlacesPage() {
  const [search, setSearch]     = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing]   = useState<PlaceRow | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<PlaceRow | null>(null)

  const { data: places = [], isLoading } = usePlaces()
  const toggle = useUpdatePlace()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return places
    return places.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.division_name.toLowerCase().includes(q),
    )
  }, [places, search])

  const grouped = useMemo(() => {
    const map = new Map<string, PlaceRow[]>()
    for (const p of filtered) {
      const key = p.division_name
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(p: PlaceRow) {
    setEditing(p)
    setFormOpen(true)
  }
  function handleConfirmToggle() {
    const p = confirmToggle
    if (!p) return
    toggle.mutate(
      { id: p.id, is_active: !p.is_active },
      {
        onSuccess: () => {
          toast.success(p.is_active ? 'Place deactivated' : 'Place reactivated')
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
        title="Places"
        description="Off-site custody locations — client sites, office storage, satellite spots. Stock parked at a place stays on the books until it's consumed."
        actions={
          <Button onClick={openNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Place
          </Button>
        }
      />

      <div className="mb-4 max-w-md">
        <Input
          placeholder="Search by place code or division…"
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
          icon={<MapPin className="h-6 w-6 text-muted-foreground" />}
          title={search ? 'No matches' : 'No places yet'}
          description={search ? 'Try a different search term.' : 'Add your first place to start tracking off-site custody.'}
          action={!search ? (
            <Button onClick={openNew} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Place
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
                  {rows.length} place{rows.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="rounded-lg border bg-card overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Place</TableHead>
                      <TableHead>Responsible Person</TableHead>
                      <TableHead className="w-28 text-center">Status</TableHead>
                      <TableHead className="w-32 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium font-mono text-sm">{p.name}</TableCell>
                        <TableCell className="text-xs">
                          {p.responsible_person_name ? (
                            <div className="flex flex-col">
                              <span className="text-foreground">{p.responsible_person_name}</span>
                              {p.responsible_person_phone && (
                                <span className="text-[11px] text-muted-foreground">{p.responsible_person_phone}</span>
                              )}
                            </div>
                          ) : (
                            <span className="italic text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={p.is_active ? 'default' : 'secondary'}
                            className={p.is_active ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15' : ''}
                          >
                            {p.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmToggle(p)}
                              disabled={toggle.isPending}
                              className="h-8 text-xs"
                            >
                              {p.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(p)}
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

      <PlaceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        place={editing}
      />

      <AlertDialog open={!!confirmToggle} onOpenChange={(o) => !o && setConfirmToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmToggle?.is_active ? `Deactivate ${confirmToggle?.name}?` : `Reactivate ${confirmToggle?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.is_active
                ? 'This place will stop appearing on the Custody page and consumption pickers. Existing stock stays on its books until returned or consumed.'
                : 'This place will start appearing again on the Custody page and consumption pickers.'}
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
