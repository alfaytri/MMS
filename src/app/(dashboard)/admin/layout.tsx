import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Bootstrap admin (env var) always passes
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase()
  const callerEmail = user.email?.trim().toLowerCase() ?? null
  if (bootstrapEmail && callerEmail === bootstrapEmail) {
    return <>{children}</>
  }

  // Check for admin permission via custom roles
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(is_system, permissions))')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) redirect('/')

  const roles: Array<{ custom_roles: { is_system: boolean | null; permissions: string[] } | null }> =
    (profile as any).user_custom_roles ?? []

  const isAdmin = roles.some((r) =>
    r.custom_roles?.is_system === true ||
    (r.custom_roles?.permissions ?? []).includes('master_data.users.manage')
  )

  if (!isAdmin) redirect('/')

  return <>{children}</>
}
