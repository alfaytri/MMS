import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface CountryCode {
  id: number
  code: string   // '+974'
  iso: string    // 'QA'
  flag: string   // '🇶🇦'
  name: string   // 'Qatar'
}

export function useCountryCodes() {
  return useQuery<CountryCode[]>({
    queryKey: ['country-codes'],
    queryFn: async (): Promise<CountryCode[]> => {
      const supabase = createClient()
      // country_codes may not be in generated types yet — cast to any
      const { data, error } = await (supabase as any)
        .from('country_codes')
        .select('id, code, iso, flag, name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return (data ?? []) as CountryCode[]
    },
    staleTime: 5 * 60_000,
  })
}
