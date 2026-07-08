'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCreateRole, useUpdateRole, type CustomRole } from '@/hooks/useRoles'
import { NAV_TREE, countPerms, collectPermKeys, type TreeNode } from './PermissionTree'

const ALL_TREE_KEYS = collectPermKeys(NAV_TREE)

// Maps every descendant permission key → its root node's .access key.
// When a child perm is selected, the root access key is auto-included.
const ACCESS_KEY_MAP = new Map<string, string>()
for (const root of NAV_TREE) {
  const accessPerm = root.permissions?.find(p => p.key.endsWith('.access'))
  if (!accessPerm) continue
  function walk(n: TreeNode) {
    for (const p of n.permissions ?? []) {
      if (p.key !== accessPerm!.key) ACCESS_KEY_MAP.set(p.key, accessPerm!.key)
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(root)
}

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

function InteractiveTreeNode({
  node,
  depth,
  expandedIds,
  onToggle,
  selected,
  onSelect,
  onDeselect,
}: {
  node: TreeNode
  depth: number
  expandedIds: Set<string>
  onToggle: (id: string) => void
  selected: Set<string>
  onSelect: (keys: string[]) => void
  onDeselect: (keys: string[]) => void
}) {
  const allKeys = useMemo(() => collectPermKeys([node]), [node])
  const selectedCount = useMemo(() => allKeys.filter(k => selected.has(k)).length, [allKeys, selected])
  const allSelected = allKeys.length > 0 && selectedCount === allKeys.length
  const someSelected = selectedCount > 0 && !allSelected

  const isExpanded = expandedIds.has(node.id)
  const hasChildren = (node.children?.length ?? 0) > 0
  const hasPerms = (node.permissions?.length ?? 0) > 0
  const isExpandable = hasChildren || hasPerms
  const total = countPerms(node)
  const Icon = node.icon

  function handleGroupToggle() {
    if (allSelected) {
      onDeselect(allKeys)
    } else {
      onSelect(allKeys)
    }
  }

  const depthBg =
    depth === 0 ? '' : depth === 1 ? 'bg-muted/20' : depth === 2 ? 'bg-muted/35' : 'bg-muted/50'

  return (
    <>
      {/* Node row */}
      <div
        className={`flex items-center gap-2 py-2.5 hover:bg-accent/50 transition-colors ${depthBg}`}
        style={{ paddingLeft: `${12 + depth * 20}px`, paddingRight: 12 }}
      >
        {allKeys.length > 0 && (
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onCheckedChange={handleGroupToggle}
            className="shrink-0"
          />
        )}
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left min-w-0"
          onClick={() => isExpandable && onToggle(node.id)}
        >
          {isExpandable ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {Icon && <Icon className="h-4 w-4 text-primary shrink-0" />}
          <span
            className={
              depth === 0
                ? 'text-sm font-semibold flex-1 truncate'
                : node.isGroupHeader
                  ? 'text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex-1'
                  : 'text-sm font-medium flex-1 truncate'
            }
          >
            {node.label}
          </span>
          <Badge variant="outline" className="text-[10px] tabular-nums h-5 px-1.5 shrink-0">
            {selectedCount}/{total}
          </Badge>
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <>
          {(node.permissions ?? []).map(perm => (
            <label
              key={perm.key}
              className={`flex items-start gap-3 py-2 cursor-pointer hover:bg-accent/30 ${depthBg}`}
              style={{
                paddingLeft: `${32 + depth * 20}px`,
                paddingRight: 12,
              }}
            >
              <Checkbox
                className="mt-0.5 shrink-0"
                checked={selected.has(perm.key)}
                onCheckedChange={(checked) => {
                  if (checked) onSelect([perm.key])
                  else onDeselect([perm.key])
                }}
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium block">{perm.label}</span>
                <span className="text-xs text-muted-foreground">{perm.description}</span>
              </div>
            </label>
          ))}

          {node.children?.map(child => (
            <InteractiveTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              selected={selected}
              onSelect={onSelect}
              onDeselect={onDeselect}
            />
          ))}
        </>
      )}
    </>
  )
}

export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  const isEditing = !!role
  const create = useCreateRole()
  const update = useUpdateRole()
  const isPending = create.isPending || update.isPending
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

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
      setExpandedIds(new Set())
    } else if (open) {
      form.reset()
      setExpandedIds(new Set())
    }
  }, [open, role, form])

  const toggle = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedPermissions = form.watch('permissions')
  const selectedSet = useMemo(() => new Set(selectedPermissions), [selectedPermissions])

  const handleSelect = useCallback((keys: string[]) => {
    const current = form.getValues('permissions')
    const toAdd = [...keys]
    for (const key of keys) {
      const accessKey = ACCESS_KEY_MAP.get(key)
      if (accessKey) toAdd.push(accessKey)
    }
    form.setValue('permissions', Array.from(new Set([...current, ...toAdd])))
  }, [form])

  const handleDeselect = useCallback((keys: string[]) => {
    const current = form.getValues('permissions')
    const removeSet = new Set(keys)
    form.setValue('permissions', current.filter(k => !removeSet.has(k)))
  }, [form])

  function selectAll() { form.setValue('permissions', [...ALL_TREE_KEYS]) }
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
                PERMISSIONS ({selectedPermissions.length} / {ALL_TREE_KEYS.length})
              </span>
              <div className="flex gap-3">
                <button type="button" onClick={selectAll} className="text-xs text-primary hover:underline">Select All</button>
                <button type="button" onClick={clearAll}  className="text-xs text-primary hover:underline">Clear All</button>
              </div>
            </div>

            {/* Interactive permission tree */}
            <div className="border rounded-md divide-y divide-border overflow-hidden">
              {NAV_TREE.map(node => (
                <InteractiveTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  expandedIds={expandedIds}
                  onToggle={toggle}
                  selected={selectedSet}
                  onSelect={handleSelect}
                  onDeselect={handleDeselect}
                />
              ))}
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
