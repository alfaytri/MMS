'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Plus, X } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  GuardedFormDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useCreateProject } from '@/hooks/useProjects'
import { useDisciplines, useGetOrCreateDiscipline, type Discipline } from '@/hooks/useDisciplines'
import { useCustodyWarehouses } from '@/hooks/useCustodyLocations'
import { useAllProfiles } from '@/hooks/useProfiles'
import { useActiveDivision } from '@/components/providers/DivisionProvider'

const schema = z.object({
  project_number: z.string().min(1, 'Project number is required').max(60),
  division_id: z.string().min(1, 'Division is required'),
  warehouse_id: z.string().min(1, 'Custody warehouse is required'),
  discipline_ids: z.array(z.string()).min(1, 'Add at least one discipline'),
  // '' sentinel = unassigned; any uuid = the picked profile.
  responsible_person_id: z.string(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProjectFormDialog({ open, onOpenChange }: Props) {
  const create = useCreateProject()
  const { data: disciplines = [] } = useDisciplines()
  const getOrCreate = useGetOrCreateDiscipline()
  const { data: allCustody = [] } = useCustodyWarehouses()
  // Projects are created only in the custody warehouse flagged as the Projects
  // warehouse (strictly one). 0 = none configured yet → the picker shows a note.
  const projectWarehouses = allCustody.filter((w) => w.is_project_warehouse)
  const { data: users = [] } = useAllProfiles()
  const { availableDivisions, activeDivisionId } = useActiveDivision()
  const isPending = create.isPending
  const guardRef = useRef<GuardedFormDialogHandle>(null)
  const prevOpenRef = useRef(false)
  // Chosen disciplines for this project (full rows, so names render without a
  // lookup and a just-created one shows immediately, before the list refetches).
  // chosenRef mirrors the state so the async add (after get-or-create resolves)
  // never appends onto a stale list.
  const [chosen, setChosen] = useState<Discipline[]>([])
  const chosenRef = useRef<Discipline[]>([])
  const [nameInput, setNameInput] = useState('')

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      project_number: '',
      division_id: '',
      warehouse_id: '',
      discipline_ids: [],
      responsible_person_id: '',
    },
  })

  // Full reset happens ONLY on the false→true open transition — resetting on
  // every dependency change (division/custody-warehouse data fetch as soon as
  // the tab mounts, and can resolve AFTER the dialog is already open) would
  // blank whatever the user had already typed and clear the dirty baseline,
  // silently discarding in-progress input with no warning.
  //
  // Data-dependent defaults (active division, sole custody warehouse) are
  // then seeded non-destructively: only `setValue` when the field is still
  // empty, so late-arriving data never overwrites a user edit (or the
  // just-applied reset). This still runs on every relevant dep change (not
  // just the open transition) so a default fills in once its data arrives,
  // even if that's after the dialog was already open.
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current
    prevOpenRef.current = open
    if (!open) return

    if (justOpened) {
      form.reset({
        project_number: '',
        division_id: '',
        warehouse_id: '',
        discipline_ids: [],
        responsible_person_id: '',
      })
      chosenRef.current = []
      setChosen([])
      setNameInput('')
    }

    if (!form.getValues('division_id')) {
      const defaultDivision =
        activeDivisionId ?? (availableDivisions.length === 1 ? availableDivisions[0].id : '')
      if (defaultDivision) form.setValue('division_id', defaultDivision)
    }
    if (!form.getValues('warehouse_id') && projectWarehouses.length === 1) {
      form.setValue('warehouse_id', projectWarehouses[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeDivisionId, availableDivisions.length, projectWarehouses.length])

  // Single source of truth: keep the ref, the visible state, and the RHF field
  // (drives zod .min(1) validation + submit) in lockstep on every add/remove.
  function applyChosen(next: Discipline[]) {
    chosenRef.current = next
    setChosen(next)
    form.setValue('discipline_ids', next.map((d) => d.id), {
      shouldDirty: true,
      shouldValidate: true,
    })
  }
  function addExisting(d: Discipline) {
    if (chosenRef.current.some((c) => c.id === d.id)) return
    applyChosen([...chosenRef.current, d])
  }
  async function addTyped() {
    const name = nameInput.trim()
    if (!name || getOrCreate.isPending) return
    try {
      const d = await getOrCreate.mutateAsync(name)
      if (!chosenRef.current.some((c) => c.id === d.id)) applyChosen([...chosenRef.current, d])
      setNameInput('')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  function removeChosen(id: string) {
    applyChosen(chosenRef.current.filter((c) => c.id !== id))
  }

  async function onSubmit(values: FormValues) {
    try {
      const responsible = values.responsible_person_id ? values.responsible_person_id : null
      await create.mutateAsync({
        project_number: values.project_number.trim(),
        // No separate project name — the project number is the identity; mirror it
        // into the (NOT NULL) name column so records + lists stay consistent.
        name: values.project_number.trim(),
        division_id: values.division_id,
        warehouse_id: values.warehouse_id,
        discipline_ids: values.discipline_ids,
        responsible_person_profile_id: responsible,
      })
      toast.success(`Project ${values.project_number.trim()} created`)
      guardRef.current?.closeAfterSubmit()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // Existing master disciplines not already added — offered as one-tap chips.
  const available = disciplines.filter((d) => !chosen.some((c) => c.id === d.id))

  return (
    <GuardedFormDialog open={open} onOpenChange={onOpenChange} form={form} ref={guardRef}>
      <DialogContent className="w-full sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Creates one stock bucket per selected discipline automatically.
          </p>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 py-2">
              <FormField
                control={form.control}
                name="project_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. PRJ-2026-014" className="h-11 sm:h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="division_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Division *</FormLabel>
                    <Select
                      value={field.value || ''}
                      onValueChange={field.onChange}
                      disabled={availableDivisions.length <= 1}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full h-11 sm:h-9">
                          <SelectValue placeholder="Select division" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableDivisions.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.short_name || d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {projectWarehouses.length === 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                  No Projects warehouse is set. Enable one in Master Data → Warehouses (edit a
                  Custody warehouse and turn on “Projects warehouse”) before creating a project.
                </div>
              )}

              <div className="space-y-2">
                <FormLabel>Disciplines *</FormLabel>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  One stock bucket is created per discipline. Add an existing one or type a new
                  name — a new discipline is saved for reuse on future projects.
                </p>

                {chosen.length === 0 ? (
                  <p className="text-xs text-muted-foreground border rounded-md px-3 py-2.5">
                    No disciplines added yet.
                  </p>
                ) : (
                  <div className="rounded-md border divide-y">
                    {chosen.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 min-h-11"
                      >
                        <span className="text-sm truncate">{d.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeChosen(d.id)}
                          aria-label={`Remove ${d.name}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Add a discipline"
                    className="h-11 sm:h-9 w-full sm:flex-1"
                    disabled={getOrCreate.isPending}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void addTyped()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 min-h-11 sm:min-h-0 w-full sm:w-auto shrink-0"
                    disabled={!nameInput.trim() || getOrCreate.isPending}
                    onClick={addTyped}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {getOrCreate.isPending ? 'Adding…' : 'Add'}
                  </Button>
                </div>

                {available.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {available.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => addExisting(d)}
                        className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" />
                        {d.name}
                      </button>
                    ))}
                  </div>
                )}

                {form.formState.errors.discipline_ids && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.discipline_ids.message as string}
                  </p>
                )}
              </div>

              <FormField
                control={form.control}
                name="responsible_person_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsible person</FormLabel>
                    <Select
                      value={field.value || 'none'}
                      onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full h-11 sm:h-9">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-72">
                        <SelectItem value="none">Unassigned</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name?.trim() || u.email || 'Unnamed user'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-4 border-t mt-0">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 sm:min-h-0"
                onClick={() => guardRef.current?.requestClose()}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="min-h-11 sm:min-h-0"
                disabled={isPending || projectWarehouses.length === 0}
              >
                {isPending ? 'Creating…' : 'Create Project'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </GuardedFormDialog>
  )
}
