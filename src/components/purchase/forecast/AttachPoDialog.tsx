'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { humanizeDbError } from '@/lib/dbErrors'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SearchInput } from '@/components/shared/SearchInput'
import { useLinkForecastPo } from '@/hooks/usePurchaseForecasts'

type PoRow = { id: string; po_number: string; supplier_name: string | null; status: string }

function usePoSearch(search: string) {
  return useQuery({
    queryKey: ['forecast-attach-po-search', search],
    staleTime: 30_000,
    queryFn: async (): Promise<PoRow[]> => {
      const supabase = createClient()
      let q = supabase.from('purchase_orders').select('id, po_number, supplier_name, status')
        .order('created_at', { ascending: false }).limit(30)
      const s = search.trim()
      if (s) q = q.or(`po_number.ilike.%${s}%,supplier_name.ilike.%${s}%`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as PoRow[]
    },
  })
}

export function AttachPoDialog({ open, onOpenChange, forecastId }: { open: boolean; onOpenChange: (o: boolean) => void; forecastId: string | null }) {
  const [search, setSearch] = useState('')
  const { data: pos = [], isLoading } = usePoSearch(search)
  const link = useLinkForecastPo()

  function attach(poId: string) {
    if (!forecastId) return
    link.mutate({ forecastId, poId }, {
      onSuccess: () => { toast.success('PO attached to forecast'); onOpenChange(false) },
      onError: (e) => toast.error(humanizeDbError(e)),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Attach an existing PO</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search PO # or supplier…" />
          <div className="max-h-[50vh] overflow-y-auto rounded-md border divide-y">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Loading…</div>
            ) : pos.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">No purchase orders found.</div>
            ) : pos.map((po) => (
              <button key={po.id} onClick={() => attach(po.id)} disabled={link.isPending}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50">
                <span><span className="font-mono font-semibold">{po.po_number}</span>{po.supplier_name && <span className="text-muted-foreground"> · {po.supplier_name}</span>}</span>
                <span className="text-[11px] text-muted-foreground">{po.status}</span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
