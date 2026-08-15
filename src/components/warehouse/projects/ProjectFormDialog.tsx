'use client'

import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  GuardedFormDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useCreateProject } from '@/hooks/useProjects'
import { useDisciplines } from '@/hooks/useDisciplines'
import { useCustodyWarehouses } from '@/hooks/useCustodyLocations'
import { useAllProfiles } from '@/hooks/useProfiles'
import { useActiveDivision } from '@/components/providers/DivisionProvider'

const schema = z.object({
  project_number: z.string().min(1, 'Project number is required').max(60),
  name: z.string().min(1, 'Name is required').max(200),
  division_id: z.string().min(1, 'Division is required'),
  warehouse_id: z.string().min(1, 'Custody warehouse is required'),
  discipline_ids: z.array(z.string()),
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
  const { data: custodyWarehouses = [] } = useCustodyWarehouses()
  const { data: users = [] } = useAllProfiles()
  const { availableDivisions, activeDivisionId } = useActiveDivision()
  const isPending = create.isPending
  const guardRef = useRef<GuardedFormDialogHandle>(null)
  const prevOpenRef = useRef(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      project_number: '',
      name: '',
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
        name: '',
        division_id: '',
        warehouse_id: '',
        discipline_ids: [],
        responsible_person_id: '',
      })
    }

    if (!form.getValues('division_id')) {
      const defaultDivision =
        activeDivisionId ?? (availableDivisions.length === 1 ? availableDivisions[0].id : '')
      if (defaultDivision) form.setValue('division_id', defaultDivision)
    }
    if (!form.getValues('warehouse_id') && custodyWarehouses.length === 1) {
      form.setValue('warehouse_id', custodyWarehouses[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeDivisionId, availableDivisions.length, custodyWarehouses.length])

  function toggleDiscipline(id: string, checked: boolean) {
    const current = form.getValues('discipline_ids')
    form.setValue(
      'discipline_ids',
      checked ? Array.from(new Set([...current, id])) : current.filter((d) => d !== id),
      { shouldDirty: true },
    )
  }

  async function onSubmit(values: FormValues) {
    try {
      const responsible = values.responsible_person_id ? values.responsible_person_id : null
      await create.mutateAsync({
        project_number: values.project_number.trim(),
        name: values.name.trim(),
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Al Waab Villa Fit-out" className="h-11 sm:h-9" {...field} />
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

              <FormField
                control={form.control}
                name="warehouse_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custody Warehouse *</FormLabel>
                    <Select
                      value={field.value || ''}
                      onValueChange={field.onChange}
                      disabled={custodyWarehouses.length <= 1}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full h-11 sm:h-9">
                          <SelectValue placeholder="Select warehouse" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {custodyWarehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="discipline_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Disciplines</FormLabel>
                    <p className="text-[10px] text-muted-foreground -mt-1">
                      One stock bucket is created per discipline picked. More can be added later from the project.
                    </p>
                    {disciplines.length === 0 ? (
                      <p className="text-xs text-muted-foreground border rounded-md px-3 py-2.5">
                        No disciplines configured yet.
                      </p>
                    ) : (
                      <div className="rounded-md border divide-y">
                        {disciplines.map((d) => (
                          <label
                            key={d.id}
                            className="flex items-center gap-2.5 px-3 py-2.5 min-h-11 cursor-pointer hover:bg-accent/30"
                          >
                            <Checkbox
                              checked={field.value.includes(d.id)}
                              onCheckedChange={(checked) => toggleDiscipline(d.id, checked === true)}
                            />
                            <span className="text-sm">{d.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

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
              <Button type="submit" className="min-h-11 sm:min-h-0" disabled={isPending}>
                {isPending ? 'Creating…' : 'Create Project'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </GuardedFormDialog>
  )
}
