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
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { passwordSchema } from '@/lib/auth/password-policy'
import { useResetUserPassword, type Profile } from '@/hooks/useProfiles'

const schema = z.object({
  password: passwordSchema,
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, {
  message: 'Passwords do not match', path: ['confirm'],
})

type Values = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  profile: Profile | null
}

export function ResetPasswordDialog({ open, onOpenChange, profile }: Props) {
  const resetPw = useResetUserPassword()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: { password: '', confirm: '' },
  })

  function onSubmit(values: Values) {
    if (!profile) return
    resetPw.mutate(
      { user_id: profile.auth_user_id, password: values.password },
      {
        onSuccess: () => {
          toast.success('Password reset — user will be prompted to change it on next login')
          onOpenChange(false)
          form.reset()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password {profile?.full_name ? `— ${profile.full_name}` : ''}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password *</FormLabel>
                  <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">10+ chars, uppercase, lowercase, digit, symbol.</p>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={resetPw.isPending}>
                {resetPw.isPending ? 'Resetting…' : 'Reset Password'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
