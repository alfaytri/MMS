'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useContactCenterContext } from '@/contexts/ContactCenterContext'
import { ContactCenterSidebar } from './ContactCenterSidebar'

export function ContactCenterSidebarGate() {
  const supabase = createClient()
  const { setCcSidebar } = useContactCenterContext()

  const { data: hasPermission, isLoading } = useQuery({
    queryKey: ['cc-permission'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(permissions))')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (!profile) return false

      const perms: string[] = ((profile.user_custom_roles ?? []) as Array<{ custom_roles: { permissions: string[] } | null }>)
        .flatMap((r) => r.custom_roles?.permissions ?? [])
      return perms.includes('contact_centre.view')
    },
  })

  // Tell DashboardMain how much left-padding to apply
  useEffect(() => {
    if (isLoading) return
    setCcSidebar(hasPermission ? 'collapsed' : 'none')
  }, [hasPermission, isLoading, setCcSidebar])

  if (isLoading || !hasPermission) return null
  return <ContactCenterSidebar />
}
