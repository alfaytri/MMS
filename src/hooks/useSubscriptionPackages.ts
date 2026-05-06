import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PriorityResponse = 'none' | '24_48hr' | 'under_24hr'

export type SubscriptionPackage = {
  id: string
  name: string
  name_ar: string | null
  description: string | null
  discount_percent: number
  initial_fee: number
  duration_months: number
  priority_response: PriorityResponse
  response_hours: number | null
  auto_renew_default: boolean
  is_active: boolean
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export type SubscriptionPackageWithCount = SubscriptionPackage & {
  subscriber_count: number
  service_count: number
}

export type PackageServiceEntry = {
  service_id: string
  discount_override: number | null
}

export type UpsertPackagePayload = {
  id?: string | null
  name: string
  name_ar: string | null
  description: string | null
  discount_percent: number
  initial_fee: number
  duration_months: number
  priority_response: PriorityResponse
  response_hours: number | null
  auto_renew_default: boolean
  services: PackageServiceEntry[]
  created_by_name?: string | null
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSubscriptionPackages({ includeArchived = false }: { includeArchived?: boolean } = {}) {
  return useQuery({
    queryKey: ['subscription_packages', { includeArchived }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('subscription_packages_with_counts')
        .select('*')
        .order('created_at', { ascending: false })
      if (!includeArchived) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as SubscriptionPackageWithCount[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function usePackageServices(packageId: string | null) {
  return useQuery({
    queryKey: ['subscription_package_services', packageId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('subscription_package_services')
        .select('service_id, discount_override')
        .eq('package_id', packageId)
      if (error) throw error
      return (data ?? []) as PackageServiceEntry[]
    },
    enabled: !!packageId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpsertPackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      payload,
      performerName,
    }: {
      payload: UpsertPackagePayload
      performerName?: string | null
    }) => {
      const supabase = createClient()
      const isCreate = !payload.id
      const { services, ...packageFields } = payload

      const { data, error } = await (supabase as any).rpc('upsert_package_with_services', {
        p_package: packageFields,
        p_services: services,
      })
      if (error) throw new Error(error.message)

      await logActivity({
        action: isCreate ? 'create' : 'update',
        module: 'subscription_packages',
        entity_id: data as string,
        details: JSON.stringify(packageFields),
        performer_name: performerName ?? null,
      })

      return data as string
    },
    onSuccess: (_, { payload }) => {
      qc.invalidateQueries({ queryKey: ['subscription_packages'] })
      if (payload.id) {
        qc.invalidateQueries({ queryKey: ['subscription_package_services', payload.id] })
      }
    },
  })
}

export function useArchivePackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      performerName,
    }: {
      id: string
      performerName?: string | null
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('subscription_packages')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw new Error(error.message)
      await logActivity({
        action: 'archive',
        module: 'subscription_packages',
        entity_id: id,
        performer_name: performerName ?? null,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription_packages'] }),
  })
}
