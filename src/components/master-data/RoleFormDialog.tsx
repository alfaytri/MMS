'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ChevronRight, ChevronDown } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useCreateRole, useUpdateRole, type CustomRole } from '@/hooks/useRoles'
import { ACTIVE_PERMISSION_GROUPS as PERMISSION_GROUPS, ALL_PERMISSIONS, groupKeys, type PermissionEntry } from '@/lib/permissions'
const roleSchema = z.object({
  name:             z.string().min(1, 'Name is required'),
  description:      z.string().optional().default(''),
  permissions:      z.array(z.string()).default([]),
  is_approval_slot: z.boolean().default(false),
  is_field_rp:      z.boolean().default(false),
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
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema) as never,
    defaultValues: { name: '', description: '', permissions: [], is_approval_slot: false, is_field_rp: false },
  })

  useEffect(() => {
    if (open && role) {
      form.reset({
        name: role.name,
        description: role.description ?? '',
        permissions: (role.permissions as string[]) ?? [],
        is_approval_slot: Boolean((role as CustomRole & { is_approval_slot?: boolean }).is_approval_slot),
        is_field_rp:      Boolean((role as CustomRole & { is_field_rp?: boolean }).is_field_rp),
      })
      setExpandedModules(new Set())
    } else if (open) {
      form.reset()
      setExpandedModules(new Set())
    }
  }, [open, role, form])

  function toggleModule(module: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(module)) next.delete(module)
      else next.add(module)
      return next
    })
  }

  const selectedPermissions = form.watch('permissions')
  const total = ALL_PERMISSIONS.length

  function selectAll() { form.setValue('permissions', [...ALL_PERMISSIONS]) }
  function clearAll()  { form.setValue('permissions', []) }

  function onSubmit(values: RoleFormValues) {
    const payload = { ...values, description: values.description || null }
    const mutation = isEditing
      ? () => update.mutateAsync({ id: role!.id, ...payload })
      : () => create.mutateAsync(payload)
    mutation()
      .then(() => { toast.success(`Role ${isEditing ? 'updated' : 'created'}`); onOpenChange(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Create'} Role</DialogTitle>
          <p className="text-sm text-muted-foreground">Configure role name, description, and permissions.</p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">

            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 space-y-4">
            {/* Name + Description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-1">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Name *</FormLabel>
                  <FormControl><Input placeholder="e.g. Senior Dispatcher" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea rows={1} placeholder="Brief description…" className="resize-none" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Approval-slot toggle */}
            <div className="px-1 space-y-2">
              <FormField
                control={form.control}
                name="is_approval_slot"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border border-border p-3 bg-card">
                    <div className="space-y-0.5 pr-3">
                      <FormLabel className="text-sm">Can be used in approval chains</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Mark this role as an approval-slot so users holding it can fill steps in PO,
                        Inventory Check, and Stock Adjustment approval chains.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_field_rp"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border border-border p-3 bg-card">
                    <div className="space-y-0.5 pr-3">
                      <FormLabel className="text-sm">Field Responsible Person (RP)</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Mark this role as a Field RP so users holding it appear as
                        candidates in the Warehouse dialog&apos;s Field RPs picker.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Permissions header */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                PERMISSIONS ({selectedPermissions.length} / {total})
              </span>
              <div className="flex gap-3">
                <button type="button" onClick={selectAll} className="text-xs text-primary hover:underline">Select All</button>
                <button type="button" onClick={clearAll}  className="text-xs text-primary hover:underline">Clear All</button>
              </div>
            </div>

            {/* Accordion permission list */}
            <div className="border rounded-md divide-y divide-border">
              {PERMISSION_GROUPS.map((group) => {
                const allKeys = groupKeys(group)
                const selectedInGroup = allKeys.filter((k) => selectedPermissions.includes(k))
                const allSelected = selectedInGroup.length === allKeys.length
                const someSelected = selectedInGroup.length > 0 && !allSelected
                const isExpanded = expandedModules.has(group.module)
                const Icon = group.icon

                function toggleGroupAll() {
                  const current = form.getValues('permissions')
                  if (allSelected) {
                    form.setValue('permissions', current.filter((k) => !allKeys.includes(k)))
                  } else {
                    form.setValue('permissions', Array.from(new Set([...current, ...allKeys])))
                  }
                }

                function renderPermRow(perm: PermissionEntry) {
                  return (
                    <label
                      key={perm.key}
                      className="flex items-start gap-3 px-8 py-2 cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        className="mt-0.5 shrink-0"
                        checked={selectedPermissions.includes(perm.key)}
                        onCheckedChange={(checked) => {
                          const current = form.getValues('permissions')
                          form.setValue(
                            'permissions',
                            checked ? [...current, perm.key] : current.filter((k) => k !== perm.key)
                          )
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium block">{perm.label}</span>
                        <span className="text-xs text-muted-foreground">{perm.description}</span>
                      </div>
                    </label>
                  )
                }

                return (
                  <div key={group.module}>
                    {/* Module row */}
                    <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/40 cursor-pointer select-none">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onCheckedChange={toggleGroupAll}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0"
                      />
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-2 text-left"
                        onClick={() => toggleModule(group.module)}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        }
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium flex-1">{group.module}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {selectedInGroup.length}/{allKeys.length}
                        </span>
                      </button>
                    </div>

                    {/* Permission rows */}
                    {isExpanded && (
                      <div className="bg-muted/20 divide-y divide-border/50">
                        {group.permissions.map(renderPermRow)}
                        {(group.sections ?? []).map((section) => {
                          const sectionKeys = section.permissions.map((p) => p.key)
                          const sectionSelected = sectionKeys.filter((k) => selectedPermissions.includes(k))
                          const sectionAll = sectionSelected.length === sectionKeys.length
                          const sectionSome = sectionSelected.length > 0 && !sectionAll

                          function toggleSectionAll() {
                            const current = form.getValues('permissions')
                            if (sectionAll) {
                              form.setValue('permissions', current.filter((k) => !sectionKeys.includes(k)))
                            } else {
                              form.setValue('permissions', Array.from(new Set([...current, ...sectionKeys])))
                            }
                          }

                          return (
                            <div key={section.label}>
                              <div className="flex items-center gap-2 px-6 py-1.5 bg-muted/40 border-y border-border/40">
                                <Checkbox
                                  checked={sectionAll}
                                  indeterminate={sectionSome}
                                  onCheckedChange={toggleSectionAll}
                                  className="shrink-0"
                                />
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">
                                  {section.label}
                                </span>
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {sectionSelected.length}/{sectionKeys.length}
                                </span>
                              </div>
                              {section.permissions.map(renderPermRow)}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            </div>

            <DialogFooter className="shrink-0 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending || !form.formState.isValid}>
                {isPending ? 'Saving…' : isEditing ? 'Update Role' : 'Create Role'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
