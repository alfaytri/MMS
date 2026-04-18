'use client'

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
import { passwordSchema } from '@/lib/auth/password-policy'
import { useCreateUser } from '@/hooks/useProfiles'
import { useRoles } from '@/hooks/useRoles'

const schema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  password: passwordSchema,
  confirm: z.string(),
  user_type: z.enum(['internal', 'external']),
  role_ids: z.array(z.string().uuid()).default([]),
}).refine((v) => v.password === v.confirm, {
  message: 'Passwords do not match', path: ['confirm'],
})

type Values = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function AddUserDialog({ open, onOpenChange }: Props) {
  const createUser = useCreateUser()
  const { data: roles } = useRoles()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      full_name: '', email: '', password: '', confirm: '',
      user_type: 'internal', role_ids: [],
    },
  })

  const selectedRoles = form.watch('role_ids') ?? []

  function onSubmit(values: Values) {
    createUser.mutate(
      {
        full_name: values.full_name,
        email: values.email,
        password: values.password,
        user_type: values.user_type,
        role_ids: values.role_ids,
      },
      {
        onSuccess: (res) => {
          if (res.warning) toast.warning(res.warning)
          else toast.success(`User created — share credentials with ${values.email}`)
          onOpenChange(false)
          form.reset()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl><Input placeholder="Ahmed Al-Thani" {...field} /></FormControl>
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
                  <FormControl><Input type="email" placeholder="ahmed@example.com" {...field} /></FormControl>
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
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password *</FormLabel>
                  <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">8+ chars, uppercase, lowercase, digit, symbol.</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password *</FormLabel>
                  <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? 'Creating…' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
