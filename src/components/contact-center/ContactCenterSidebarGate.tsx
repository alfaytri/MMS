'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ContactCenterSidebar } from './ContactCenterSidebar'

export function ContactCenterSidebarGate() {
  const supabase = createClient()

  const { data: hasPermission, isLoading } = useQuery({
    queryKey: ['cc-permission'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return false
      const { data } = await (supabase as any)
        .from('user_custom_roles')
        .select('custom_roles(permissions)')
        .eq('user_id', session.user.id)
      const perms: string[] = ((data ?? []) as Array<{ custom_roles: { permissions: string[] } | null }>)
        .flatMap((r) => r.custom_roles?.permissions ?? [])
      return perms.includes('contact_centre.view')
    },
  })

  if (isLoading || !hasPermission) return null
  return <ContactCenterSidebar />
}
