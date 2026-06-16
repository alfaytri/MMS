'use client'

import React, { useState, useMemo } from 'react'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/shared/EmptyState'
import { ItemTreeCell } from './ItemTreeCell'
import { useStockAdjustments, useApproveStockAdjustment, type StockAdjustmentApprovalStep } from '@/hooks/useWarehouseOperations'
import { useAllCategoriesFlat, breadcrumb as categoryBreadcrumb } from '@/hooks/useInventoryTree'
import { WhAdjustmentDetailDialog } from './WhAdjustmentDetailDialog'
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
    inventory_items?: {
      name_en: string
      sku?: string | null
      inventory_categories?: { id: string | null; name_en: string | null; type: string | null } | null
    } | null
  } | null
  photo_urls?: string[] | null
  stock_adjustment_approvals?: StockAdjustmentApprovalStep[] | null
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

type StatusFilter = 'all' | 'pending_approval' | 'approved' | 'rejected'

interface Props {
  warehouses: Warehouse[]
  currentProfile: Profile | null
}

export const WhAdjustmentsTab = React.memo(function WhAdjustmentsTab({ warehouses, currentProfile }: Props) {
  const { data: adjustments = [] } = useStockAdjustments()
  const { data: categoriesFlat = [] } = useAllCategoriesFlat()
  const approve = useApproveStockAdjustment()
  const qc = useQueryClient()
  const [photoUrls, setPhotoUrls] = useState<string[] | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [detailId, setDetailId] = useState<string | null>(null)

  const typedAdjustments = adjustments as unknown as StockAdjustmentRow[]

  const detailRow = useMemo(
    () => (detailId ? typedAdjustments.find(a => a.id === detailId) ?? null : null),
    [detailId, typedAdjustments],
  )

  const counts = useMemo(() => {
    const c = { all: typedAdjustments.length, pending_approval: 0, approved: 0, rejected: 0 }
    for (const a of typedAdjustments) {
      if (a.status === 'pending_approval') c.pending_approval++
      else if (a.status === 'approved')    c.approved++
      else if (a.status === 'rejected')    c.rejected++
    }
    return c
  }, [typedAdjustments])

  const filteredAdjustments = useMemo(() => {
    if (statusFilter === 'all') return typedAdjustments
    return typedAdjustments.filter(a => a.status === statusFilter)
  }, [typedAdjustments, statusFilter])

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
    if (!wh || wh.field_rps.length === 0) return true
    return wh.field_rps.some(rp => rp.profile_id === currentProfile?.id)
  }

  const FILTER_TABS: Array<{ value: StatusFilter; label: string; count: number }> = [
    { value: 'all',              label: 'All',      count: counts.all },
    { value: 'pending_approval', label: 'Pending',  count: counts.pending_approval },
    { value: 'approved',         label: 'Approved', count: counts.approved },
    { value: 'rejected',         label: 'Rejected', count: counts.rejected },
  ]

  return (
    <div className="p-4 md:p-6 space-y-3">
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
        <TabsList className="h-8 text-xs">
          {FILTER_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs px-3 h-7 gap-1">
              {t.label}
              {t.count > 0 && (
                <span
                  className={`ml-1 h-4 min-w-4 px-1 text-[9px] rounded inline-flex items-center justify-center ${
                    t.value === 'pending_approval'
                      ? 'bg-warning/20 text-warning'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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
            {filteredAdjustments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="p-0">
                  <EmptyState
                    title={
                      statusFilter === 'all'
                        ? 'No adjustments found'
                        : `No ${statusFilter === 'pending_approval' ? 'pending' : statusFilter} adjustments`
                    }
                  />
                </TableCell>
              </TableRow>
            ) : filteredAdjustments.map((adj) => {
              const item     = adj.inventory_brand_variants?.inventory_items
              const itemName = item?.name_en ?? '—'
              const brand    = adj.inventory_brand_variants?.brand ?? null
              const categoryId = item?.inventory_categories?.id ?? null
              const itemType   = item?.inventory_categories?.type ?? null
              const category   = categoryId && categoriesFlat.length
                ? categoryBreadcrumb(categoryId, categoriesFlat)
                : item?.inventory_categories?.name_en ?? null

              const chainSteps = [...(adj.stock_adjustment_approvals ?? [])]
                .sort((a, b) => a.step_order - b.step_order)
              const hasChain      = chainSteps.length > 0
              const totalSteps    = chainSteps.length
              const approvedSteps = chainSteps.filter(s => s.status === 'approved').length
              const stepCounter   =
                hasChain && adj.status === 'pending_approval'
                  ? ` · ${approvedSteps}/${totalSteps}`
                  : ''

              return (
                <TableRow
                  key={adj.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setDetailId(adj.id)}
                >
                  <TableCell className="text-xs py-2.5">
                    <ItemTreeCell
                      category={category}
                      itemType={itemType}
                      itemName={itemName}
                      brand={brand}
                    />
                  </TableCell>

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
                      {adj.status?.replace(/_/g, ' ')}{stepCounter}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
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
                  <TableCell className="text-right py-2.5" onClick={(e) => e.stopPropagation()}>
                    {hasChain ? (
                      <Button
                        size="sm" variant="ghost"
                        className="h-6 px-1.5 gap-1 text-[10px]"
                        onClick={() => setDetailId(adj.id)}
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </Button>
                    ) : adj.status === 'pending_approval' && canApprove(adj) ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm" variant="outline"
                          className="h-6 text-[10px] text-success border-success/30 hover:bg-success/10"
                          onClick={() => approve.mutate(
                            { id: adj.id, approvedByName: currentProfile?.full_name ?? 'Manager' },
                            { onSuccess: () => toast.success('Approved'), onError: (e) => toast.error(e.message) },
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

      <WhAdjustmentDetailDialog
        adjustment={detailRow}
        currentProfile={currentProfile}
        warehouses={warehouses}
        open={!!detailRow}
        onOpenChange={(open) => { if (!open) setDetailId(null) }}
      />

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
