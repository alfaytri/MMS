'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const SETTING_KEY = 'order_quotation_validity_days'

function useValidityDays() {
  return useQuery<number>({
    queryKey: ['app_settings', SETTING_KEY],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle()
      const days = Number((data?.value as { days?: number } | null)?.days)
      return Number.isFinite(days) && days > 0 ? days : 30
    },
  })
}

function useUpdateValidityDays() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (days: number) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          { key: SETTING_KEY, value: { days } },
          { onConflict: 'key' },
        )
      if (error) throw error
      return days
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app_settings', SETTING_KEY] })
    },
  })
}

export function OrderQuotationSettingsAdmin() {
  const { data: savedDays, isLoading } = useValidityDays()
  const update = useUpdateValidityDays()
  const [days, setDays] = useState<string>('')

  useEffect(() => {
    if (savedDays !== undefined) setDays(String(savedDays))
  }, [savedDays])

  const parsed = Number(days)
  const isValid = Number.isFinite(parsed) && parsed > 0 && parsed <= 365
  const isDirty = String(savedDays ?? '') !== days

  async function handleSave() {
    try {
      await update.mutateAsync(parsed)
      toast.success('Validity period updated')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to update setting')
    }
  }

  return (
    <div className="max-w-md space-y-5">
      <div className="space-y-2">
        <Label htmlFor="validity-days" className="text-sm font-medium">
          Validity (days)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="validity-days"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={isLoading}
            className="h-10 w-32"
          />
          <Button
            onClick={handleSave}
            disabled={!isValid || !isDirty || update.isPending}
            className="h-10"
          >
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          How many days an order quotation stays valid from its issue date. The
          PDF's &ldquo;Valid Until&rdquo; date and the stored expiry are derived
          from this value. Allowed range: 1&ndash;365 days.
        </p>
      </div>
    </div>
  )
}
