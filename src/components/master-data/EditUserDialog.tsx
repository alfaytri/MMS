'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { useUpdateUser, type Profile } from '@/hooks/useProfiles'
import { useRoles } from '@/hooks/useRoles'

const schema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  user_type: z.enum(['internal', 'external']),
  is_active: z.boolean(),
  role_ids: z.array(z.string().uuid()).default([]),
})

type Values = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  profile: (Profile & { user_custom_roles?: Array<{ role_id: string }> }) | null
}

export function EditUserDialog({ open, onOpenChange, profile }: Props) {
  const updateUser = useUpdateUser()
  const { data: roles } = useRoles()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      full_name: '', email: '', user_type: 'internal', is_active: true, role_ids: [],
    },
  })

  useEffect(() => {
    if (profile && open) {
      form.reset({
        full_name: profile.full_name ?? '',
        email: profile.email ?? '',
        user_type: (profile.user_type as 'internal' | 'external') ?? 'internal',
        is_active: profile.is_active ?? true,
        role_ids: (profile.user_custom_roles ?? []).map((r) => r.role_id),
      })
    }
  }, [profile, open, form])

  const selectedRoles = form.watch('role_ids') ?? []
  const isActive = form.watch('is_active')

  function onSubmit(values: Values) {
    if (!profile) return
    updateUser.mutate(
      { auth_user_id: profile.auth_user_id, ...values },
      {
        onSuccess: () => {
          toast.success('User updated')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl><Input type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="user_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User Type</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="internal">Internal (staff)</option>
                      <option value="external">External (client)</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => form.setValue('is_active', Boolean(checked))}
              />
              <span className="text-sm">Active</span>
            </label>

            <div>
              <Label>Roles</Label>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border rounded-md p-3">
                {(roles ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No roles defined yet.</p>
                )}
                {(roles ?? []).map((role) => (
                  <label key={role.id} className="flex items-center gap-2 py-0.5 px-2 rounded hover:bg-muted cursor-pointer min-w-[170px]">
                    <Checkbox
                      className="shrink-0"
                      checked={selectedRoles.includes(role.id)}
                      onCheckedChange={(checked) => {
                        const current = form.getValues('role_ids')
                        form.setValue(
                          'role_ids',
                          checked ? [...current, role.id] : current.filter((id) => id !== role.id)
                        )
                      }}
                    />
                    <span className="text-xs whitespace-nowrap">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
