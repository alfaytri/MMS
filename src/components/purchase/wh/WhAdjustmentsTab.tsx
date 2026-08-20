'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/shared/EmptyState'
import { ItemTreeCell } from './ItemTreeCell'
import { useStockAdjustments, useAdjustmentPhotoSignedUrls, type StockAdjustmentApprovalStep } from '@/hooks/useWarehouseOperations'
import { shortenSubContainerName, useDivisionScopedVisibility } from '@/hooks/useWarehouseSubContainers'
import { useAllCategoriesFlat, breadcrumb as categoryBreadcrumb } from '@/hooks/useInventoryTree'
import { WhAdjustmentDetailDialog } from './WhAdjustmentDetailDialog'
import type { Warehouse } from '@/hooks/useWarehouses'
import type { Profile } from '@/hooks/useProfiles'
import { format } from 'date-fns'
import { WarehouseReportButton } from './WarehouseReportButton'

type StockAdjustmentRow = {
  id: string
  warehouse_id: string
  sub_container_id: string | null
  sub_container_name: string | null
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
  inventory_item_brand_variants?: {
    brand?: string | null
    country_codes?: { name: string | null } | null
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
  const [photoUrls, setPhotoUrls] = useState<string[] | null>(null)
  const { data: previewSignedUrls } = useAdjustmentPhotoSignedUrls(photoUrls ?? [])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [detailId, setDetailId] = useState<string | null>(null)

  const typedAdjustments = adjustments as unknown as StockAdjustmentRow[]
  const divVisible = useDivisionScopedVisibility()
  // Division-scoped: hide adjustments whose sub-container is outside the view.
  const scopedAdjustments = useMemo(
    () => typedAdjustments.filter((a) => divVisible(a.sub_container_id)),
    [typedAdjustments, divVisible],
  )

  const detailRow = useMemo(
    () => (detailId ? typedAdjustments.find(a => a.id === detailId) ?? null : null),
    [detailId, typedAdjustments],
  )

  const counts = useMemo(() => {
    const c = { all: scopedAdjustments.length, pending_approval: 0, approved: 0, rejected: 0 }
    for (const a of scopedAdjustments) {
      if (a.status === 'pending_approval') c.pending_approval++
      else if (a.status === 'approved')    c.approved++
      else if (a.status === 'rejected')    c.rejected++
    }
    return c
  }, [scopedAdjustments])

  const filteredAdjustments = useMemo(() => {
    if (statusFilter === 'all') return scopedAdjustments
    return scopedAdjustments.filter(a => a.status === statusFilter)
  }, [scopedAdjustments, statusFilter])

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25
  const totalPages = Math.max(1, Math.ceil(filteredAdjustments.length / PAGE_SIZE))
  useEffect(() => { setPage(1) }, [statusFilter])
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredAdjustments.slice(start, start + PAGE_SIZE)
  }, [filteredAdjustments, page])

  const FILTER_TABS: Array<{ value: StatusFilter; label: string; count: number }> = [
    { value: 'all',              label: 'All',      count: counts.all },
    { value: 'pending_approval', label: 'Pending',  count: counts.pending_approval },
    { value: 'approved',         label: 'Approved', count: counts.approved },
    { value: 'rejected',         label: 'Rejected', count: counts.rejected },
  ]

  return (
    <div className="p-4 md:p-6 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)} className="min-w-0">
          <TabsList className="h-8 min-h-11 md:min-h-0 text-xs max-w-full overflow-x-auto md:overflow-x-visible whitespace-nowrap">
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
        <div className="flex-shrink-0">
          <WarehouseReportButton reportType="adjustments" label="Report" />
        </div>
      </div>

      {/* ── Mobile card list (< md) ─────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {filteredAdjustments.length === 0 ? (
          <EmptyState
            title={
              statusFilter === 'all'
                ? 'No adjustments found'
                : `No ${statusFilter === 'pending_approval' ? 'pending' : statusFilter} adjustments`
            }
          />
        ) : paged.map((adj) => {
          const item     = adj.inventory_item_brand_variants?.inventory_items
          const itemName = item?.name_en ?? '—'
          const brand    = adj.inventory_item_brand_variants?.brand ?? null
          const origin   = adj.inventory_item_brand_variants?.country_codes?.name ?? null
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
            <button
              key={adj.id}
              type="button"
              className="w-full text-left bg-card border rounded-md p-3 min-h-11 active:bg-muted/40 transition-colors"
              onClick={() => setDetailId(adj.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <ItemTreeCell
                    category={category}
                    itemType={itemType}
                    itemName={itemName}
                    brand={brand}
                    origin={origin}
                  />
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0 leading-none pt-0.5">{adj.qty}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <Badge className={`text-[10px] px-1.5 py-0 capitalize ${TYPE_STYLES[adj.adjustment_type] ?? ''}`}>
                  {adj.adjustment_type?.replace(/_/g, ' ')}
                </Badge>
                <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[adj.status] ?? 'bg-muted text-muted-foreground'}`}>
                  {adj.status?.replace(/_/g, ' ')}{stepCounter}
                </Badge>
                {adj.created_at && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {format(new Date(adj.created_at), 'dd MMM yyyy')}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Desktop table (md+) ───────────────────────────────────── */}
      <div className="rounded-md border overflow-x-auto hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-[22%]">Item</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Warehouse</TableHead>
              <TableHead className="text-xs hidden xl:table-cell">Sub-container</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs text-right">Qty</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Reason</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Requested By</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Photos</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAdjustments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="p-0">
                  <EmptyState
                    title={
                      statusFilter === 'all'
                        ? 'No adjustments found'
                        : `No ${statusFilter === 'pending_approval' ? 'pending' : statusFilter} adjustments`
                    }
                  />
                </TableCell>
              </TableRow>
            ) : paged.map((adj, i) => {
              const item     = adj.inventory_item_brand_variants?.inventory_items
              const itemName = item?.name_en ?? '—'
              const brand    = adj.inventory_item_brand_variants?.brand ?? null
              const origin   = adj.inventory_item_brand_variants?.country_codes?.name ?? null
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
                  className={`cursor-pointer hover:bg-muted/40 ${STAGGER_IN}`}
                  style={staggerDelay(i)}
                  onClick={() => setDetailId(adj.id)}
                >
                  <TableCell className="text-xs py-2.5">
                    <ItemTreeCell
                      category={category}
                      itemType={itemType}
                      itemName={itemName}
                      brand={brand}
                      origin={origin}
                    />
                  </TableCell>

                  <TableCell className="text-xs whitespace-nowrap py-2.5">
                    {adj.created_at ? format(new Date(adj.created_at), 'dd MMM') : '—'}
                  </TableCell>
                  <TableCell className="text-xs py-2.5 hidden lg:table-cell">{adj.warehouses?.name ?? '—'}</TableCell>
                  <TableCell className="text-xs py-2.5 hidden xl:table-cell">
                    {adj.sub_container_name
                      ? shortenSubContainerName(adj.sub_container_name, adj.warehouses?.name ?? '')
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="py-2.5">
                    <Badge className={`text-[10px] px-1.5 py-0 capitalize ${TYPE_STYLES[adj.adjustment_type] ?? ''}`}>
                      {adj.adjustment_type?.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right py-2.5">{adj.qty}</TableCell>
                  <TableCell className="text-xs max-w-[120px] truncate py-2.5 hidden lg:table-cell">{adj.reason}</TableCell>
                  <TableCell className="text-xs py-2.5 hidden lg:table-cell">{adj.requested_by_name ?? '—'}</TableCell>
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
                    <Button
                      size="sm" variant="ghost"
                      className="h-6 px-1.5 gap-1 text-[10px]"
                      onClick={() => setDetailId(adj.id)}
                    >
                      <Eye className="h-3 w-3" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {filteredAdjustments.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>{filteredAdjustments.length} adjustment{filteredAdjustments.length !== 1 ? 's' : ''}</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="tabular-nums min-w-[80px] text-center">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

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
            {(photoUrls ?? []).map((pathOrUrl, i) => {
              const src = pathOrUrl.startsWith('http') ? pathOrUrl : previewSignedUrls?.[pathOrUrl]
              if (!src) {
                return (
                  <div
                    key={i}
                    className="aspect-square w-full rounded-md border bg-muted animate-pulse"
                    aria-label={`Evidence ${i + 1} loading`}
                  />
                )
              }
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`Evidence ${i + 1}`} className="aspect-square w-full object-cover rounded-md border" />
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})
