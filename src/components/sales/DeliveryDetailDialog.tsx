'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import {
  Truck, Calendar, Warehouse, User, Hash, Loader2, Download, ShieldCheck,
} from 'lucide-react'
import { useWarrantyRecordsForDelivery } from '@/hooks/useWarrantyRecordsForDelivery'
import { openWarrantyCertificate } from '@/lib/sales/warranty-certificate'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import type { SaleDelivery } from '@/hooks/useSaleDeliveries'

/** Reads the return + its originating standard delivery so a replacement
 *  delivery can render "Fulfills SR-XXXXX (originally shipped as DEL-YYYYY)". */
function useReplacementSource(returnId: string | null | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['sale-delivery-replacement-source', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('so_po_returns')
        .select('id, return_number, source_delivery_id')
        .eq('id', returnId!)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      let sourceDelivery: { id: string; delivery_number: string } | null = null
      if (data.source_delivery_id) {
        const { data: sd } = await supabase
          .from('sale_deliveries')
          .select('id, delivery_number')
          .eq('id', data.source_delivery_id)
          .maybeSingle()
        sourceDelivery = sd ?? null
      }
      return { return_number: data.return_number, sourceDelivery }
    },
    staleTime: 30_000,
  })
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
  in_progress: { label: 'In Progress', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  delivered:   { label: 'Delivered',   color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  cancelled:   { label: 'Cancelled',   color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
}

function MetaCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none mb-0.5">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  )
}

interface Props {
  delivery: SaleDelivery | null
  onClose: () => void
}

export function DeliveryDetailDialog({ delivery, onClose }: Props) {
  const [pdfBusy, setPdfBusy] = useState(false)
  const [warrantyBusy, setWarrantyBusy] = useState(false)
  const { data: warrantyRecords = [] } = useWarrantyRecordsForDelivery(delivery?.id ?? null)
  const { data: replacementSource } = useReplacementSource(
    delivery?.type === 'replacement' ? delivery.return_id : null,
  )

  if (!delivery) return null

  const items = delivery.sale_delivery_lines ?? []
  const totalQty = items.reduce((sum, i) => sum + i.qty_delivered, 0)
  const statusCfg = STATUS_CONFIG[delivery.status ?? ''] ?? STATUS_CONFIG.pending

  async function handlePrintWarranty() {
    if (warrantyBusy || !delivery) return
    setWarrantyBusy(true)
    try {
      await openWarrantyCertificate(delivery.id)
    } finally {
      setWarrantyBusy(false)
    }
  }

  async function handleDownloadPdf() {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch(`/api/sales/deliveries/${delivery!.id}/pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const json = await res.json() as { url: string }
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <Dialog open={!!delivery} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-50 text-blue-600">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold font-mono tracking-tight">{delivery.delivery_number}</h2>
                  {delivery.type === 'replacement' && (
                    <Badge className="text-xs bg-purple-100 text-purple-700">Replacement</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {delivery.so_number ?? '—'}
                  {delivery.customer_name ? ` · ${delivery.customer_name}` : ''}
                </p>
              </div>
            </div>
            <Badge className={cn('border text-xs', statusCfg.bg, statusCfg.color)}>
              {statusCfg.label}
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Body */}
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-4">
            <MetaCard
              icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
              label="Date"
              value={delivery.date ? formatDate(delivery.date) : '—'}
            />
            <MetaCard
              icon={<Warehouse className="h-4 w-4 text-muted-foreground" />}
              label="Warehouse"
              value={delivery.warehouse_name ?? '—'}
            />
            <MetaCard
              icon={<User className="h-4 w-4 text-muted-foreground" />}
              label="Created By"
              value={delivery.created_by_name ?? '—'}
            />
            <MetaCard
              icon={<Hash className="h-4 w-4 text-muted-foreground" />}
              label="Items"
              value={`${totalQty} unit${totalQty !== 1 ? 's' : ''} · ${items.length} line${items.length !== 1 ? 's' : ''}`}
            />
          </div>

          {delivery.type === 'replacement' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Replacement Delivery</p>
              {replacementSource && (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                  Fulfills return{' '}
                  <span className="font-mono font-medium">{replacementSource.return_number}</span>
                  {replacementSource.sourceDelivery && (
                    <>
                      {' '}(originally shipped as{' '}
                      <span className="font-mono font-medium">{replacementSource.sourceDelivery.delivery_number}</span>
                      )
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Items table */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Delivered Items</h3>
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-left font-medium">SKU</th>
                      <th className="px-3 py-2 text-right font-medium">Qty Delivered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, i) => (
                      <tr key={i} className={cn('hover:bg-muted/20', STAGGER_IN)} style={staggerDelay(i)}>
                        <td className="px-3 py-2.5 font-medium">
                          <div className="flex items-center gap-1.5">
                            <span>{item.item_name}</span>
                            {item.is_gift && (
                              <Badge variant="outline" className="text-[10px] border-amber-200 bg-amber-50 text-amber-700">Gift</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{item.sku ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{item.qty_delivered}</td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr><td colSpan={3} className="py-8 text-center text-muted-foreground">No items found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Summary */}
          {items.length > 0 && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex justify-between text-sm font-semibold">
                <span>Total Delivered</span>
                <span className="tabular-nums">{totalQty} unit{totalQty !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <Separator />
        <div className="px-6 py-3 flex items-center justify-end gap-2">
          {warrantyRecords.length > 0 && (
            <Button variant="outline" size="sm" onClick={handlePrintWarranty} disabled={warrantyBusy}>
              {warrantyBusy
                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />}
              {warrantyBusy ? 'Generating…' : 'Print Warranty Certificate'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={pdfBusy}>
            {pdfBusy
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <Download className="h-3.5 w-3.5 mr-1.5" />}
            {pdfBusy ? 'Generating…' : 'Download PDF'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
