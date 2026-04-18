'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useCreateRole, useUpdateRole, type CustomRole } from '@/hooks/useRoles'
import { PERMISSION_GROUPS } from '@/lib/permissions'

const roleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  permissions: z.array(z.string()).default([]),
})

type RoleFormValues = z.infer<typeof roleSchema>

interface RoleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: CustomRole | null
}

export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  const isEditing = !!role
  const create = useCreateRole()
  const update = useUpdateRole()
  const isPending = create.isPending || update.isPending

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema) as never,
    defaultValues: { name: '', description: '', permissions: [] },
  })

  useEffect(() => {
    if (open && role) {
      form.reset({ name: role.name, description: role.description ?? '', permissions: (role.permissions as string[]) ?? [] })
    } else if (open) {
      form.reset()
    }
  }, [open, role, form])

  function onSubmit(values: RoleFormValues) {
    const payload = { ...values, description: values.description || null }
    const mutation = isEditing
      ? () => update.mutateAsync({ id: role!.id, ...payload })
      : () => create.mutateAsync(payload)
    mutation()
      .then(() => { toast.success(`Role ${isEditing ? 'updated' : 'created'}`); onOpenChange(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  const selectedPermissions = form.watch('permissions')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Create'} Role</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Role Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={1} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div>
              <Label>Permissions</Label>
              <div className="mt-2 space-y-3 border rounded-md p-3 max-h-[55vh] overflow-y-auto">
                {PERMISSION_GROUPS.map((group) => {
                  const groupKeys = group.keys as readonly string[]
                  const modulePrefix = group.module.toLowerCase().replace(/ /g, '_') + '.'
                  const formatKey = (k: string) =>
                    (k.startsWith(modulePrefix) ? k.slice(modulePrefix.length) : k)
                      .replace(/[._]/g, ' ')
                  const allSelected = groupKeys.every((k) => selectedPermissions.includes(k))
                  const toggleGroup = () => {
                    const current = form.getValues('permissions')
                    if (allSelected) {
                      form.setValue('permissions', current.filter((k) => !groupKeys.includes(k)))
                    } else {
                      const merged = Array.from(new Set([...current, ...groupKeys]))
                      form.setValue('permissions', merged)
                    }
                  }
                  return (
                  <div key={group.module}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.module}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={toggleGroup}
                      >
                        {allSelected ? 'Deselect all' : 'Select all'}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {group.keys.map((key) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 py-0.5 px-2 rounded hover:bg-muted cursor-pointer min-w-[170px]"
                        >
                          <Checkbox
                            className="shrink-0"
                            checked={selectedPermissions.includes(key)}
                            onCheckedChange={(checked) => {
                              const current = form.getValues('permissions')
                              form.setValue('permissions', checked ? [...current, key] : current.filter((k) => k !== key))
                            }}
                          />
                          <span className="text-xs whitespace-nowrap capitalize">{formatKey(key)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
