'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { passwordSchema } from '@/lib/auth/password-policy'
import { useCompleteMyPasswordChange } from '@/hooks/useProfiles'

const schema = z.object({
  new_password: passwordSchema,
  confirm: z.string(),
}).refine((v) => v.new_password === v.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})

type Values = z.infer<typeof schema>

export default function ChangePasswordPage() {
  const router = useRouter()
  const completeChange = useCompleteMyPasswordChange()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: { new_password: '', confirm: '' },
  })

  async function onSubmit(values: Values) {
    try {
      await completeChange.mutateAsync({ new_password: values.new_password })
      toast.success('Password changed')
      router.push('/')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Change failed')
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white border rounded-lg p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Set a new password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your password was set by an administrator. Choose a new one to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new_password">New password</Label>
            <Input id="new_password" type="password" autoComplete="new-password" {...register('new_password')} />
            {errors.new_password && <p className="text-xs text-destructive">{errors.new_password.message}</p>}
            <p className="text-xs text-muted-foreground">
              At least 10 characters, with uppercase, lowercase, digit, and symbol.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Saving…' : 'Save new password'}
          </Button>
        </form>
      </div>
    </div>
  )
}
