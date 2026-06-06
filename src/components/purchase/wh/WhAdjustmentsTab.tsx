'use client'

import React, { useState, useMemo } from 'react'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { useStockAdjustments, useApproveStockAdjustment, useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Warehouse } from '@/hooks/useWarehouses'
import type { Profile } from '@/hooks/useProfiles'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/queryKeys'

type StockAdjustmentRow = {
  id: string
  warehouse_id: string
  brand_variant_id: string
  adjustment_type: string
  qty: number
  reason: string
  notes: string | null
  status: string
  requested_by_name: string | null
  approved_by_name: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
  warehouses?: { name: string } | null
  inventory_brand_variants?: {
    brand?: string | null
    inventory_items?: { name_en: string; sku?: string | null } | null
  } | null
  photo_urls?: string[] | null
}

const TYPE_STYLES: Record<string, string> = {
  increase:  'bg-success/10 text-success',
  decrease:  'bg-warning/10 text-warning',
  damage:    'bg-destructive/10 text-destructive',
  write_off: 'bg-destructive/10 text-destructive',
}
const STATUS_STYLES: Record<string, string> = {
  pending_approval: 'bg-warning/10 text-warning',
  approved:         'bg-success/10 text-success',
  rejected:         'bg-destructive/10 text-destructive',
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: Profile | null
}

export const WhAdjustmentsTab = React.memo(function WhAdjustmentsTab({ warehouses, currentProfile }: Props) {
  const { data: adjustments = [] } = useStockAdjustments()
  const approve = useApproveStockAdjustment()
  const qc = useQueryClient()
  const [photoUrls, setPhotoUrls] = useState<string[] | null>(null)

  const typedAdjustments = adjustments as unknown as StockAdjustmentRow[]

  // Use cached warehouse_stock_view to resolve category_name per brand_variant_id
  const { data: fullStock = [] } = useWarehouseStock()
  const variantMeta = useMemo(() => {
    const map = new Map<string, { categoryName: string | null }>()
    for (const s of fullStock) {
      if (!map.has(s.brand_variant_id)) {
        map.set(s.brand_variant_id, { categoryName: s.category_name ?? null })
      }
    }
    return map
  }, [fullStock])

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('stock_adjustments').update({ status: 'rejected' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.stockAdjustments }),
  })

  function canApprove(adj: StockAdjustmentRow) {
    const wh = warehouses.find(w => w.id === adj.warehouse_id)
    if (!wh?.manager_profile_id) return true
    return currentProfile?.id === wh.manager_profile_id
  }

  return (
    <div className="p-4 md:p-6">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-[22%]">Item</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Warehouse</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs text-right">Qty</TableHead>
              <TableHead className="text-xs">Reason</TableHead>
              <TableHead className="text-xs">Requested By</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Photos</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {typedAdjustments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="p-0">
                  <EmptyState title="No adjustments found" />
                </TableCell>
              </TableRow>
            ) : typedAdjustments.map((adj) => {
              const category = variantMeta.get(adj.brand_variant_id)?.categoryName
              const itemName = adj.inventory_brand_variants?.inventory_items?.name_en
              const brand    = adj.inventory_brand_variants?.brand

              return (
                <TableRow key={adj.id}>
                  {/* Item cell — 3-level indented hierarchy */}
                  <TableCell className="text-xs py-2.5">
                    <div className="flex flex-col gap-1">
                      {/* Level 1 — Category */}
                      {category && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">{category}</span>
                        </div>
                      )}
                      {/* Level 2 — Item */}
                      <div className="flex items-center gap-1" style={{ paddingLeft: category ? '12px' : '0' }}>
                        <span className="font-medium text-xs">{itemName ?? '—'}</span>
                      </div>
                      {/* Level 3 — Brand */}
                      {brand && (
                        <div className="flex items-center gap-1" style={{ paddingLeft: category ? '24px' : '12px' }}>
                          <span className="text-[10px] text-primary">{brand}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Remaining columns — normal flat data */}
                  <TableCell className="text-xs whitespace-nowrap py-2.5">
                    {adj.created_at ? format(new Date(adj.created_at), 'dd MMM') : '—'}
                  </TableCell>
                  <TableCell className="text-xs py-2.5">{adj.warehouses?.name ?? '—'}</TableCell>
                  <TableCell className="py-2.5">
                    <Badge className={`text-[10px] px-1.5 py-0 capitalize ${TYPE_STYLES[adj.adjustment_type] ?? ''}`}>
                      {adj.adjustment_type?.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right py-2.5">{adj.qty}</TableCell>
                  <TableCell className="text-xs max-w-[120px] truncate py-2.5">{adj.reason}</TableCell>
                  <TableCell className="text-xs py-2.5">{adj.requested_by_name ?? '—'}</TableCell>
                  <TableCell className="py-2.5">
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[adj.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {adj.status?.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2.5">
                    {(adj.photo_urls?.length ?? 0) > 0 && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 px-1.5 gap-1 text-[10px]"
                        onClick={() => setPhotoUrls(adj.photo_urls!)}
                      >
                        <Eye className="h-3 w-3" />
                        {adj.photo_urls!.length}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-right py-2.5">
                    {adj.status === 'pending_approval' && canApprove(adj) ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm" variant="outline"
                          className="h-6 text-[10px] text-success border-success/30 hover:bg-success/10"
                          onClick={() => approve.mutate(
                            { id: adj.id, approvedByName: currentProfile?.full_name ?? 'Manager' },
                            { onSuccess: () => toast.success('Approved'), onError: (e) => toast.error(e.message) }
                          )}
                          disabled={approve.isPending}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="h-6 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => reject.mutate(adj.id, {
                            onSuccess: () => toast.success('Rejected'),
                            onError:  (e) => toast.error(e.message),
                          })}
                          disabled={reject.isPending}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        {adj.status === 'pending_approval' ? 'Awaiting approval' : adj.approved_by_name ?? '—'}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Photo preview dialog */}
      <Dialog open={!!photoUrls} onOpenChange={() => setPhotoUrls(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Evidence Photos</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {(photoUrls ?? []).map((url, i) => (
              <img key={i} src={url} alt={`Evidence ${i + 1}`} className="aspect-square w-full object-cover rounded-md border" />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})
