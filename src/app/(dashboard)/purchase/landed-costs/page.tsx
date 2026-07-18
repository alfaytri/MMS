'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { LcCogsPostedPanel } from '@/components/landed-costs/LcCogsPostedPanel'
import { toast } from 'sonner'
import { Eye, Plus, Trash2, Paperclip, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { InfoPopover } from '@/components/shared/InfoPopover'
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
  useRevertLandedCost, useValidateLcAllocation, useBillSignedUrls, useLcUsedReceivalMap,
  type LandedCost, type LandedCostLineInput,
} from '@/hooks/useLandedCosts'
import {
  useReceivalsForLcSelector, useReceivalItemsWithFifo, useReceivalItemsBatch,
} from '@/hooks/useReceivals'
import type { ColumnDef } from '@tanstack/react-table'
import { queryKeys } from '@/lib/queryKeys'

// ─── Local hooks for detail dialog ───────────────────────────────────────────

function useAttachedReceivals(receivalIds: string[]) {
  return useQuery({
    queryKey: queryKeys.lcAttached.receivals(receivalIds.slice().sort().join(',')),
    enabled: receivalIds.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('receivals')
        .select('id, receival_number, date, source_type, purchase_orders!receivals_po_id_fkey(supplier_name)')
        .in('id', receivalIds)
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r: any) => {
        const isInventory = r.source_type === 'inventory'
        return {
          id: r.id as string,
          receival_number: r.receival_number as string,
          date: r.date as string,
          supplier_name: (r.purchase_orders?.supplier_name ?? (isInventory ? 'Inventory Receival' : 'Unknown')) as string,
        }
      })
    },
    staleTime: 2 * 60 * 1000,
  })
}

function useAttachedPOs(poIds: string[]) {
  return useQuery({
    queryKey: queryKeys.lcAttached.pos(poIds.slice().sort().join(',')),
    enabled: poIds.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, supplier_name')
        .in('id', poIds)
      if (error) throw error
      return (data ?? []) as Array<{ id: string; po_number: string; supplier_name: string }>
    },
    staleTime: 5 * 60 * 1000,
  })
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
  const billPaths = (lc?.landed_cost_lines ?? []).map((l) => l.bill_path)
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

  // For the Apply preview: pull every billable item across the attached
  // receivals so we can show how much landed-cost value will land on each.
  // Allocation is proportional to (qty_received × unit_cost), same as the
  // server-side allocate_landed_cost RPC.
  const { data: previewItems, isLoading: loadingPreview } = useReceivalItemsBatch(
    applyOpen && lc ? lc.attached_receival_ids : null,
  )
  const previewTotalValueShare = (previewItems ?? []).reduce(
    (sum, item) => sum + item.qty_received * item.unit_cost,
    0,
  )
  // Map brand_variant_id → unit_cost so we can compute per-unit LC for each
  // validation row (validation RPC returns variant-level rollups, not
  // receival_items rows). For variants split across multiple receivals we
  // weight by qty_received.
  const previewLcPerUnitByVariant = (() => {
    const map = new Map<string, number>()
    if (!lc || previewTotalValueShare <= 0) return map
    // group items by variant
    const grouped = new Map<string, { totalQty: number; totalValueShare: number }>()
    for (const it of previewItems ?? []) {
      if (!it.brand_variant_id) continue
      const g = grouped.get(it.brand_variant_id) ?? { totalQty: 0, totalValueShare: 0 }
      g.totalQty += it.qty_received
      g.totalValueShare += it.qty_received * it.unit_cost
      grouped.set(it.brand_variant_id, g)
    }
    for (const [bvId, g] of grouped.entries()) {
      const lcValue = lc.total_amount * (g.totalValueShare / previewTotalValueShare)
      map.set(bvId, g.totalQty > 0 ? lcValue / g.totalQty : 0)
    }
    return map
  })()

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
                <Badge className="bg-muted text-foreground border-border text-xs">
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
                    {(lc.landed_cost_lines ?? []).map((line, i) => (
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
            {(lc.landed_cost_item_allocations ?? []).length > 0 && (
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
                      {(lc.landed_cost_item_allocations ?? []).map((alloc, i) => (
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

                {/* COGS Posted (LC-after-sale adjustments) */}
                <LcCogsPostedPanel
                  allocations={lc.landed_cost_item_allocations as never}
                  currency={lc.currency}
                  appliedAt={lc.applied_at}
                />
          </div>

          {!isVoided && !isApplied && (
            <DialogFooter className="gap-2">
              <Button variant="destructive" size="sm" className="min-h-11 md:min-h-0" onClick={() => setVoidOpen(true)}>
                Void LC
              </Button>
              <Button
                size="sm"
                className="min-h-11 md:min-h-0"
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
                className="min-h-11 md:min-h-0 text-destructive border-destructive hover:bg-destructive/10"
                onClick={() => { setRevertConfirmText(''); setRevertOpen(true) }}
              >
                Revert Apply
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Apply confirm — shows pre-flight validation + value-impact preview */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="w-full max-w-full h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:max-w-2xl sm:rounded-lg flex flex-col p-0">
          {lc && (
            <>
              <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
                <DialogTitle>Apply Landed Cost to Inventory</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 px-6 pb-2 overflow-y-auto flex-1">
                {/* Value-impact banner */}
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-1">
                  <p className="text-xs uppercase tracking-wider text-blue-700 font-semibold">
                    Inventory value to be added
                  </p>
                  <p className="text-xl font-bold text-blue-900">
                    +{formatCurrency(lc.total_amount, lc.currency)}
                  </p>
                  <p className="text-xs text-blue-700">
                    across <strong>{(validationItems ?? []).length}</strong> item{(validationItems ?? []).length !== 1 ? 's' : ''}
                    {' '}in <strong>{lc.attached_receival_ids.length}</strong> receival{lc.attached_receival_ids.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  This will distribute the amount across FIFO layers proportionally to each item&apos;s value share
                  ({'qty × unit cost'}), and update average costs. You can revert this later using the Revert Apply button.
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
                          <TableHead className="text-right">+LC / unit</TableHead>
                          <TableHead className="text-right">+Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(validationItems ?? []).map((item, idx) => {
                          const lcPerUnit = previewLcPerUnitByVariant.get(item.brand_variant_id) ?? 0
                          const totalAdded = lcPerUnit * item.qty_received
                          return (
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
                              <TableCell className="text-right text-sm text-blue-700 tabular-nums whitespace-nowrap">
                                {loadingPreview
                                  ? <span className="text-muted-foreground">…</span>
                                  : `+${formatCurrency(lcPerUnit, lc.currency)}`}
                              </TableCell>
                              <TableCell className="text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                                {loadingPreview
                                  ? <span className="text-muted-foreground">…</span>
                                  : `+${formatCurrency(totalAdded, lc.currency)}`}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>
              <DialogFooter className="mx-0 mb-0 px-6 pb-6 pt-2 border-t shrink-0">
                <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
                <Button
                  disabled={applyLc.isPending || validating}
                  onClick={() =>
                    applyLc.mutate(lc.id, {
                      onSuccess: () => {
                        toast.success('Landed cost applied to inventory')
                        setApplyOpen(false)
                        onClose()
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
              <Label htmlFor="lc-revert-confirm" className="text-sm">Type &quot;revert&quot; to confirm</Label>
              <Input
                id="lc-revert-confirm"
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
    </>
  )
}

// ─── Create LC Dialog ─────────────────────────────────────────────────────────

function CreateLcDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createLc = useCreateLandedCost()
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [currency, setCurrency] = useState('QAR')
  const [lines, setLines] = useState<LandedCostLineInput[]>([{ description: '', amount: 0, currency: 'QAR', exchange_rate: 1 }])
  const [selectedReceivalIds, setSelectedReceivalIds] = useState<string[]>([])
  const [receivalSearch, setReceivalSearch] = useState('')
  const [expandedReceivalId, setExpandedReceivalId] = useState<string | null>(null)
  const [collapsedPoIds, setCollapsedPoIds] = useState<Set<string>>(new Set())
  const [uploadingLines, setUploadingLines] = useState<Set<number>>(new Set())
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const { data: receivals } = useReceivalsForLcSelector({ search: receivalSearch })
  const { data: expandedItems, isLoading: loadingExpanded } = useReceivalItemsWithFifo(expandedReceivalId)
  const { data: usedReceivalMap } = useLcUsedReceivalMap()

  // Group receivals under their PO so the user sees one card per PO with
  // its child receivals nested below.
  const poGroups = (() => {
    const map = new Map<string, {
      po_id: string
      po_number: string
      supplier_name: string
      receivals: NonNullable<typeof receivals>
    }>()
    for (const r of receivals ?? []) {
      const key = r.po_id ?? `__inv_${r.id}`
      if (!map.has(key)) {
        const isInventory = !r.po_id || r.source_type === 'inventory'
        map.set(key, {
          po_id: key,
          po_number: r.po_number ?? (isInventory ? 'INV' : '—'),
          supplier_name: r.supplier_name ?? (isInventory ? 'Inventory Receival' : 'Unknown'),
          receivals: [],
        })
      }
      map.get(key)!.receivals.push(r)
    }
    return Array.from(map.values()).sort((a, b) => a.po_number.localeCompare(b.po_number))
  })()

  function addLine() { setLines((l) => [...l, { description: '', amount: 0, currency: 'QAR', exchange_rate: 1 }]) }
  function removeLine(i: number) { setLines((l) => l.filter((_, idx) => idx !== i)) }
  function updateLine(i: number, k: keyof LandedCostLineInput, v: string | number) {
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
  function togglePoCollapsed(poId: string) {
    setCollapsedPoIds((prev) => {
      const next = new Set(prev)
      if (next.has(poId)) next.delete(poId)
      else next.add(poId)
      return next
    })
  }
  function togglePoSelectAll(group: { receivals: { id: string }[] }) {
    const ids = group.receivals.map((r) => r.id)
    const allSelected = ids.every((id) => selectedReceivalIds.includes(id))
    setSelectedReceivalIds((prev) => {
      if (allSelected) {
        // Deselect all in this PO
        return prev.filter((id) => !ids.includes(id))
      }
      // Select all in this PO (without duplicating)
      const set = new Set(prev)
      ids.forEach((id) => set.add(id))
      return Array.from(set)
    })
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
          setCollapsedPoIds(new Set())
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
              <Label htmlFor="lc-description">Description</Label>
              <Input id="lc-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Freight, customs fees…" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lc-date">Date *</Label>
              <Input id="lc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
                      'flex items-center justify-center h-8 w-8 min-h-11 md:min-h-0 min-w-11 md:min-w-0 rounded border text-sm transition-colors shrink-0',
                      line.bill_path
                        ? 'border-green-400 text-success bg-success/10 hover:bg-green-100'
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
                    className="h-8 w-8 min-h-11 md:min-h-0 min-w-11 md:min-w-0 text-muted-foreground hover:text-destructive shrink-0"
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
              <Button type="button" variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> Add Cost Line
              </Button>
              <p className="text-sm font-semibold">Total (QAR): {formatCurrency(total, 'QAR')}</p>
            </div>
          </div>

          <Separator />

          {/* Receival Selector — grouped by PO */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <p className="text-sm font-medium">Attach Receivals</p>
              <p className="text-xs text-muted-foreground">
                {selectedReceivalIds.length > 0
                  ? `${selectedReceivalIds.length} selected`
                  : 'None selected'}
              </p>
            </div>
            <Input
              placeholder="Search PO #, Receival #, or supplier…"
              value={receivalSearch}
              onChange={(e) => setReceivalSearch(e.target.value)}
              className="h-8 text-sm"
            />
            {poGroups.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                {receivalSearch ? 'No receivals match your search' : 'No receivals found'}
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                {poGroups.map((group) => {
                  const ids = group.receivals.map((r) => r.id)
                  const selectedInGroup = ids.filter((id) => selectedReceivalIds.includes(id)).length
                  const allChecked = selectedInGroup === ids.length
                  const someChecked = selectedInGroup > 0 && selectedInGroup < ids.length
                  const collapsed = collapsedPoIds.has(group.po_id)

                  return (
                    <div key={group.po_id} className="bg-card">
                      {/* PO header */}
                      <div className="flex items-center gap-2 px-2 py-2 bg-muted/40 sticky top-0 z-10">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={(el) => { if (el) el.indeterminate = someChecked }}
                          onChange={() => togglePoSelectAll(group)}
                          className="h-4 w-4 shrink-0"
                          aria-label={`Select all receivals in ${group.po_number}`}
                        />
                        <button
                          type="button"
                          onClick={() => togglePoCollapsed(group.po_id)}
                          className="flex items-center gap-1.5 flex-1 text-left text-sm min-w-0"
                        >
                          <span className="text-muted-foreground w-4 shrink-0">
                            {collapsed
                              ? <ChevronRight className="h-3.5 w-3.5" />
                              : <ChevronDown className="h-3.5 w-3.5" />}
                          </span>
                          <span className="font-mono font-semibold shrink-0 text-blue-700">{group.po_number}</span>
                          <span className="text-muted-foreground truncate">— {group.supplier_name}</span>
                          <Badge variant="outline" className="ml-auto text-[10px] shrink-0">
                            {group.receivals.length} receival{group.receivals.length !== 1 ? 's' : ''}
                          </Badge>
                        </button>
                      </div>

                      {/* Receivals inside this PO */}
                      {!collapsed && (
                        <div className="divide-y">
                          {group.receivals.map((r) => {
                            const isExpanded = expandedReceivalId === r.id
                            const isChecked = selectedReceivalIds.includes(r.id)
                            const existingLcs = usedReceivalMap?.get(r.id)
                            const hasExistingLc = (existingLcs?.length ?? 0) > 0
                            return (
                              <div key={r.id}>
                                <div className="flex items-center gap-2 px-2 py-1.5 pl-8 hover:bg-muted/30">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleReceival(r.id)}
                                    className="h-4 w-4 shrink-0"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setExpandedReceivalId(isExpanded ? null : r.id)}
                                    className={cn(
                                      "flex items-center gap-1.5 flex-1 text-left text-sm min-w-0",
                                      hasExistingLc && "opacity-60",
                                    )}
                                  >
                                    <span className="text-muted-foreground w-4 shrink-0">
                                      {isExpanded
                                        ? <ChevronDown className="h-3.5 w-3.5" />
                                        : <ChevronRight className="h-3.5 w-3.5" />}
                                    </span>
                                    <span className={cn("font-mono shrink-0", hasExistingLc && "line-through")}>{r.receival_number}</span>
                                    <span className={cn("text-muted-foreground truncate", hasExistingLc && "line-through")}>· {formatDate(r.date)}</span>
                                    {hasExistingLc && (
                                      <Badge variant="secondary" className="ml-auto text-[10px] shrink-0 bg-amber-100 text-amber-700 border-amber-200">
                                        {existingLcs!.join(', ')}
                                      </Badge>
                                    )}
                                  </button>
                                </div>

                                {/* Expanded items */}
                                {isExpanded && (
                                  <div className="bg-muted/20 px-4 pb-2 pl-12">
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

  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const openId = searchParams?.get('open')
    if (!openId) return
    const lc = landedCosts?.find((row) => row.id === openId)
    if (lc) {
      setSelected(lc)
      router.replace('/purchase/landed-costs', { scroll: false })
    }
  }, [searchParams, landedCosts, router, setSelected])

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
        <Button variant="ghost" size="icon" className="h-8 w-8 min-h-11 md:min-h-0 min-w-11 md:min-w-0" aria-label="View landed cost" onClick={() => setSelected(row.original)}>
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
        titleAfter={
          <InfoPopover title="How Landed Cost is calculated" widthClass="w-[420px]">
            <div className="space-y-2">
              <p className="font-semibold text-foreground">Allocation by value, not quantity</p>
              <p>
                The LC total (freight, customs, clearance, etc.) is split across attached
                receival items in proportion to each item&apos;s total <em>value</em>:
              </p>
              <pre className="bg-muted rounded p-2 text-xs leading-relaxed whitespace-pre-wrap">{`per-item share = LC_total
                  × (qty_received × unit_cost)
                  / Σ(qty_received × unit_cost)`}</pre>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-foreground">Example</p>
              <p>LC total = <strong>$100</strong>, two received items:</p>
              <table className="w-full text-xs border rounded">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-1 text-left">Item</th>
                    <th className="px-2 py-1 text-right">Qty</th>
                    <th className="px-2 py-1 text-right">Unit cost</th>
                    <th className="px-2 py-1 text-right">Value</th>
                    <th className="px-2 py-1 text-right">LC share</th>
                    <th className="px-2 py-1 text-right">Per unit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="px-2 py-1">Widget A</td>
                    <td className="px-2 py-1 text-right">10</td>
                    <td className="px-2 py-1 text-right">$5</td>
                    <td className="px-2 py-1 text-right">$50</td>
                    <td className="px-2 py-1 text-right">$33.33</td>
                    <td className="px-2 py-1 text-right">$3.33</td>
                  </tr>
                  <tr className="border-t">
                    <td className="px-2 py-1">Widget B</td>
                    <td className="px-2 py-1 text-right">5</td>
                    <td className="px-2 py-1 text-right">$20</td>
                    <td className="px-2 py-1 text-right">$100</td>
                    <td className="px-2 py-1 text-right">$66.67</td>
                    <td className="px-2 py-1 text-right">$13.33</td>
                  </tr>
                  <tr className="border-t font-semibold bg-muted/30">
                    <td className="px-2 py-1">Total</td>
                    <td className="px-2 py-1 text-right">—</td>
                    <td className="px-2 py-1 text-right">—</td>
                    <td className="px-2 py-1 text-right">$150</td>
                    <td className="px-2 py-1 text-right">$100.00</td>
                    <td className="px-2 py-1 text-right">—</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground">
                Widget B carries twice the share of Widget A even though it has half the quantity —
                because its total value is twice as large.
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-foreground">Inventory vs COGS split</p>
              <p>
                After the per-item share is known, it&apos;s split based on FIFO inventory at the
                moment LC is applied:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li><strong>Units still in stock</strong> → cost added to inventory (raises avg cost / sell-price guidance)</li>
                <li><strong>Units already sold</strong> → cost posts to <strong>COGS</strong> as a retroactive adjustment (does not change past invoices, only margins)</li>
              </ul>
            </div>

            <div className="space-y-2 border-t pt-3">
              <p className="font-semibold text-foreground">What if the item is already sold out?</p>
              <p>
                If <em>all</em> received units of an item have been sold by the time the LC is
                applied (FIFO layers all empty):
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>Inventory portion = <strong>$0</strong> — there&apos;s no stock left to capitalize cost into.</li>
                <li>COGS portion = <strong>100% of the item&apos;s LC share</strong>.</li>
                <li>The full amount posts as a back-dated COGS adjustment — visible in the
                  &ldquo;LC COGS Postings&rdquo; panel under each landed cost.</li>
                <li>Reported margin for the period of those sales is corrected downward; the
                  customer invoice itself is untouched.</li>
              </ul>
            </div>
          </InfoPopover>
        }
        action={{ label: 'Create Landed Cost', onClick: () => setCreateOpen(true) }}
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Search LC number or description…" />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
      ) : (
        <DataTable columns={columns} data={landedCosts ?? []} emptyState={{ title: 'No landed costs found', description: 'Create a landed cost to allocate freight, customs and other costs to received goods' }} />
      )}

      <CreateLcDialog open={createOpen} onOpenChange={setCreateOpen} />
      <LcDetailDialog lc={selected} onClose={() => setSelected(null)} />
    </PageWrapper>
  )
}
