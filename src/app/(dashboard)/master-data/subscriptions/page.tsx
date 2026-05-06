// src/app/(dashboard)/master-data/subscriptions/page.tsx
import { createClient } from '@/lib/supabase/server'
import { SubscriptionsPage } from '@/components/master-data/subscriptions/SubscriptionsPage'

export default async function SubscriptionPackagesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let currentProfile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    currentProfile = data
  }

  return <SubscriptionsPage currentProfile={currentProfile} />
}
