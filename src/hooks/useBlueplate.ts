import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface BlueplateResult {
  unit_no: string
  building_no: string
  street_no: string
  zone_no: string
  lat: number
  lng: number
}

export function useBlueplate() {
  const fetchByNumber = useMutation({
    mutationFn: async (bluePlateNo: string): Promise<BlueplateResult> => {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke('blue-plate-lookup', {
        body: { plate: bluePlateNo },
      })
      if (error) throw new Error('Blue Plate not found')
      return data as BlueplateResult
    },
  })

  return { fetchByNumber }
}
