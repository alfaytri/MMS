'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import Link from 'next/link'
import { toast } from 'sonner'
import { Eye, Plus, Trash2, Paperclip, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import {
  useLandedCosts, useCreateLandedCost, useVoidLandedCost, useApplyLandedCost,
  useRevertLandedCost, useValidateLcAllocation, useBillSignedUrls,
  type LandedCost, type LandedCostLine, type LandedCostItemAllocation,
} from '@/hooks/useLandedCosts'
import {
  useReceivalsForLcSelector, useReceivalItemsWithFifo,
} from '@/hooks/useReceivals'
import {
  useBrandVariantsByIds, useBatchUpdateSellingPrices,
} from '@/hooks/useInventory'
import type { ColumnDef } from '@tanstack/react-table'

// ─── Local hooks for detail dialog ───────────────────────────────────────────

function useAttachedReceivals(receivalIds: string[]) {
  return useQuery({
    queryKey: ['lc-attached-receivals', receivalIds.slice().sort().join(',')],
    enabled: receivalIds.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('receivals')
        .select('id, receival_number, date, purchase_orders!receivals_po_id_fkey(supplier_name)')
        .in('id', receivalIds)
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        receival_number: r.receival_number as string,
        date: r.date as string,
        supplier_name: (r.purchase_orders?.supplier_name ?? 'Unknown') as string,
      }))
    },
    staleTime: 2 * 60 * 1000,
  })
}

function useAttachedPOs(poIds: string[]) {
  return useQuery({
    queryKey: ['lc-attached-pos', poIds.slice().sort().join(',')],
    enabled: poIds.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('id, po_number, supplier_name')
        .in('id', poIds)
      if (error) throw error
      return (data ?? []) as Array<{ id: string; po_number: string; supplier_name: string }>
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── Price Review Dialog ──────────────────────────────────────────────────────

type PriceReviewRow = {
  brand_variant_id: string
  item_name: string
  sku: string | null
  original_unit_cost: number  // receival-period weighted avg before LC (context display only)
  new_avg_cost: number        // brand variant's true average cost after LC apply (pricing basis)
  method: 'markup' | 'fixed'
  markup_percent: number
}

function PriceReviewDialog({
  open,
  allocations,
  onDone,
}: {
  open: boolean
  allocations: LandedCostItemAllocation[]
  onDone: () => void
}) {
  const bvIds = allocations.map((a) => a.brand_variant_id).filter(Boolean)
  const { data: bvPrices, isLoading: loadingPrices } = useBrandVariantsByIds(bvIds)
  const batchUpdate = useBatchUpdateSellingPrices()

  const [rows, setRows] = useState<PriceReviewRow[]>([])

  // Build rows once bvPrices loads
  useEffect(() => {
    if (!open || !bvPrices) return
    setRows(
      allocations
        .filter((a) => a.qty_remaining_at_lc > 0)
        .map((a) => {
          const bv = bvPrices.find((b) => b.id === a.brand_variant_id)
          return {
            brand_variant_id: a.brand_variant_id,
            item_name: a.item_name,
            sku: a.sku,
            original_unit_cost: a.original_unit_cost,
            // Use the brand variant's true post-LC average cost from the DB.
            // This reflects ALL remaining inventory, not just the LC-specific layers.
            new_avg_cost: bv?.average_cost ?? a.updated_unit_cost,
            method: 'markup' as const,
            markup_percent: bv?.margin_percent ?? 0,
          }
        }),
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bvPrices])

  function updateRow(idx: number, patch: Partial<PriceReviewRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function handleUpdate() {
    const updates = rows
      .filter((r) => r.method === 'markup')
      .map((r) => ({
        id: r.brand_variant_id,
        // Selling price = avg_cost × (1 + markup%) — based on true brand average cost
        selling_price: parseFloat(
          (r.new_avg_cost * (1 + r.markup_percent / 100)).toFixed(2),
        ),
        margin_percent: r.markup_percent,
      }))
    if (updates.length === 0) { onDone(); return }
    batchUpdate.mutate(updates, {
      onSuccess: () => { toast.success('Selling prices updated'); onDone() },
      onError: (err) => toast.error(err.message),
    })
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={() => onDone()}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-3xl sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Review Selling Prices</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The LC has been applied. Unit costs have changed — review each product&apos;s selling price.
        </p>
        {loadingPrices ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items with remaining inventory to price.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto max-h-[55vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Prev Avg</TableHead>
                  <TableHead className="text-right">New Avg Cost</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right w-24">Markup %</TableHead>
                  <TableHead className="text-right">New Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const suggestedPrice =
                    row.method === 'markup'
                      ? (row.new_avg_cost * (1 + row.markup_percent / 100)).toFixed(2)
                      : null
                  return (
                    <TableRow key={row.brand_variant_id}>
                      <TableCell className="text-sm">
                        <p className="font-medium">{row.item_name}</p>
                        {row.sku && <p className="text-xs text-muted-foreground font-mono">{row.sku}</p>}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatCurrency(row.original_unit_cost, 'QAR')}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-blue-700">
                        {formatCurrency(row.new_avg_cost, 'QAR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="radio"
                              name={`method-${idx}`}
                              checked={row.method === 'markup'}
                              onChange={() => updateRow(idx, { method: 'markup' })}
                            />
                            Markup-based
                          </label>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="radio"
                              name={`method-${idx}`}
                              checked={row.method === 'fixed'}
                              onChange={() => updateRow(idx, { method: 'fixed' })}
                            />
                            Fixed (no change)
                          </label>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.method === 'markup' ? (
                          <Input
                            type="number" min="0" step="0.01"
                            className="h-7 w-20 text-right text-sm"
                            value={row.markup_percent}
                            onChange={(e) =>
                              updateRow(idx, { markup_percent: parseFloat(e.target.value) || 0 })
                            }
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {suggestedPrice
                          ? formatCurrency(parseFloat(suggestedPrice), 'QAR')
                          : <span className="text-muted-foreground text-xs">unchanged</span>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDone} disabled={batchUpdate.isPending}>
            Skip
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={batchUpdate.isPending || loadingPrices || rows.every((r) => r.method === 'fixed')}
          >
            {batchUpdate.isPending ? 'Updating…' : 'Update Prices'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── LC Detail Dialog ─────────────────────────────────────────────────────────

function LcDetailDialog({
  lc,
  onClose,
}: {
  lc: LandedCost | null
  onClose: () => void
}) {
  const voidLc = useVoidLandedCost()
  const applyLc = useApplyLandedCost()
  const revertLc = useRevertLandedCost()
  const [voidOpen, setVoidOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [revertOpen, setRevertOpen] = useState(false)
  const [revertConfirmText, setRevertConfirmText] = useState('')
  const [priceReviewOpen, setPriceReviewOpen] = useState(false)
  const [priceReviewAllocations, setPriceReviewAllocations] = useState<LandedCostItemAllocation[]>([])

  const billPaths = (lc?.lines ?? []).map((l) => l.bill_path)
  const { data: signedUrls } = useBillSignedUrls(billPaths)

  const { data: attachedReceivals, isLoading: loadingReceivals } = useAttachedReceivals(
    lc?.attached_receival_ids ?? [],
  )
  const { data: attachedPOs } = useAttachedPOs(lc?.attached_po_ids ?? [])

  const [detailExpandedReceivalId, setDetailExpandedReceivalId] = useState<string | null>(null)
  const { data: detailExpandedItems, isLoading: loadingDetailItems } = useReceivalItemsWithFifo(
    detailExpandedReceivalId,
  )

  const { data: validationItems, isLoading: validating } = useValidateLcAllocation(
    lc?.id,
    applyOpen,
  )

  if (!lc) return null

  const isVoided = !!lc.voided_at
  const isApplied = !!lc.applied_at

  const statusBadge = isVoided
    ? <Badge variant="destructive">Voided</Badge>
    : isApplied
      ? <Badge className="bg-green-100 text-green-800 border-green-200">Applied</Badge>
      : <Badge variant="outline">Active</Badge>

  return (
    <>
      <Dialog open={!!lc} onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-3xl sm:rounded-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {lc.lc_number}
              {statusBadge}
              {lc.all_items_sold && (
                <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-xs">
                  All Items Sold
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {/* Header info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Date</p>
                <p className="font-medium">{formatDate(lc.date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total Amount</p>
                <p className="font-semibold">{formatCurrency(lc.total_amount, lc.currency)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Description</p>
                <p className="font-medium">{lc.description ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Receivals Attached</p>
                <p className="font-medium">{lc.attached_receival_ids?.length ?? 0}</p>
              </div>
              {isApplied && (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground text-xs">Applied At</p>
                  <p className="font-medium text-green-700">{formatDate(lc.applied_at!)}</p>
                </div>
              )}
              {isVoided && (
                <>
                  <div>
                    <p className="text-muted-foreground text-xs">Voided At</p>
                    <p className="font-medium text-destructive">{formatDate(lc.voided_at!)}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-muted-foreground text-xs">Void Reason</p>
                    <p className="font-medium">{lc.voided_reason}</p>
                  </div>
                </>
              )}
            </div>

            <Separator />

            {/* Cost Lines */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Cost Lines</h3>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="w-12 text-center">Bill</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(lc.lines ?? []).map((line, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{line.description}</TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatCurrency(line.amount, line.currency)}
                          {line.currency !== 'QAR' && line.exchange_rate && line.exchange_rate !== 1 && (
                            <span className="block text-xs text-muted-foreground">
                              ×{line.exchange_rate} = {formatCurrency(line.amount * line.exchange_rate, 'QAR')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{line.currency}</TableCell>
                        <TableCell className="text-center">
                          {line.bill_path && signedUrls?.[line.bill_path] ? (
                            <a
                              href={signedUrls[line.bill_path]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800"
                              title="View bill document"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Attached Receivals Breakdown */}
            {(lc.attached_receival_ids?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Attached Receivals</h3>
                {loadingReceivals ? (
                  <div className="space-y-1">
                    {lc.attached_receival_ids.map((id) => (
                      <div key={id} className="h-8 rounded-md bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border divide-y">
                    {(attachedReceivals ?? []).map((r: { id: string; receival_number: string; date: string; supplier_name: string }) => {
                      const isExpanded = detailExpandedReceivalId === r.id
                      return (
                        <div key={r.id}>
                          <button
                            type="button"
                            onClick={() => setDetailExpandedReceivalId(isExpanded ? null : r.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left"
                          >
                            <span className="text-muted-foreground w-4 shrink-0">
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />}
                            </span>
                            <Link
                              href="/purchase/receivals"
                              target="_blank"
                              className="font-mono font-medium hover:underline text-blue-600"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {r.receival_number}
                            </Link>
                            <span className="text-muted-foreground">
                              — {r.supplier_name} · {formatDate(r.date)}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="bg-muted/20 px-6 pb-3">
                              {loadingDetailItems ? (
                                <div className="space-y-1 pt-2">
                                  {[1, 2].map((n) => <div key={n} className="h-5 rounded bg-muted animate-pulse" />)}
                                </div>
                              ) : (detailExpandedItems ?? []).length === 0 ? (
                                <p className="text-xs text-muted-foreground pt-2">No billable items</p>
                              ) : (
                                <table className="w-full text-xs mt-2">
                                  <thead>
                                    <tr className="text-muted-foreground border-b">
                                      <th className="text-left py-1 font-medium">Item</th>
                                      <th className="text-right py-1 font-medium">Received</th>
                                      <th className="text-right py-1 font-medium">Remaining</th>
                                      <th className="text-right py-1 font-medium">Unit Cost</th>
                                      <th className="text-right py-1 font-medium">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(detailExpandedItems ?? []).map((item) => (
                                      <tr key={item.id} className="border-b last:border-0">
                                        <td className="py-1 pr-2">{item.item_name}</td>
                                        <td className="text-right py-1">{item.qty_received}</td>
                                        <td className={cn('text-right py-1 font-medium', item.remaining_qty === 0 && 'text-amber-600')}>
                                          {item.remaining_qty}
                                        </td>
                                        <td className="text-right py-1">{formatCurrency(item.unit_cost, 'QAR')}</td>
                                        <td className="text-right py-1 font-medium">
                                          {formatCurrency(item.qty_received * item.unit_cost, 'QAR')}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Attached POs */}
            {(lc.attached_po_ids?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Attached Purchase Orders</h3>
                <div className="rounded-md border divide-y">
                  {(attachedPOs ?? []).map((po) => (
                    <div key={po.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <Link
                        href="/purchase/orders"
                        target="_blank"
                        className="font-mono font-medium hover:underline text-blue-600"
                      >
                        {po.po_number}
                      </Link>
                      <span className="text-muted-foreground">— {po.supplier_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Item Allocations */}
            {(lc.item_allocations ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Item Allocations</h3>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Rcvd</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Remaining</TableHead>
                        <TableHead className="text-right">Original</TableHead>
                        <TableHead className="text-right">LC/Unit</TableHead>
                        <TableHead className="text-right">New Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(lc.item_allocations ?? []).map((alloc, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{alloc.item_name}</TableCell>
                          <TableCell className="text-sm font-mono">{alloc.sku ?? '—'}</TableCell>
                          <TableCell className="text-right text-sm">{alloc.qty_received}</TableCell>
                          <TableCell className="text-right text-sm hidden sm:table-cell">
                            {alloc.qty_remaining_at_lc ?? '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(alloc.original_unit_cost, lc.currency)}</TableCell>
                          <TableCell className="text-right text-sm text-blue-600">
                            +{formatCurrency(alloc.lc_per_unit ?? 0, lc.currency)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatCurrency(alloc.updated_unit_cost, lc.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          {!isVoided && !isApplied && (
            <DialogFooter className="gap-2">
              <Button variant="destructive" size="sm" onClick={() => setVoidOpen(true)}>
                Void LC
              </Button>
              <Button
                size="sm"
                onClick={() => setApplyOpen(true)}
                disabled={lc.attached_receival_ids.length === 0}
              >
                Apply to Inventory
              </Button>
            </DialogFooter>
          )}
          {isApplied && !isVoided && lc.revert_snapshot != null && (
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive hover:bg-destructive/10"
                onClick={() => { setRevertConfirmText(''); setRevertOpen(true) }}
              >
                Revert Apply
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Apply confirm — shows pre-flight validation before destructive action */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
          {lc && (
            <>
              <DialogHeader><DialogTitle>Apply Landed Cost to Inventory</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This will distribute{' '}
                  <strong>{formatCurrency(lc.total_amount, lc.currency)}</strong> across the FIFO
                  layers of all items in the attached receivals. This action cannot be undone.
                </p>
                {validating ? (
                  <Skeleton className="h-28 w-full" />
                ) : (validationItems ?? []).length > 0 ? (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Received</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(validationItems ?? []).map((item, idx) => (
                          <TableRow key={idx} className={item.warning ? 'bg-amber-50' : ''}>
                            <TableCell className="text-sm">
                              {item.item_name}
                              {item.warning && (
                                <p className="text-xs text-amber-600 mt-0.5">{item.warning}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm">{item.qty_received}</TableCell>
                            <TableCell className={cn('text-right text-sm font-medium', item.qty_remaining_in_layers === 0 && 'text-amber-600')}>
                              {item.qty_remaining_in_layers}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
                <Button
                  disabled={applyLc.isPending || validating}
                  onClick={() =>
                    applyLc.mutate(lc.id, {
                      onSuccess: (data) => {
                        toast.success('Landed cost applied to inventory')
                        setApplyOpen(false)
                        if (Array.isArray(data) && data.length > 0) {
                          setPriceReviewAllocations(data as LandedCostItemAllocation[])
                          setPriceReviewOpen(true)
                        } else {
                          onClose()
                        }
                      },
                      onError: (err) => toast.error(err.message),
                    })
                  }
                >
                  {applyLc.isPending ? 'Applying…' : 'Confirm Apply'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Void confirm */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-sm sm:rounded-lg">
          <DialogHeader><DialogTitle>Void Landed Cost</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This will void {lc.lc_number}. Please provide a reason.</p>
            <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason for voiding…" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!voidReason || voidLc.isPending}
              onClick={() => voidLc.mutate(
                { id: lc.id, reason: voidReason },
                {
                  onSuccess: () => { toast.success('LC voided'); setVoidOpen(false); onClose() },
                  onError: (err) => toast.error(err.message),
                }
              )}
            >
              {voidLc.isPending ? 'Voiding…' : 'Confirm Void'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revert confirm */}
      <Dialog open={revertOpen} onOpenChange={(v) => { if (!v) setRevertOpen(false) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-sm sm:rounded-lg">
          <DialogHeader><DialogTitle>Revert Landed Cost Apply</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will <strong>undo</strong> the LC application for{' '}
              <strong>{lc?.lc_number}</strong>:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>FIFO layer costs restored to pre-apply values</li>
              <li>Average costs recalculated for all affected variants</li>
              <li>Cost-adjustment stock movements deleted</li>
              <li>LC returns to Active status (can be re-applied)</li>
            </ul>
            <p className="text-sm font-medium">
              Selling price changes made after apply are <em>not</em> automatically reversed.
            </p>
            <div className="space-y-1">
              <Label className="text-sm">Type &quot;revert&quot; to confirm</Label>
              <Input
                value={revertConfirmText}
                onChange={(e) => setRevertConfirmText(e.target.value)}
                placeholder="revert"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevertOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={revertConfirmText.toUpperCase() !== 'REVERT' || revertLc.isPending}
              onClick={() =>
                revertLc.mutate(lc!.id, {
                  onSuccess: () => {
                    toast.success('LC reverted — FIFO costs restored')
                    setRevertOpen(false)
                    onClose()
                  },
                  onError: (err) => toast.error(err.message),
                })
              }
            >
              {revertLc.isPending ? 'Reverting…' : 'Confirm Revert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-apply price review */}
      <PriceReviewDialog
        open={priceReviewOpen}
        allocations={priceReviewAllocations}
        onDone={() => { setPriceReviewOpen(false); onClose() }}
      />
    </>
  )
}

// ─── Create LC Dialog ─────────────────────────────────────────────────────────

function CreateLcDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createLc = useCreateLandedCost()
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [currency, setCurrency] = useState('QAR')
  const [lines, setLines] = useState<LandedCostLine[]>([{ description: '', amount: 0, currency: 'QAR', exchange_rate: 1 }])
  const [selectedReceivalIds, setSelectedReceivalIds] = useState<string[]>([])
  const [receivalSearch, setReceivalSearch] = useState('')
  const [expandedReceivalId, setExpandedReceivalId] = useState<string | null>(null)
  const [uploadingLines, setUploadingLines] = useState<Set<number>>(new Set())
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const { data: receivals } = useReceivalsForLcSelector({ search: receivalSearch })
  const { data: expandedItems, isLoading: loadingExpanded } = useReceivalItemsWithFifo(expandedReceivalId)

  function addLine() { setLines((l) => [...l, { description: '', amount: 0, currency: 'QAR', exchange_rate: 1 }]) }
  function removeLine(i: number) { setLines((l) => l.filter((_, idx) => idx !== i)) }
  function updateLine(i: number, k: keyof LandedCostLine, v: string | number) {
    setLines((l) => l.map((line, idx) => {
      if (idx !== i) return line
      const updated = { ...line, [k]: v }
      if (k === 'currency' && v === 'QAR') updated.exchange_rate = 1
      return updated
    }))
  }
  function toggleReceival(id: string) {
    setSelectedReceivalIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  }

  const total = lines
    .reduce(
      (s, l) => s.plus(new Decimal(l.amount || 0).times(l.exchange_rate || 1)),
      new Decimal(0),
    )
    .toNumber()

  async function handleBillUpload(lineIndex: number, file: File | undefined) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large — maximum 5 MB')
      return
    }
    setUploadingLines((prev) => new Set(prev).add(lineIndex))
    try {
      const supabase = createClient()
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${year}/${month}/${Date.now()}-${sanitized}`
      const oldPath = lines[lineIndex]?.bill_path
      if (oldPath) {
        await supabase.storage.from('lc-bills').remove([oldPath])
      }
      const { error } = await supabase.storage.from('lc-bills').upload(path, file)
      if (error) throw error
      setLines((l) =>
        l.map((line, idx) => (idx === lineIndex ? { ...line, bill_path: path } : line)),
      )
    } catch (err: unknown) {
      toast.error(`Upload failed: ${(err as Error).message}`)
    } finally {
      setUploadingLines((prev) => {
        const s = new Set(prev)
        s.delete(lineIndex)
        return s
      })
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) { toast.error('Date is required'); return }
    if (lines.some((l) => !l.description)) { toast.error('All cost lines need a description'); return }
    if (uploadingLines.size > 0) { toast.error('Wait for all bill uploads to finish'); return }
    createLc.mutate(
      {
        description: description || null,
        date,
        currency,
        lines,
        attached_receival_ids: selectedReceivalIds,
        attached_po_ids: [],
      },
      {
        onSuccess: () => {
          toast.success('Landed cost created')
          onOpenChange(false)
          setDescription(''); setDate(''); setCurrency('QAR')
          setLines([{ description: '', amount: 0, currency: 'QAR', exchange_rate: 1 }])
          setSelectedReceivalIds([])
          setReceivalSearch('')
          setExpandedReceivalId(null)
          setUploadingLines(new Set())
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg">
        <DialogHeader><DialogTitle>Create Landed Cost</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Freight, customs fees…" />
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Cost Lines */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Cost Lines</p>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-4">
                  <Input
                    placeholder="Description (e.g. Air freight)"
                    value={line.description}
                    onChange={(e) => updateLine(i, 'description', e.target.value)}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    type="number" min={0} step="0.01"
                    placeholder="Amount"
                    value={line.amount}
                    onChange={(e) => updateLine(i, 'amount', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="col-span-2">
                  <select
                    value={line.currency}
                    onChange={(e) => updateLine(i, 'currency', e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    {['QAR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'KWD'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {line.currency !== 'QAR' ? (
                  <div className="col-span-1">
                    <Input
                      type="number" min={0} step="0.0001"
                      placeholder="Rate"
                      title="Exchange rate to QAR"
                      value={line.exchange_rate || ''}
                      onChange={(e) => updateLine(i, 'exchange_rate', parseFloat(e.target.value) || 1)}
                    />
                  </div>
                ) : (
                  <div className="col-span-1" />
                )}
                <div className="col-span-2 flex items-center gap-1 pt-0.5">
                  {/* Hidden file input — accessed via ref */}
                  <input
                    ref={(el) => { fileInputRefs.current[i] = el }}
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => handleBillUpload(i, e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    title={line.bill_path ? 'Bill attached — click to replace' : 'Attach bill document (PDF or image, max 5 MB)'}
                    disabled={uploadingLines.has(i)}
                    onClick={() => fileInputRefs.current[i]?.click()}
                    className={cn(
                      'flex items-center justify-center h-8 w-8 rounded border text-sm transition-colors shrink-0',
                      line.bill_path
                        ? 'border-green-400 text-green-600 bg-green-50 hover:bg-green-100'
                        : 'border-input text-muted-foreground hover:text-foreground hover:bg-accent',
                      uploadingLines.has(i) && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {uploadingLines.has(i)
                      ? <span className="text-xs animate-pulse">…</span>
                      : <Paperclip className="h-3.5 w-3.5" />}
                  </button>
                  {line.currency !== 'QAR' && (line.exchange_rate ?? 0) > 0 && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      ={new Decimal(line.amount || 0).times(line.exchange_rate || 1).toFixed(2)} QAR
                    </span>
                  )}
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeLine(i)}
                    disabled={lines.length === 1}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> Add Cost Line
              </Button>
              <p className="text-sm font-semibold">Total (QAR): {formatCurrency(total, 'QAR')}</p>
            </div>
          </div>

          <Separator />

          {/* Receival Selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Attach Receivals</p>
            <Input
              placeholder="Search by receival number…"
              value={receivalSearch}
              onChange={(e) => setReceivalSearch(e.target.value)}
              className="h-8 text-sm"
            />
            {(receivals ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {receivalSearch ? 'No receivals match your search' : 'No receivals found'}
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                {(receivals ?? []).map((r) => {
                  const isExpanded = expandedReceivalId === r.id
                  const isChecked = selectedReceivalIds.includes(r.id)
                  return (
                    <div key={r.id}>
                      {/* Row header */}
                      <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleReceival(r.id)}
                          className="h-4 w-4 shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => setExpandedReceivalId(isExpanded ? null : r.id)}
                          className="flex items-center gap-1.5 flex-1 text-left text-sm min-w-0"
                        >
                          <span className="text-muted-foreground w-4 shrink-0">
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5" />
                              : <ChevronRight className="h-3.5 w-3.5" />}
                          </span>
                          <span className="font-mono shrink-0">{r.receival_number}</span>
                          <span className="text-muted-foreground truncate">
                            — {r.supplier_name ?? 'Unknown'} · {formatDate(r.date)}
                          </span>
                        </button>
                      </div>

                      {/* Expanded items */}
                      {isExpanded && (
                        <div className="bg-muted/30 px-4 pb-2">
                          {loadingExpanded ? (
                            <div className="space-y-1 pt-2">
                              {[1, 2].map((n) => <div key={n} className="h-5 rounded bg-muted animate-pulse" />)}
                            </div>
                          ) : (expandedItems ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground pt-2">No billable items</p>
                          ) : (
                            <table className="w-full text-xs mt-2">
                              <thead>
                                <tr className="text-muted-foreground border-b">
                                  <th className="text-left py-1 font-medium">Item</th>
                                  <th className="text-right py-1 font-medium">Received</th>
                                  <th className="text-right py-1 font-medium">Remaining</th>
                                  <th className="text-right py-1 font-medium">Unit Cost</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(expandedItems ?? []).map((item) => (
                                  <tr key={item.id} className="border-b last:border-0">
                                    <td className="py-1 pr-2">{item.item_name}</td>
                                    <td className="text-right py-1">{item.qty_received}</td>
                                    <td className={cn('text-right py-1 font-medium', item.remaining_qty === 0 && 'text-amber-600')}>
                                      {item.remaining_qty}
                                    </td>
                                    <td className="text-right py-1">{formatCurrency(item.unit_cost, 'QAR')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createLc.isPending || uploadingLines.size > 0}>
              {createLc.isPending ? 'Creating…' : uploadingLines.size > 0 ? 'Uploading…' : 'Create Landed Cost'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LandedCostsPage() {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<LandedCost | null>(null)

  const { data: landedCosts, isLoading } = useLandedCosts({ search })

  const columns: ColumnDef<LandedCost>[] = [
    {
      accessorKey: 'lc_number',
      header: 'LC #',
      cell: ({ row }) => <span className="font-mono font-medium text-sm">{row.original.lc_number}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className="text-sm">{row.original.description ?? '—'}</span>,
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => <span className="text-sm">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'total_amount',
      header: 'Total',
      cell: ({ row }) => <span className="text-sm font-medium">{formatCurrency(row.original.total_amount, row.original.currency)}</span>,
    },
    {
      id: 'receivals',
      header: 'Receivals',
      cell: ({ row }) => <span className="text-sm">{row.original.attached_receival_ids?.length ?? 0}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const lc = row.original
        if (lc.voided_at) return <Badge variant="destructive">Voided</Badge>
        if (lc.applied_at) return <Badge className="bg-green-100 text-green-800 border-green-200">Applied</Badge>
        return <Badge variant="outline">Active</Badge>
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="View landed cost" onClick={() => setSelected(row.original)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <PageWrapper>
      <PageHeader
        title="Landed Costs"
        description="Allocate freight, customs and other costs to received goods"
        action={{ label: '+ Create Landed Cost', onClick: () => setCreateOpen(true) }}
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Search LC number or description…" />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
      ) : (
        <DataTable columns={columns} data={landedCosts ?? []} />
      )}

      <CreateLcDialog open={createOpen} onOpenChange={setCreateOpen} />
      <LcDetailDialog lc={selected} onClose={() => setSelected(null)} />
    </PageWrapper>
  )
}
