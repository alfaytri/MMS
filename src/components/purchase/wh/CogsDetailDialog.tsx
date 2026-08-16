'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Loader2, ShoppingCart, Truck, Package2 } from 'lucide-react'
import { format } from 'date-fns'
import { brandOriginText } from '@/lib/inventory/variantPickerLabel'

// COGS entries are stored in QAR (post-Section-10 FX pipeline). Prefix so
// the user can never mistake the number for another currency.
const fmtVal = (n: number) =>
  `QAR ${n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface CogsEntry {
  id: string
  qty: number
  unit_cost: number
  total_cost: number
  date: string
  notes: string | null
  source_type: 'sale' | 'sale_return' | 'consumption' | 'landed_cost' | 'landed_cost_reversal'
  sale_delivery_id: string | null
  sale_order_id: string | null
  landed_cost_id: string | null
  delivery_number: string | null
  so_number: string | null
  customer_name: string | null
  lc_number: string | null
  lc_applied_at: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  brandVariantId: string
  itemName: string
  brand: string | null
  origin: string | null
  sku: string | null
}

function useCogsDetail(brandVariantId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.inventory.cogsBreakdown(brandVariantId), 'detail'],
    enabled,
    queryFn: async (): Promise<CogsEntry[]> => {
      const supabase = createClient()

      // 1. Fetch cogs entries (landed_costs has FK, so that join works)
      const { data: raw, error } = await supabase
        .from('cogs_entries')
        .select(`
          id, qty, unit_cost, total_cost, date, notes, source_type,
          sale_delivery_id, sale_order_id, landed_cost_id,
          landed_costs(lc_number, applied_at)
        `)
        .eq('brand_variant_id', brandVariantId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      if (!raw || raw.length === 0) return []

      const entries = raw as Record<string, unknown>[]

      // 2. Collect unique sale_delivery_ids and sale_order_ids for batch lookup
      const deliveryIds = [...new Set(entries.map((e) => e.sale_delivery_id as string).filter(Boolean))]
      const orderIds = [...new Set(entries.map((e) => e.sale_order_id as string).filter(Boolean))]

      // 3. Batch-fetch sale_deliveries
      const deliveryMap = new Map<string, string>()
      if (deliveryIds.length > 0) {
        const { data: deliveries } = await supabase
          .from('sale_deliveries')
          .select('id, delivery_number')
          .in('id', deliveryIds)
        for (const d of (deliveries ?? []) as { id: string; delivery_number: string }[]) {
          deliveryMap.set(d.id, d.delivery_number)
        }
      }

      // 4. Batch-fetch sale_orders + customer names
      const orderMap = new Map<string, { so_number: string; customer_name: string | null }>()
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from('sale_orders')
          .select('id, so_number, customers(name)')
          .in('id', orderIds)
        for (const o of (orders ?? []) as Record<string, unknown>[]) {
          const cust = o.customers as { name: string } | null
          orderMap.set(o.id as string, {
            so_number: o.so_number as string,
            customer_name: cust?.name ?? null,
          })
        }
      }

      // 5. Map results
      return entries.map((r) => {
        const lc = r.landed_costs as { lc_number: string; applied_at: string | null } | null
        const soInfo = orderMap.get(r.sale_order_id as string)
        return {
          id: r.id as string,
          qty: r.qty as number,
          unit_cost: r.unit_cost as number,
          total_cost: r.total_cost as number,
          date: r.date as string,
          notes: r.notes as string | null,
          source_type: (r.source_type as CogsEntry['source_type']) ?? 'sale',
          sale_delivery_id: r.sale_delivery_id as string | null,
          sale_order_id: r.sale_order_id as string | null,
          landed_cost_id: r.landed_cost_id as string | null,
          delivery_number: deliveryMap.get(r.sale_delivery_id as string) ?? null,
          so_number: soInfo?.so_number ?? null,
          customer_name: soInfo?.customer_name ?? null,
          lc_number: lc?.lc_number ?? null,
          lc_applied_at: lc?.applied_at ?? null,
        }
      })
    },
    staleTime: 60 * 1000,
  })
}

export function CogsDetailDialog({ open, onClose, brandVariantId, itemName, brand, origin, sku }: Props) {
  const { data: entries = [], isLoading } = useCogsDetail(brandVariantId, open)

  const saleEntries = entries.filter((e) => e.source_type === 'sale')
  const saleReturnEntries = entries.filter((e) => e.source_type === 'sale_return')
  const consumptionEntries = entries.filter((e) => e.source_type === 'consumption')
  const lcEntries = entries.filter((e) => e.source_type === 'landed_cost')
  const lcReversalEntries = entries.filter((e) => e.source_type === 'landed_cost_reversal')

  const saleCostTotal = saleEntries.reduce((s, e) => s + e.total_cost, 0)
  const saleReturnTotal = saleReturnEntries.reduce((s, e) => s + e.total_cost, 0)
  const consumptionTotal = consumptionEntries.reduce((s, e) => s + e.total_cost, 0)
  const lcCostTotal = lcEntries.reduce((s, e) => s + e.total_cost, 0)
  const lcReversalTotal = lcReversalEntries.reduce((s, e) => s + e.total_cost, 0)
  // Total reconciles with the Stock Value COGS column, which counts ALL cost that
  // left this variant's stock: customer sales + sale-returns + internal
  // consumption + net landed-cost adjustments.
  const grandTotal = saleCostTotal + saleReturnTotal + consumptionTotal + lcCostTotal + lcReversalTotal
  const variantLabel = brandOriginText(brand, origin)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-3xl sm:rounded-xl max-h-[100vh] sm:max-h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b shrink-0">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Package2 className="h-4 w-4 text-primary" />
            COGS Breakdown
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {itemName}
            {variantLabel && <span className="text-foreground font-medium"> — {variantLabel}</span>}
            {sku && sku !== itemName && <span className="text-primary ml-1.5">{sku}</span>}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading COGS data...
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              No COGS entries found for this item.
            </div>
          ) : (
            <>
              {/* Summary cards — shown only for the cost types this item actually has */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {saleEntries.length > 0 && (
                  <div className="rounded-lg border px-4 py-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Sale COGS</p>
                    <p className="text-base font-bold tabular-nums mt-1 text-destructive">{fmtVal(saleCostTotal)}</p>
                  </div>
                )}
                {saleReturnEntries.length > 0 && (
                  <div className="rounded-lg border px-4 py-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Sale Returns</p>
                    <p className="text-base font-bold tabular-nums mt-1 text-green-600 dark:text-green-400">{fmtVal(saleReturnTotal)}</p>
                  </div>
                )}
                {consumptionEntries.length > 0 && (
                  <div className="rounded-lg border px-4 py-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Consumption</p>
                    <p className="text-base font-bold tabular-nums mt-1 text-blue-600 dark:text-blue-400">{fmtVal(consumptionTotal)}</p>
                  </div>
                )}
                {lcEntries.length > 0 && (
                  <div className="rounded-lg border px-4 py-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">LC Adjustments</p>
                    <p className="text-base font-bold tabular-nums mt-1 text-orange-600 dark:text-orange-400">{fmtVal(lcCostTotal)}</p>
                  </div>
                )}
                {lcReversalEntries.length > 0 && (
                  <div className="rounded-lg border px-4 py-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">LC Reversals</p>
                    <p className="text-base font-bold tabular-nums mt-1 text-green-600 dark:text-green-400">{fmtVal(lcReversalTotal)}</p>
                  </div>
                )}
                <div className="rounded-lg border px-4 py-3 text-center bg-muted/30">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Total COGS</p>
                  <p className="text-base font-bold tabular-nums mt-1 text-destructive">{fmtVal(grandTotal)}</p>
                </div>
              </div>

              {/* Sale entries table */}
              {saleEntries.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Sale Deliveries ({saleEntries.length})
                    </p>
                  </div>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-[10px] py-1.5">Date</TableHead>
                          <TableHead className="text-[10px] py-1.5">SO #</TableHead>
                          <TableHead className="text-[10px] py-1.5">Delivery #</TableHead>
                          <TableHead className="text-[10px] py-1.5">Customer</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Qty</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Unit Cost</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Total Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {saleEntries.map((e) => (
                          <TableRow key={e.id} className="hover:bg-muted/10">
                            <TableCell className="text-[11px] py-1.5">
                              {format(new Date(e.date), 'dd MMM yy')}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5 font-medium text-primary">
                              {e.so_number ?? '—'}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5">
                              <div className="flex items-center gap-1">
                                <Truck className="h-3 w-3 text-muted-foreground" />
                                {e.delivery_number ?? '—'}
                              </div>
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5 max-w-[150px] truncate">
                              {e.customer_name ?? '—'}
                            </TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">{e.qty}</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">{fmtVal(e.unit_cost)}</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums font-medium text-destructive">
                              {fmtVal(e.total_cost)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {saleEntries.length > 1 && (
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell colSpan={4} className="text-[11px] py-1.5">Total</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">
                              {saleEntries.reduce((s, e) => s + e.qty, 0)}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5" />
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums text-destructive">
                              {fmtVal(saleCostTotal)}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Sale return entries (goods returned — credits COGS back) */}
              {saleReturnEntries.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[9px] font-normal border-green-300 text-green-600 dark:text-green-400">RET</Badge>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Sale Returns ({saleReturnEntries.length})
                    </p>
                  </div>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-[10px] py-1.5">Date</TableHead>
                          <TableHead className="text-[10px] py-1.5">SO #</TableHead>
                          <TableHead className="text-[10px] py-1.5">Delivery #</TableHead>
                          <TableHead className="text-[10px] py-1.5">Customer</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Qty</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Unit Cost</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Total Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {saleReturnEntries.map((e) => (
                          <TableRow key={e.id} className="hover:bg-muted/10">
                            <TableCell className="text-[11px] py-1.5">{format(new Date(e.date), 'dd MMM yy')}</TableCell>
                            <TableCell className="text-[11px] py-1.5 font-medium text-primary">{e.so_number ?? '—'}</TableCell>
                            <TableCell className="text-[11px] py-1.5">
                              <div className="flex items-center gap-1">
                                <Truck className="h-3 w-3 text-muted-foreground" />
                                {e.delivery_number ?? '—'}
                              </div>
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5 max-w-[150px] truncate">{e.customer_name ?? '—'}</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">{e.qty}</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">{fmtVal(e.unit_cost)}</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums font-medium text-green-600 dark:text-green-400">{fmtVal(e.total_cost)}</TableCell>
                          </TableRow>
                        ))}
                        {saleReturnEntries.length > 1 && (
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell colSpan={4} className="text-[11px] py-1.5">Total</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">
                              {saleReturnEntries.reduce((s, e) => s + e.qty, 0)}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5" />
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums text-green-600 dark:text-green-400">
                              {fmtVal(saleReturnTotal)}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Consumption entries — internal use, not a customer sale */}
              {consumptionEntries.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[9px] font-normal border-blue-300 text-blue-600 dark:text-blue-400">USE</Badge>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Consumption — internal use ({consumptionEntries.length})
                    </p>
                  </div>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-[10px] py-1.5">Date</TableHead>
                          <TableHead className="text-[10px] py-1.5">Notes</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Qty</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Unit Cost</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Total Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {consumptionEntries.map((e) => (
                          <TableRow key={e.id} className="hover:bg-muted/10">
                            <TableCell className="text-[11px] py-1.5">{format(new Date(e.date), 'dd MMM yy')}</TableCell>
                            <TableCell className="text-[11px] py-1.5 max-w-[220px] truncate text-muted-foreground">{e.notes ?? '—'}</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">{e.qty}</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">{fmtVal(e.unit_cost)}</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums font-medium text-blue-600 dark:text-blue-400">{fmtVal(e.total_cost)}</TableCell>
                          </TableRow>
                        ))}
                        {consumptionEntries.length > 1 && (
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell colSpan={2} className="text-[11px] py-1.5">Total</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">
                              {consumptionEntries.reduce((s, e) => s + e.qty, 0)}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5" />
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums text-blue-600 dark:text-blue-400">
                              {fmtVal(consumptionTotal)}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* LC adjustment entries */}
              {lcEntries.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[9px] font-normal border-orange-300 text-orange-600 dark:text-orange-400">LC</Badge>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Landed Cost Adjustments ({lcEntries.length})
                    </p>
                  </div>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-[10px] py-1.5">Date</TableHead>
                          <TableHead className="text-[10px] py-1.5">LC #</TableHead>
                          <TableHead className="text-[10px] py-1.5">Applied</TableHead>
                          <TableHead className="text-[10px] py-1.5">Notes</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Qty</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Unit Cost</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Total Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lcEntries.map((e) => (
                          <TableRow key={e.id} className="hover:bg-muted/10">
                            <TableCell className="text-[11px] py-1.5">
                              {format(new Date(e.date), 'dd MMM yy')}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5 font-medium text-primary">
                              {e.lc_number ?? '—'}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5">
                              {e.lc_applied_at ? format(new Date(e.lc_applied_at), 'dd MMM yy') : '—'}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5 max-w-[150px] truncate text-muted-foreground">
                              {e.notes ?? '—'}
                            </TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">{e.qty}</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">{fmtVal(e.unit_cost)}</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums font-medium text-orange-600 dark:text-orange-400">
                              +{fmtVal(e.total_cost)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {lcEntries.length > 1 && (
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell colSpan={4} className="text-[11px] py-1.5">Total</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">
                              {lcEntries.reduce((s, e) => s + e.qty, 0)}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5" />
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums text-orange-600 dark:text-orange-400">
                              +{fmtVal(lcCostTotal)}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* LC reversal entries */}
              {lcReversalEntries.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[9px] font-normal border-green-300 text-green-600 dark:text-green-400">REV</Badge>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      LC Reversals ({lcReversalEntries.length})
                    </p>
                  </div>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-[10px] py-1.5">Date</TableHead>
                          <TableHead className="text-[10px] py-1.5">LC #</TableHead>
                          <TableHead className="text-[10px] py-1.5">Notes</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Qty</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Unit Cost</TableHead>
                          <TableHead className="text-[10px] text-right py-1.5">Total Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lcReversalEntries.map((e) => (
                          <TableRow key={e.id} className="hover:bg-muted/10">
                            <TableCell className="text-[11px] py-1.5">
                              {format(new Date(e.date), 'dd MMM yy')}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5 font-medium text-primary">
                              {e.lc_number ?? '—'}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5 max-w-[200px] truncate text-muted-foreground">
                              {e.notes ?? '—'}
                            </TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">{e.qty}</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">{fmtVal(e.unit_cost)}</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums font-medium text-green-600 dark:text-green-400">
                              {fmtVal(e.total_cost)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {lcReversalEntries.length > 1 && (
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell colSpan={3} className="text-[11px] py-1.5">Total</TableCell>
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums">
                              {lcReversalEntries.reduce((s, e) => s + e.qty, 0)}
                            </TableCell>
                            <TableCell className="text-[11px] py-1.5" />
                            <TableCell className="text-[11px] text-right py-1.5 tabular-nums text-green-600 dark:text-green-400">
                              {fmtVal(lcReversalTotal)}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
