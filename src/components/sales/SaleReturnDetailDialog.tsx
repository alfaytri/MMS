'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  RotateCcw, Calendar, User, Hash, Loader2, Download, AlertTriangle,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import type { SaleReturn } from '@/hooks/useSaleReturns'
import { useReturnProgress } from '@/hooks/useSaleReturns'
import { useReturnLineSources } from '@/hooks/useReturnLineSources'
import { ReturnLineSourceBadges } from '@/components/shared/ReturnLineSourceBadges'
import { useMemo } from 'react'

const RESOLUTION_LABEL: Record<string, string> = {
  replacement:  'replaced',
  refund:       'refunded',
  store_credit: 'store credit',
}

const DISPOSITION_LABEL: Record<string, string> = {
  write_off:          'write-off',
  restock_as_damaged: 'restock (damaged)',
  send_for_repair:    'sent for repair',
}

function ResolutionProgressPanel({ returnId }: { returnId: string }) {
  const { data: progress } = useReturnProgress(returnId)
  if (!progress) return null

  const custMix = progress.customer_resolutions_by_type ?? {}
  const customerParts: string[] = []
  for (const [type, qty] of Object.entries(custMix)) {
    if (qty > 0) customerParts.push(`${qty} ${RESOLUTION_LABEL[type] ?? type}`)
  }
  if (progress.customer_remaining > 0) {
    customerParts.push(`${progress.customer_remaining} remaining`)
  }

  const invMix = progress.inventory_dispositions_by_type ?? {}
  const inventoryParts: string[] = []
  if (progress.total_damaged > 0) {
    for (const [type, qty] of Object.entries(invMix)) {
      if (qty > 0) inventoryParts.push(`${qty} ${DISPOSITION_LABEL[type] ?? type}`)
    }
    if (progress.inventory_remaining > 0) {
      inventoryParts.push(`${progress.inventory_remaining} un-dispositioned`)
    }
  }

  const hasCustomer  = customerParts.length > 0
  const hasInventory = progress.total_damaged > 0
  if (!hasCustomer && !hasInventory && !progress.compensation_missing) return null

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Resolution Progress
        </p>
        {progress.compensation_missing && (
          <span
            title="Damaged units were dispositioned inventory-side but the customer received no matching refund / store credit / replacement."
            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            Compensation not recorded
          </span>
        )}
      </div>
      <div className="space-y-1 text-sm tabular-nums">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground text-[11px] uppercase tracking-wide">Customer</span>
          <span className="text-right text-xs">
            {hasCustomer ? customerParts.join(' · ') : '—'}
          </span>
        </div>
        {hasInventory && (
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground text-[11px] uppercase tracking-wide">Inventory</span>
            <span className="text-right text-xs">
              {inventoryParts.length > 0 ? inventoryParts.join(' · ') : '—'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending',   color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  received:  { label: 'Received',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  restocked: { label: 'Restocked', color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  closed:    { label: 'Closed',    color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
  cancelled: { label: 'Cancelled', color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
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
  ret: SaleReturn | null
  onClose: () => void
}

export function SaleReturnDetailDialog({ ret, onClose }: Props) {
  const [pdfBusy, setPdfBusy] = useState(false)

  const items = useMemo(() => ret?.return_lines ?? [], [ret])
  const saleDeliveryLineIds = useMemo(
    () => items
      .map((i) => (i as { sale_delivery_line_id?: string | null }).sale_delivery_line_id)
      .filter((v): v is string => !!v),
    [items]
  )
  const { data: sourceMaps } = useReturnLineSources([], saleDeliveryLineIds, ret?.id ?? null)

  if (!ret) return null
  const goodItems = items.filter(i => i.condition === 'good')
  const damagedItems = items.filter(i => i.condition === 'damaged')
  const totalQty = items.reduce((sum, i) => sum + i.qty, 0)

  const statusCfg = STATUS_CONFIG[ret.status] ?? { label: ret.status, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' }

  async function handleDownloadPdf() {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch(`/api/returns/${ret!.id}/pdf`, {
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
    <Dialog open={!!ret} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-orange-50 text-orange-600">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold font-mono tracking-tight">{ret.return_number}</h2>
                <p className="text-sm text-muted-foreground">Sale Return</p>
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
          {/* Meta grid — per-line source (delivery # + warehouse + sub-container)
              now lives in the items table below via ReturnLineSourceBadges. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetaCard
              icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
              label="Date"
              value={ret.date ? formatDate(ret.date) : '—'}
            />
            <MetaCard
              icon={<User className="h-4 w-4 text-muted-foreground" />}
              label="Created By"
              value={ret.created_by_name ?? '—'}
            />
            <MetaCard
              icon={<Hash className="h-4 w-4 text-muted-foreground" />}
              label="Items"
              value={`${totalQty} unit${totalQty !== 1 ? 's' : ''} · ${items.length} line${items.length !== 1 ? 's' : ''}`}
            />
          </div>

          {/* Reason */}
          <div className="rounded-lg border-l-2 border-orange-400 bg-orange-50/50 px-4 py-3">
            <p className="text-[10px] font-semibold text-orange-700 uppercase tracking-wider mb-0.5">Reason</p>
            <p className="text-sm font-medium">{ret.reason}</p>
          </div>

          {/* Damaged warning */}
          {damagedItems.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <p className="text-xs font-medium text-red-700">
                {damagedItems.reduce((s, i) => s + i.qty, 0)} damaged unit{damagedItems.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''} in this return
              </p>
            </div>
          )}

          {/* Items table */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Return Items</h3>
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-left font-medium">SKU</th>
                      <th className="px-3 py-2 text-left font-medium">Source</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-center font-medium">Condition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => {
                      const sdlid = (item as { sale_delivery_line_id?: string | null }).sale_delivery_line_id ?? null
                      const info = sdlid ? sourceMaps?.delivery.get(sdlid) : undefined
                      return (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="px-3 py-2.5 font-medium">{item.item_name}</td>
                          <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{item.sku ?? '—'}</td>
                          <td className="px-3 py-2.5"><ReturnLineSourceBadges info={info} /></td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{item.qty}</td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge
                              variant="outline"
                              className={cn('text-xs', item.condition === 'damaged'
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : 'border-green-200 bg-green-50 text-green-700'
                              )}
                            >
                              {item.condition}
                            </Badge>
                          </td>
                        </tr>
                      )
                    })}
                    {items.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No items found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Resolution progress (Phase 7 dual-ledger) */}
          <ResolutionProgressPanel returnId={ret.id} />

          {/* Summary */}
          {items.length > 0 && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
              {goodItems.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Good condition</span>
                  <span className="tabular-nums">{goodItems.reduce((s, i) => s + i.qty, 0)} units</span>
                </div>
              )}
              {damagedItems.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-600">Damaged</span>
                  <span className="tabular-nums text-red-600">{damagedItems.reduce((s, i) => s + i.qty, 0)} units</span>
                </div>
              )}
              {goodItems.length > 0 && damagedItems.length > 0 && <Separator />}
              <div className="flex justify-between text-sm font-semibold">
                <span>Total Returned</span>
                <span className="tabular-nums">{totalQty} unit{totalQty !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          {ret.notes && (
            <div className="rounded-lg border-l-2 border-primary bg-muted/20 px-4 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Notes</p>
              <p className="text-sm">{ret.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <Separator />
        <div className="px-6 py-3 flex items-center justify-end">
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
