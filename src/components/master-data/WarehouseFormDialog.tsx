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
import { useCreateWarehouse, useUpdateWarehouse, type Warehouse } from '@/hooks/useWarehouses'
import { useEmployees } from '@/hooks/useTeams'
import { useAllProfiles } from '@/hooks/useProfiles'

const warehouseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  location: z.string().optional(),
  manager_id: z.string().nullable().optional(),
  manager_profile_id: z.string().nullable().optional(),
})

type WarehouseFormValues = z.infer<typeof warehouseSchema>

interface WarehouseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouse?: Warehouse | null
}

export function WarehouseFormDialog({ open, onOpenChange, warehouse }: WarehouseFormDialogProps) {
  const isEditing = !!warehouse
  const create = useCreateWarehouse()
  const update = useUpdateWarehouse()
  const { data: employees = [] } = useEmployees()
  const { data: profiles = [] } = useAllProfiles()
  const isPending = create.isPending || update.isPending

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: { name: '', location: '', manager_id: null, manager_profile_id: null },
  })

  useEffect(() => {
    if (open && warehouse) {
      form.reset({
        name: warehouse.name,
        location: warehouse.location ?? '',
        manager_id: warehouse.manager_id ?? null,
        manager_profile_id: warehouse.manager_profile_id ?? null,
      })
    } else if (open) {
      form.reset({ name: '', location: '', manager_id: null, manager_profile_id: null })
    }
  }, [open, warehouse, form])

  function onSubmit(values: WarehouseFormValues) {
    const payload = {
      name: values.name,
      location: values.location || null,
      manager_id: values.manager_id || null,
      manager_profile_id: values.manager_profile_id || null,
    }
    if (isEditing && warehouse) {
      update.mutate(
        { id: warehouse.id, ...payload },
        {
          onSuccess: () => {
            toast.success('Warehouse updated')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success('Warehouse created')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Warehouse</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Central Warehouse" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="Industrial Area, Doha" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="manager_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Field Manager (Employee)</FormLabel>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(val) => field.onChange(val === '__none__' ? null : val)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name}
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
              name="manager_profile_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>System Manager (Approvals)</FormLabel>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(val) => field.onChange(val === '__none__' ? null : val)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name ?? p.email ?? p.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
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
