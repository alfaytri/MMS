'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { HardHat, MoreHorizontal, Pencil, Power } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  GuardedFormDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useHasManagePermission } from '@/hooks/usePermissions'
import {
  useDisciplines,
  useUpsertDiscipline,
  useSetDisciplineActive,
  type Discipline,
} from '@/hooks/useDisciplines'

/**
 * Master-data admin for MEP disciplines (Plumbing / Electrical / Automation…).
 * Mirrors `CustodyLocationsManager`: a top-level selector (here, division via
 * Tabs, sourced from `useActiveDivision`), a card list of that division's
 * disciplines with add/edit + activate/deactivate, and toasts on mutation
 * results. Mutations are gated behind `warehouse.projects.manage` (same
 * permission area as `ProjectsTab`/`ProjectDetail`) — everyone else gets a
 * read-only list. Self-contained — the MEP tabs page just renders it.
 */
export function DisciplinesManager() {
  const { activeDivisionId, availableDivisions } = useActiveDivision()
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  useEffect(() => {
    if (selectedDivisionId && availableDivisions.some((d) => d.id === selectedDivisionId)) return
    const fallback =
      activeDivisionId && availableDivisions.some((d) => d.id === activeDivisionId)
        ? activeDivisionId
        : (availableDivisions[0]?.id ?? '')
    if (fallback) setSelectedDivisionId(fallback)
  }, [availableDivisions, activeDivisionId, selectedDivisionId])

  const canManage = useHasManagePermission('warehouse.projects')
  const { data: rows = [], isLoading } = useDisciplines(selectedDivisionId || null)
  // The query is already division-scoped, but guard the transient window
  // between mount (selectedDivisionId='') and the effect that picks the
  // default division — mirrors CustodyLocationsManager's `rowsForWh` guard.
  const disciplines = useMemo(
    () => rows.filter((d) => d.division_id === selectedDivisionId),
    [rows, selectedDivisionId],
  )
  const upsert = useUpsertDiscipline()
  const setActive = useSetDisciplineActive()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Discipline | null>(null)

  const selectedDivision = availableDivisions.find((d) => d.id === selectedDivisionId)

  async function handleSubmit(values: DisciplineSubmitValues) {
    await upsert.mutateAsync({
      id: editing?.id ?? crypto.randomUUID(),
      division_id: selectedDivisionId,
      name: values.name,
      prefix: values.prefix,
    })
  }

  function handleSetActive(id: string, active: boolean) {
    setActive.mutate(
      { id, active },
      {
        onSuccess: () => toast.success(active ? 'Discipline activated' : 'Discipline deactivated'),
        onError: (e) => toast.error(humanizeDbError(e)),
      },
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Disciplines"
        description="MEP disciplines (e.g. Plumbing, Electrical) used to scope project work and milestones."
        action={
          canManage && selectedDivisionId
            ? { label: 'Add Discipline', onClick: () => { setEditing(null); setDialogOpen(true) } }
            : undefined
        }
      />

      {availableDivisions.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">No divisions available.</p>
      ) : (
        <>
          {availableDivisions.length > 1 && (
            <Tabs value={selectedDivisionId} onValueChange={setSelectedDivisionId}>
              <TabsList className="self-start">
                {availableDivisions.map((d) => (
                  <TabsTrigger key={d.id} value={d.id}>
                    {d.short_name || d.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {isLoading ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Loading disciplines…</p>
          ) : disciplines.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              No disciplines in {selectedDivision?.name ?? 'this division'} yet.
              {canManage && ' Click "Add Discipline" to create one.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {disciplines.map((d, i) => (
                <Card key={d.id} className={cn(d.is_active ? undefined : 'opacity-60', STAGGER_IN)} style={staggerDelay(i)}>
                  <CardHeader className="py-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <HardHat className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-sm font-semibold truncate">{d.name}</h3>
                          {!d.is_active && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">Inactive</Badge>
                          )}
                        </div>
                        {d.prefix && (
                          <p className="mt-1 text-xs text-muted-foreground truncate">Prefix: {d.prefix}</p>
                        )}
                      </div>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Open actions" />
                            }
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditing(d); setDialogOpen(true) }}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleSetActive(d.id, !d.is_active)}>
                              <Power className="h-4 w-4 mr-2" /> {d.is_active ? 'Deactivate' : 'Activate'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {canManage && (
        <DisciplineFormDialog
          open={dialogOpen}
          onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null) }}
          divisionName={selectedDivision?.name ?? ''}
          row={editing}
          isPending={upsert.isPending}
          onSubmit={handleSubmit}
        />
      )}
    </PageWrapper>
  )
}

const disciplineSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  prefix: z.string().optional(),
})
type DisciplineFormValues = z.infer<typeof disciplineSchema>

interface DisciplineSubmitValues {
  name: string
  prefix?: string | null
}

interface DisciplineFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  divisionName: string
  row?: Discipline | null
  isPending: boolean
  onSubmit: (values: DisciplineSubmitValues) => Promise<void>
}

/**
 * Add/edit dialog for a single discipline. Kept inline in this file (rather
 * than a sibling `*FormDialog.tsx`) since it only has two plain-text fields —
 * same GuardedFormDialog + react-hook-form + zod plumbing as
 * `CustodyLocationFormDialog`, just co-located (mirrors the in-file
 * `LocalRow`/`InheritedRow` helper pattern in `AttributesTab.tsx`).
 */
function DisciplineFormDialog({
  open, onOpenChange, divisionName, row, isPending, onSubmit,
}: DisciplineFormDialogProps) {
  const isEditing = !!row
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const form = useForm<DisciplineFormValues>({
    resolver: zodResolver(disciplineSchema),
    defaultValues: { name: '', prefix: '' },
  })

  useEffect(() => {
    if (!open) return
    form.reset(row ? { name: row.name, prefix: row.prefix ?? '' } : { name: '', prefix: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id, form])

  async function submit(values: DisciplineFormValues) {
    try {
      await onSubmit({ name: values.name, prefix: values.prefix || null })
      toast.success(isEditing ? 'Discipline updated' : 'Discipline created')
      guardRef.current?.closeAfterSubmit()
    } catch (e) {
      toast.error(humanizeDbError(e))
    }
  }

  return (
    <GuardedFormDialog open={open} onOpenChange={onOpenChange} form={form} ref={guardRef}>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit' : 'Add'} discipline — {divisionName}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Plumbing" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="prefix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prefix</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. P (optional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => guardRef.current?.requestClose()}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </GuardedFormDialog>
  )
}
