'use client'

import React, { useState } from 'react'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStockAdjustments, useApproveStockAdjustment } from '@/hooks/useWarehouseOperations'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Warehouse } from '@/hooks/useWarehouses'
import type { Profile } from '@/hooks/useProfiles'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { toast } from 'sonner'

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

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('stock_adjustments')
        .update({ status: 'rejected' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock_adjustments'] }),
  })

  function canApprove(adj: any) {
    const wh = warehouses.find(w => w.id === adj.warehouse_id)
    return currentProfile?.id === (wh as any)?.manager_id
  }

  if (adjustments.length === 0) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center h-40">
        <p className="text-xs text-muted-foreground">No stock adjustments yet.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Warehouse</TableHead>
              <TableHead className="text-xs">Item</TableHead>
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
            {adjustments.map((adj) => (
              <TableRow key={adj.id}>
                <TableCell className="text-xs whitespace-nowrap">
                  {adj.created_at ? format(new Date(adj.created_at), 'dd MMM') : '—'}
                </TableCell>
                <TableCell className="text-xs">{(adj as any).warehouses?.name ?? '—'}</TableCell>
                <TableCell className="text-xs">
                  {(adj as any).inventory_brand_variants?.inventory_items?.name_en ?? '—'}
                  {(adj as any).inventory_brand_variants?.brand && (
                    <span className="text-muted-foreground ml-1">({(adj as any).inventory_brand_variants.brand})</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={`text-[10px] px-1.5 py-0 capitalize ${TYPE_STYLES[adj.adjustment_type] ?? ''}`}>
                    {adj.adjustment_type?.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-right">{adj.qty}</TableCell>
                <TableCell className="text-xs max-w-[120px] truncate">{adj.reason}</TableCell>
                <TableCell className="text-xs">{adj.requested_by_name ?? '—'}</TableCell>
                <TableCell>
                  <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[adj.status] ?? 'bg-muted text-muted-foreground'}`}>
                    {adj.status?.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  {((adj as any).photo_urls?.length ?? 0) > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 gap-1 text-[10px]"
                      onClick={() => setPhotoUrls((adj as any).photo_urls)}
                    >
                      <Eye className="h-3 w-3" />
                      {(adj as any).photo_urls.length}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {adj.status === 'pending_approval' && canApprove(adj) ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
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
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => reject.mutate(adj.id, {
                          onSuccess: () => toast.success('Rejected'),
                          onError: (e) => toast.error(e.message),
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
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Inline photo preview dialog */}
      <Dialog open={!!photoUrls} onOpenChange={() => setPhotoUrls(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Evidence Photos</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {(photoUrls ?? []).map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Evidence ${i + 1}`}
                className="aspect-square w-full object-cover rounded-md border"
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})
