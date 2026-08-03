'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog,
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
  useCreateWarehouseSubContainer,
  useUpdateWarehouseSubContainer,
  type WarehouseSubContainer,
} from '@/hooks/useWarehouseSubContainers'
import { useDivisions } from '@/hooks/useDivisions'
import { useAllProfiles } from '@/hooks/useProfiles'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  division_id: z.string().nullable(),
  // '' sentinel = unassigned; any uuid = the picked profile.
  responsible_person_id: z.string(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouseId: string
  warehouseName: string
  warehouseIsVirtual: boolean
  // Only meaningful when warehouseIsVirtual: distinguishes Teams / Places
  // (which STILL require a division on their subs) from Repair (division-less).
  warehouseKind?: string | null
  subContainer?: WarehouseSubContainer | null
}

export function SubContainerFormDialog({
  open,
  onOpenChange,
  warehouseId,
  warehouseName,
  warehouseIsVirtual,
  warehouseKind,
  subContainer,
}: Props) {
  // Division picker visibility. Repair virtual = hide; real + teams/places = show.
  const showDivision = !warehouseIsVirtual
    || warehouseKind === 'teams'
    || warehouseKind === 'places'
  const isEditing = !!subContainer
  const create = useCreateWarehouseSubContainer()
  const update = useUpdateWarehouseSubContainer()
  const { data: divisions = [] } = useDivisions()
  const { data: users = [] }     = useAllProfiles()
  const isPending = create.isPending || update.isPending

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', division_id: null, responsible_person_id: '' },
  })

  useEffect(() => {
    if (!open) return
    if (subContainer) {
      form.reset({
        name: subContainer.name,
        division_id: subContainer.division_id,
        responsible_person_id: subContainer.responsible_person_profile_id ?? '',
      })
    } else {
      const defaultDivision =
        showDivision
          ? (divisions.length === 1 ? divisions[0].id : null)
          : null
      form.reset({ name: '', division_id: defaultDivision, responsible_person_id: '' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subContainer?.id, warehouseIsVirtual, divisions.length])

  async function onSubmit(values: FormValues) {
    try {
      if (showDivision && !values.division_id) {
        toast.error('Division is required')
        return
      }
      const responsible = values.responsible_person_id ? values.responsible_person_id : null
      if (isEditing && subContainer) {
        await update.mutateAsync({
          id:                            subContainer.id,
          warehouse_id:                  warehouseId,
          name:                          values.name,
          responsible_person_profile_id: responsible,
        })
        toast.success('Sub-container updated')
      } else {
        await create.mutateAsync({
          warehouse_id: warehouseId,
          division_id: showDivision ? values.division_id : null,
          name: values.name,
          responsible_person_profile_id: responsible,
        })
        toast.success('Sub-container created')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit' : 'Add'} Sub-container
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            in <span className="font-medium">{warehouseName}</span>
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          warehouseIsVirtual
                            ? 'e.g. Repair: Vendor Name'
                            : `${warehouseName} — Division`
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {showDivision && (
                <FormField
                  control={form.control}
                  name="division_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Division *</FormLabel>
                      <Select
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                        disabled={isEditing || divisions.length <= 1}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full h-9">
                            <SelectValue placeholder="Select division" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {divisions.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isEditing && (
                        <p className="text-[10px] text-muted-foreground">
                          Division is locked after creation — stock rows carry a
                          denormalized division_id keyed off this value.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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
                        <SelectTrigger className="w-full h-9">
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
                    <p className="text-[10px] text-muted-foreground">
                      For Teams / Places subs, this person is the physical custodian who accepts inbound custody assigns and initiates returns.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-4 border-t mt-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
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
    </Dialog>
  )
}
