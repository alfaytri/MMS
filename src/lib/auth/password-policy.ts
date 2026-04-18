import { z } from 'zod'

/**
 * Shared password policy used by every write endpoint and client form.
 * Mirror of spec §Password policy (design 2026-04-18).
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((v) => /[A-Z]/.test(v), { message: 'Must contain an uppercase letter' })
  .refine((v) => /[a-z]/.test(v), { message: 'Must contain a lowercase letter' })
  .refine((v) => /\d/.test(v), { message: 'Must contain a digit' })
  .refine((v) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(v), {
    message: 'Must contain a symbol',
  })

export type Password = z.infer<typeof passwordSchema>
