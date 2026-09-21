'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Milestone, MoreHorizontal, Pencil, Power } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Textarea } from '@/components/ui/textarea'
import {
  GuardedFormDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useHasManagePermission } from '@/hooks/usePermissions'
import { useDisciplines } from '@/hooks/useDisciplines'
import {
  useMilestoneCodes,
  useUpsertMilestoneCode,
  useSetMilestoneCodeActive,
  type MilestoneCode,
} from '@/hooks/useMilestoneCodes'

/**
 * Master-data admin for MEP milestone codes (e.g. Plumbing's "P1 — First
 * Fix"). Mirrors `CustodyLocationsManager`/`DisciplinesManager`: a division
 * selector (Tabs), then a discipline picker (Select, since a division can
 * hold many disciplines), then a card list of that discipline's codes with
 * add/edit + activate/deactivate. Mutations are gated behind
 * `warehouse.projects.manage` — everyone else gets a read-only list.
 * Self-contained — the MEP tabs page just renders it.
 */
export function MilestoneCodesManager() {
  const { activeDivisionId, availableDivisions, viewDivisionIds } = useActiveDivision()
  // Follow the top "All Divisions" picker: show only the divisions in the view
  // set (an empty set means "All", so fall back to every available division).
  const visibleDivisions = useMemo(
    () => (viewDivisionIds.size === 0
      ? availableDivisions
      : availableDivisions.filter((d) => viewDivisionIds.has(d.id))),
    [availableDivisions, viewDivisionIds],
  )
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  useEffect(() => {
    if (selectedDivisionId && visibleDivisions.some((d) => d.id === selectedDivisionId)) return
    const fallback =
      activeDivisionId && visibleDivisions.some((d) => d.id === activeDivisionId)
        ? activeDivisionId
        : (visibleDivisions[0]?.id ?? '')
    if (fallback) setSelectedDivisionId(fallback)
  }, [visibleDivisions, activeDivisionId, selectedDivisionId])

  const canManage = useHasManagePermission('warehouse.projects')

  const { data: disciplineRows = [], isLoading: disciplinesLoading } = useDisciplines(selectedDivisionId || null)
  // Guards the transient window between mount/division-switch and the effect
  // that (re)picks a default discipline — same guard as DisciplinesManager.
  const disciplines = useMemo(
    () => disciplineRows.filter((d) => d.division_id === selectedDivisionId),
    [disciplineRows, selectedDivisionId],
  )
  const [selectedDisciplineId, setSelectedDisciplineId] = useState('')
  useEffect(() => {
    if (selectedDisciplineId && disciplines.some((d) => d.id === selectedDisciplineId)) return
    setSelectedDisciplineId(disciplines[0]?.id ?? '')
  }, [disciplines, selectedDisciplineId])

  const { data: codes = [], isLoading } = useMilestoneCodes(selectedDisciplineId || null)
  const upsert = useUpsertMilestoneCode()
  const setActive = useSetMilestoneCodeActive()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MilestoneCode | null>(null)

  const selectedDiscipline = disciplines.find((d) => d.id === selectedDisciplineId)

  async function handleSubmit(values: MilestoneCodeSubmitValues) {
    await upsert.mutateAsync({
      id: editing?.id ?? crypto.randomUUID(),
      discipline_id: selectedDisciplineId,
      code: values.code,
      grp: values.grp,
      description: values.description,
    })
  }

  function handleSetActive(id: string, active: boolean) {
    setActive.mutate(
      { id, active },
      {
        onSuccess: () => toast.success(active ? 'Milestone code activated' : 'Milestone code deactivated'),
        onError: (e) => toast.error(humanizeDbError(e)),
      },
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Milestone Codes"
        description="Discipline-scoped milestone codes (e.g. Plumbing's P1 — First Fix) used on project milestones."
        action={
          canManage && selectedDisciplineId
            ? { label: 'Add Code', onClick: () => { setEditing(null); setDialogOpen(true) } }
            : undefined
        }
      />

      {visibleDivisions.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">No divisions available.</p>
      ) : (
        <>
          {visibleDivisions.length > 1 && (
            <Tabs
              value={selectedDivisionId}
              onValueChange={(v) => { setSelectedDivisionId(v); setSelectedDisciplineId('') }}
            >
              <TabsList className="self-start">
                {visibleDivisions.map((d) => (
                  <TabsTrigger key={d.id} value={d.id}>
                    {d.short_name || d.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Discipline</span>
            <Select value={selectedDisciplineId} onValueChange={(v) => setSelectedDisciplineId(v ?? '')}>
              <SelectTrigger className="h-11 sm:h-9 text-xs w-full sm:w-[220px]">
                <SelectValue placeholder={disciplinesLoading ? 'Loading…' : 'Select discipline'} />
              </SelectTrigger>
              <SelectContent>
                {disciplines.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedDisciplineId ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              {disciplinesLoading
                ? 'Loading disciplines…'
                : disciplines.length === 0
                  ? 'No disciplines in this division yet — add one under Admin → MEP → Disciplines first.'
                  : 'Select a discipline to view its milestone codes.'}
            </p>
          ) : isLoading ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Loading milestone codes…</p>
          ) : codes.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              No milestone codes for {selectedDiscipline?.name ?? 'this discipline'} yet.
              {canManage && ' Click "Add Code" to create one.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {codes.map((c, i) => (
                <Card key={c.id} className={cn(c.is_active ? undefined : 'opacity-60', STAGGER_IN)} style={staggerDelay(i)}>
                  <CardHeader className="py-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Milestone className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <h3 className="text-sm font-semibold truncate">{c.code}</h3>
                          {c.grp && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">{c.grp}</Badge>
                          )}
                          {!c.is_active && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">Inactive</Badge>
                          )}
                        </div>
                        {c.description && (
                          <p className="mt-1 text-xs text-muted-foreground truncate">{c.description}</p>
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
                            <DropdownMenuItem onClick={() => { setEditing(c); setDialogOpen(true) }}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleSetActive(c.id, !c.is_active)}>
                              <Power className="h-4 w-4 mr-2" /> {c.is_active ? 'Deactivate' : 'Activate'}
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
        <MilestoneCodeFormDialog
          open={dialogOpen}
          onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null) }}
          disciplineName={selectedDiscipline?.name ?? ''}
          row={editing}
          isPending={upsert.isPending}
          onSubmit={handleSubmit}
        />
      )}
    </PageWrapper>
  )
}

const milestoneCodeSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  grp: z.string().optional(),
  description: z.string().optional(),
})
type MilestoneCodeFormValues = z.infer<typeof milestoneCodeSchema>

interface MilestoneCodeSubmitValues {
  code: string
  grp?: string | null
  description?: string | null
}

interface MilestoneCodeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  disciplineName: string
  row?: MilestoneCode | null
  isPending: boolean
  onSubmit: (values: MilestoneCodeSubmitValues) => Promise<void>
}

/**
 * Add/edit dialog for a single milestone code. Kept inline in this file for
 * the same reason as `DisciplineFormDialog` in `DisciplinesManager.tsx` —
 * a handful of plain fields don't warrant a sibling `*FormDialog.tsx` file;
 * the GuardedFormDialog + react-hook-form + zod plumbing is unchanged from
 * `CustodyLocationFormDialog`.
 */
function MilestoneCodeFormDialog({
  open, onOpenChange, disciplineName, row, isPending, onSubmit,
}: MilestoneCodeFormDialogProps) {
  const isEditing = !!row
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const form = useForm<MilestoneCodeFormValues>({
    resolver: zodResolver(milestoneCodeSchema),
    defaultValues: { code: '', grp: '', description: '' },
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      row
        ? { code: row.code, grp: row.grp ?? '', description: row.description ?? '' }
        : { code: '', grp: '', description: '' },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id, form])

  async function submit(values: MilestoneCodeFormValues) {
    try {
      await onSubmit({
        code: values.code,
        grp: values.grp || null,
        description: values.description || null,
      })
      toast.success(isEditing ? 'Milestone code updated' : 'Milestone code created')
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
            {isEditing ? 'Edit' : 'Add'} milestone code — {disciplineName}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. P1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="grp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. First Fix (optional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Optional" {...field} />
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
