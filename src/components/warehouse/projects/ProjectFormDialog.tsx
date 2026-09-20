'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Check, ChevronsUpDown } from 'lucide-react'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  GuardedFormDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useCreateProject } from '@/hooks/useProjects'
import { useDisciplines } from '@/hooks/useDisciplines'
import { useCustodyWarehouses } from '@/hooks/useCustodyLocations'
import { useAllProfiles } from '@/hooks/useProfiles'
import { useCustomers } from '@/hooks/useSaleOrders'
import { useActiveDivision } from '@/components/providers/DivisionProvider'

const schema = z.object({
  project_number: z.string().min(1, 'Project number is required').max(60),
  name: z.string().min(1, 'Name is required').max(200),
  division_id: z.string().min(1, 'Division is required'),
  warehouse_id: z.string().min(1, 'Custody warehouse is required'),
  discipline_ids: z.array(z.string()).min(1, 'Pick at least one discipline'),
  // '' sentinel = unassigned; any uuid = the picked profile.
  responsible_person_id: z.string(),
  // '' sentinel = no customer linked (customer_id is nullable on `projects`).
  customer_id: z.string(),
  site_address: z.string().max(500),
  pin: z.string().max(60),
  status: z.enum(['active', 'on_hold', 'completed', 'cancelled']),
  start_date: z.string(),
  expected_completion_date: z.string(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProjectFormDialog({ open, onOpenChange }: Props) {
  const create = useCreateProject()
  const { data: custodyWarehouses = [] } = useCustodyWarehouses()
  const { data: users = [] } = useAllProfiles()
  const { availableDivisions, activeDivisionId } = useActiveDivision()
  const isPending = create.isPending
  const guardRef = useRef<GuardedFormDialogHandle>(null)
  const prevOpenRef = useRef(false)

  // Customer combobox — mirrors the searchable customer picker in
  // sales/create-so/page.tsx (useCustomers hook, server-filtered by
  // `customerSearch`) + the value/onChange combobox shape of BrandCombobox.
  // The display name is tracked locally (not derivable from the paginated
  // search results once the popover closes).
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const { data: customers = [] } = useCustomers(customerSearch || undefined)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      project_number: '',
      name: '',
      division_id: '',
      warehouse_id: '',
      discipline_ids: [],
      responsible_person_id: '',
      customer_id: '',
      site_address: '',
      pin: '',
      status: 'active',
      start_date: '',
      expected_completion_date: '',
    },
  })

  // CARRY-FORWARD FIX: disciplines must match the DIVISION PICKED IN THIS FORM,
  // not the ambient active division — a multi-division user picking a
  // different division here previously still saw the active division's
  // disciplines. `useDisciplines` falls back to the ambient active division
  // only when passed `undefined` (not `''`), hence the `|| undefined`.
  const selectedDivisionId = form.watch('division_id')
  const { data: disciplines = [] } = useDisciplines(selectedDivisionId || undefined)

  // FIX (review round 1, F1): picked disciplines are UUIDs scoped to whatever
  // division was selected when they were checked. Without this, switching
  // divisions mid-form only resets the checkbox UI (a fresh `disciplines`
  // list renders) while `discipline_ids` silently keeps the OLD division's
  // uuids — the zod rule is just `min(1)`, so that stale array still passes
  // validation and would submit division-mismatched discipline ids.
  //
  // `prevDivisionIdRef` starts `undefined` so the very first render (mount,
  // or the open-transition's `''` reset) never clears anything — only a
  // change AWAY FROM a previously-real division value does.
  const prevDivisionIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prev = prevDivisionIdRef.current
    prevDivisionIdRef.current = selectedDivisionId
    // Only clear when moving AWAY FROM a previously-real division. `prev === ''`
    // is the open-time seed ('' → real default); resetting+validating there would
    // set the "pick a discipline" error before the user has touched the form (and
    // toggleDiscipline wouldn't clear it — see its shouldValidate below).
    if (prev !== undefined && prev !== '' && prev !== selectedDivisionId) {
      form.setValue('discipline_ids', [], { shouldValidate: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDivisionId])

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
        customer_id: '',
        site_address: '',
        pin: '',
        status: 'active',
        start_date: '',
        expected_completion_date: '',
      })
      setCustomerSearch('')
      setCustomerName('')
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
      // shouldValidate so picking a discipline immediately clears any lingering
      // "pick at least one" error (and un-picking the last one re-shows it).
      { shouldDirty: true, shouldValidate: true },
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
        customer_id: values.customer_id || null,
        site_address: values.site_address.trim() || null,
        pin: values.pin.trim() || null,
        status: values.status,
        start_date: values.start_date || null,
        expected_completion_date: values.expected_completion_date || null,
      })
      toast.success(`Project ${values.project_number.trim()} created`)
      guardRef.current?.closeAfterSubmit()
    } catch (e) {
      toast.error(humanizeDbError(e))
    }
  }

  return (
    <GuardedFormDialog open={open} onOpenChange={onOpenChange} form={form} ref={guardRef}>
      <DialogContent className="w-full sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Creates one stock pool for the project; the disciplines you pick become spend tags.
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
                name="customer_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Customer</FormLabel>
                    <Popover
                      open={customerOpen}
                      onOpenChange={(o) => { if (o) setCustomerSearch(''); setCustomerOpen(o) }}
                    >
                      <FormControl>
                        <PopoverTrigger
                          type="button"
                          className="flex h-11 sm:h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <span className={field.value ? 'truncate' : 'truncate text-muted-foreground'}>
                            {field.value ? (customerName || 'Selected customer') : 'No customer (optional)'}
                          </span>
                          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                        </PopoverTrigger>
                      </FormControl>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search customers…"
                            value={customerSearch}
                            onValueChange={setCustomerSearch}
                          />
                          <CommandList className="max-h-60">
                            <CommandEmpty>No customers found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__none__"
                                onSelect={() => { field.onChange(''); setCustomerName(''); setCustomerOpen(false) }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${field.value ? 'opacity-0' : 'opacity-100'}`} />
                                <span className="text-muted-foreground">No customer</span>
                              </CommandItem>
                              {customers.map((c) => (
                                <CommandItem
                                  key={c.id}
                                  value={c.name}
                                  onSelect={() => { field.onChange(c.id); setCustomerName(c.name); setCustomerOpen(false) }}
                                >
                                  <Check className={`mr-2 h-4 w-4 ${field.value === c.id ? 'opacity-100' : 'opacity-0'}`} />
                                  <span className="truncate">{c.name}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
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
                name="site_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site address</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" className="h-11 sm:h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PIN</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" className="h-11 sm:h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full h-11 sm:h-9">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on_hold">On hold</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start date</FormLabel>
                      <FormControl>
                        <Input type="date" className="h-11 sm:h-9" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expected_completion_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected completion</FormLabel>
                      <FormControl>
                        <Input type="date" className="h-11 sm:h-9" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="discipline_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Disciplines</FormLabel>
                    <p className="text-[10px] text-muted-foreground -mt-1">
                      Disciplines are spend tags (not separate stock) — pick which apply. More can be added later.
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
