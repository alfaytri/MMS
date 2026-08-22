'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useContactCenterContext } from '@/contexts/ContactCenterContext'
import { ContactCenterSidebarV2 } from './v2/ContactCenterSidebarV2'
import { queryKeys } from '@/lib/queryKeys'
import { useIsLgUp } from '@/hooks/useIsLgUp'

export function ContactCenterSidebarGate() {
  const supabase = createClient()
  const { setCcSidebar } = useContactCenterContext()
  const isLgUp = useIsLgUp()

  const { data: hasPermission, isLoading } = useQuery({
    queryKey: queryKeys.contactCenter.permission,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      const { data: profile } = await supabase
        .from('user_data')
        .select('has_contact_centre_access, user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(permissions))')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (!profile) return false

      // Either source unlocks the sidebar — direct toggle OR role-granted permission.
      if (profile.has_contact_centre_access === true) return true

      const perms: string[] = ((profile.user_custom_roles ?? []) as Array<{ custom_roles: { permissions: string[] } | null }>)
        .flatMap((r) => r.custom_roles?.permissions ?? [])
      return perms.includes('contact_centre.view')
    },
  })

  useEffect(() => {
    if (isLoading) return
    setCcSidebar(isLgUp && hasPermission ? 'collapsed' : 'none')
  }, [hasPermission, isLoading, isLgUp, setCcSidebar])

  if (isLoading || !hasPermission || !isLgUp) return null
  return <ContactCenterSidebarV2 />
}
