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

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  division_id: z.string().nullable(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouseId: string
  warehouseName: string
  warehouseIsVirtual: boolean
  subContainer?: WarehouseSubContainer | null
}

export function SubContainerFormDialog({
  open,
  onOpenChange,
  warehouseId,
  warehouseName,
  warehouseIsVirtual,
  subContainer,
}: Props) {
  const isEditing = !!subContainer
  const create = useCreateWarehouseSubContainer()
  const update = useUpdateWarehouseSubContainer()
  const { data: divisions = [] } = useDivisions()
  const isPending = create.isPending || update.isPending

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', division_id: null },
  })

  useEffect(() => {
    if (!open) return
    if (subContainer) {
      form.reset({
        name: subContainer.name,
        division_id: subContainer.division_id,
      })
    } else {
      const defaultDivision =
        warehouseIsVirtual
          ? null
          : divisions.length === 1
            ? divisions[0].id
            : null
      form.reset({ name: '', division_id: defaultDivision })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subContainer?.id, warehouseIsVirtual, divisions.length])

  async function onSubmit(values: FormValues) {
    try {
      if (!warehouseIsVirtual && !values.division_id) {
        toast.error('Division is required for real warehouses')
        return
      }
      if (isEditing && subContainer) {
        await update.mutateAsync({ id: subContainer.id, name: values.name })
        toast.success('Sub-container updated')
      } else {
        await create.mutateAsync({
          warehouse_id: warehouseId,
          division_id: warehouseIsVirtual ? null : values.division_id,
          name: values.name,
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

              {!warehouseIsVirtual && (
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
