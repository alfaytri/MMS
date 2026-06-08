'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Package, Truck, ArrowRightLeft, ClipboardList,
  Receipt, ClipboardCheck, Calendar, Warehouse, User,
} from 'lucide-react'
import { ItemTreeCell } from './ItemTreeCell'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'

interface Props {
  referenceType: string
  referenceId: string
  open: boolean
  onClose: () => void
}

const STATUS_STYLES: Record<string, string> = {
  pending:           'bg-warning/10 text-warning border-warning/20',
  pending_approval:  'bg-warning/10 text-warning border-warning/20',
  in_transit:        'bg-blue-500/10 text-blue-600 border-blue-500/20',
  received:          'bg-success/10 text-success border-success/20',
  approved:          'bg-success/10 text-success border-success/20',
  completed:         'bg-success/10 text-success border-success/20',
  rejected:          'bg-destructive/10 text-destructive border-destructive/20',
  cancelled:         'bg-muted text-muted-foreground border-border',
  draft:             'bg-muted text-muted-foreground border-border',
  in_progress:       'bg-blue-500/10 text-blue-600 border-blue-500/20',
}

function useRefDetail(referenceType: string, referenceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['movement-ref-detail', referenceType, referenceId],
    queryFn: async () => {
      const supabase = createClient()

      switch (referenceType) {
        case 'sale_delivery': {
          const { data, error } = await supabase
            .from('sale_deliveries')
            .select('id, delivery_number, sale_order_id, warehouse_id, warehouse_name, date, items, status, sale_orders(so_number, customers(name))')
            .eq('id', referenceId)
            .single()
          if (error) throw error
          return { type: 'sale_delivery' as const, data }
        }
        case 'receival':
        case 'free_receival': {
          const { data, error } = await supabase
            .from('receivals')
            .select('id, receival_number, po_id, warehouse_id, date, status, received_by_name, purchase_orders(po_number, supplier_name), warehouses(name), receival_items(id, item_name, sku, qty_received, brand_variant_id)')
            .eq('id', referenceId)
            .single()
          if (error) throw error
          return { type: 'receival' as const, data }
        }
        case 'transfer': {
          const { data, error } = await supabase
            .from('warehouse_transfers')
            .select('*, from_warehouse:from_warehouse_id(name), to_warehouse:to_warehouse_id(name), transfer_items:warehouse_transfer_items(*)')
            .eq('id', referenceId)
            .single()
          if (error) throw error
          return { type: 'transfer' as const, data }
        }
        case 'adjustment': {
          const { data, error } = await supabase
            .from('stock_adjustments')
            .select('*, warehouses(name), inventory_brand_variants(brand, inventory_items(name_en, sku))')
            .eq('id', referenceId)
            .single()
          if (error) throw error
          return { type: 'adjustment' as const, data }
        }
        case 'landed_cost': {
          const { data, error } = await supabase
            .from('landed_costs')
            .select('id, lc_number, status, vendor_invoice_no, total_landed_cost, created_at, suppliers(company_name)')
            .eq('id', referenceId)
            .single()
          if (error) throw error
          return { type: 'landed_cost' as const, data }
        }
        case 'inventory_check': {
          const { data, error } = await supabase
            .from('inventory_checks')
            .select('id, check_number, warehouse_name, status, started_at, reviewed_at')
            .eq('id', referenceId)
            .single()
          if (error) throw error
          return { type: 'inventory_check' as const, data }
        }
        default:
          return null
      }
    },
    enabled: enabled && !!referenceId,
    staleTime: 2 * 60 * 1000,
  })
}

// ─── Shared meta row ────────────────────────────────────────────────────────

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="h-8 w-8 rounded-lg bg-muted/40 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  )
}

// ─── Main dialog ────────────────────────────────────────────────────────────

export function WhMovementRefDialog({ referenceType, referenceId, open, onClose }: Props) {
  const { data: result, isLoading } = useRefDetail(referenceType, referenceId, open)
  const { data: fullStock = [] } = useWarehouseStock()

  const variantMeta = useMemo(() => {
    const map = new Map<string, { categoryName: string | null; itemType: string | null; itemName: string; brand: string | null }>()
    for (const s of fullStock) {
      if (!map.has(s.brand_variant_id)) {
        map.set(s.brand_variant_id, { categoryName: s.category_name ?? null, itemType: s.item_type ?? null, itemName: s.item_name, brand: s.brand ?? null })
      }
    }
    return map
  }, [fullStock])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col gap-0 p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-xs text-muted-foreground">Loading details…</p>
            </div>
          </div>
        ) : !result ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">Details not available</p>
          </div>
        ) : (
          <>
            {result.type === 'sale_delivery' && <SaleDeliveryView data={result.data} />}
            {result.type === 'receival' && <ReceivalView data={result.data} variantMeta={variantMeta} isFree={referenceType === 'free_receival'} />}
            {result.type === 'transfer' && <TransferView data={result.data} />}
            {result.type === 'adjustment' && <AdjustmentView data={result.data} variantMeta={variantMeta} />}
            {result.type === 'landed_cost' && <LandedCostView data={result.data} />}
            {result.type === 'inventory_check' && <InventoryCheckView data={result.data} />}
          </>
        )}
        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Sale Delivery ──────────────────────────────────────────────────────────

function SaleDeliveryView({ data }: { data: any }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  const customer = data.sale_orders?.customers?.name ?? '—'
  const soNumber = data.sale_orders?.so_number ?? '—'

  return (
    <>
      <div className="px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <Truck className="h-5 w-5 text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">{data.delivery_number}</h3>
              <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status] ?? 'bg-muted text-muted-foreground'}`}>
                {data.status?.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Sale Delivery — {soNumber}</p>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <MetaRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Customer" value={customer} />
          <MetaRow icon={<Warehouse className="h-3.5 w-3.5 text-muted-foreground" />} label="Warehouse" value={data.warehouse_name ?? '—'} />
          <MetaRow icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />} label="Date" value={data.date ? format(new Date(data.date), 'dd MMM yyyy') : '—'} />
          <MetaRow icon={<Package className="h-3.5 w-3.5 text-muted-foreground" />} label="Items" value={`${items.length} item${items.length !== 1 ? 's' : ''}`} />
        </div>
      </div>

      {items.length > 0 && (
        <div className="px-6 pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Delivered Items</p>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-[1fr_80px] gap-2 px-4 py-2 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Item</span>
              <span className="text-right">Qty</span>
            </div>
            <div className="max-h-[220px] overflow-y-auto divide-y">
              {items.map((i: any, idx: number) => (
                <div key={idx} className="grid grid-cols-[1fr_80px] gap-2 px-4 py-2.5 items-center">
                  <span className="text-sm">{i.item_name ?? i.name ?? '—'}</span>
                  <span className="text-sm text-right tabular-nums font-medium">{i.qty_delivered ?? i.qty ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Receival ───────────────────────────────────────────────────────────────

function ReceivalView({ data, variantMeta, isFree }: { data: any; variantMeta: Map<string, any>; isFree: boolean }) {
  const items: any[] = Array.isArray(data.receival_items) ? data.receival_items : []
  const supplier = data.purchase_orders?.supplier_name ?? '—'
  const poNumber = data.purchase_orders?.po_number ?? '—'

  return (
    <>
      <div className="px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0">
            <Package className="h-5 w-5 text-success" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">{data.receival_number}</h3>
              <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status] ?? 'bg-muted text-muted-foreground'}`}>
                {data.status?.replace(/_/g, ' ')}
              </Badge>
              {isFree && <Badge className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary">Free</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">PO Receival — {poNumber}</p>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <MetaRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Supplier" value={supplier} />
          <MetaRow icon={<Warehouse className="h-3.5 w-3.5 text-muted-foreground" />} label="Warehouse" value={data.warehouses?.name ?? '—'} />
          <MetaRow icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />} label="Date" value={data.date ? format(new Date(data.date), 'dd MMM yyyy') : '—'} />
          <MetaRow icon={<Package className="h-3.5 w-3.5 text-muted-foreground" />} label="Items" value={`${items.length} item${items.length !== 1 ? 's' : ''}`} />
        </div>
      </div>

      {items.length > 0 && (
        <div className="px-6 pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Received Items</p>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-[1fr_80px] gap-2 px-4 py-2 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Item</span>
              <span className="text-right">Qty</span>
            </div>
            <div className="max-h-[220px] overflow-y-auto divide-y">
              {items.map((i: any) => {
                const meta = i.brand_variant_id ? variantMeta.get(i.brand_variant_id) : null
                return (
                  <div key={i.id} className="grid grid-cols-[1fr_80px] gap-2 px-4 py-2.5 items-center">
                    <ItemTreeCell
                      category={meta?.categoryName}
                      itemType={meta?.itemType}
                      itemName={meta?.itemName ?? i.item_name}
                      brand={meta?.brand}
                      sku={i.sku}
                      showSku
                    />
                    <span className="text-sm text-right tabular-nums font-medium">{i.qty_received}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Transfer ───────────────────────────────────────────────────────────────

function TransferView({ data }: { data: any }) {
  const items: any[] = Array.isArray(data.transfer_items) ? data.transfer_items : []

  return (
    <>
      <div className="px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">{data.transfer_number}</h3>
              <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status] ?? 'bg-muted text-muted-foreground'}`}>
                {data.status?.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Stock Transfer</p>
          </div>
        </div>

        <Separator />

        {/* From → To visual */}
        <div className="flex items-center gap-3 px-2">
          <div className="flex-1 text-center rounded-lg border bg-muted/20 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">From</p>
            <p className="text-sm font-semibold">{data.from_warehouse?.name ?? '—'}</p>
          </div>
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 text-center rounded-lg border bg-muted/20 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">To</p>
            <p className="text-sm font-semibold">{data.to_warehouse?.name ?? '—'}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <MetaRow icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />} label="Date" value={data.date ? format(new Date(data.date), 'dd MMM yyyy') : '—'} />
          {data.dispatched_by_name && (
            <MetaRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Dispatched" value={data.dispatched_by_name} />
          )}
          {data.received_by_name && (
            <MetaRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Received" value={data.received_by_name} />
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="px-6 pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Transfer Items</p>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-[1fr_60px_60px_60px] gap-2 px-4 py-2 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Item</span>
              <span className="text-right">Req</span>
              <span className="text-right">Disp</span>
              <span className="text-right">Recv</span>
            </div>
            <div className="max-h-[220px] overflow-y-auto divide-y">
              {items.map((i: any) => (
                <div key={i.id} className="grid grid-cols-[1fr_60px_60px_60px] gap-2 px-4 py-2.5 items-center">
                  <span className="text-sm">{i.item_name ?? '—'}</span>
                  <span className="text-sm text-right tabular-nums">{i.requested_qty}</span>
                  <span className="text-sm text-right tabular-nums">{i.dispatched_qty ?? '—'}</span>
                  <span className="text-sm text-right tabular-nums font-medium">{i.received_qty ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Adjustment ─────────────────────────────────────────────────────────────

function AdjustmentView({ data, variantMeta }: { data: any; variantMeta: Map<string, any> }) {
  const meta = data.brand_variant_id ? variantMeta.get(data.brand_variant_id) : null
  const itemName = data.inventory_brand_variants?.inventory_items?.name_en ?? meta?.itemName ?? '—'
  const brand = data.inventory_brand_variants?.brand ?? meta?.brand

  const TYPE_COLORS: Record<string, string> = {
    increase:  'bg-success/10 text-success',
    decrease:  'bg-warning/10 text-warning',
    damage:    'bg-destructive/10 text-destructive',
    write_off: 'bg-destructive/10 text-destructive',
  }

  return (
    <>
      <div className="px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Stock Adjustment</h3>
              <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status] ?? 'bg-muted text-muted-foreground'}`}>
                {data.status?.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{data.warehouses?.name ?? '—'}</p>
          </div>
        </div>

        <Separator />

        {/* Item highlight */}
        <div className="rounded-lg border bg-muted/20 px-4 py-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Item</p>
          <p className="text-sm font-semibold">{itemName}{brand ? ` — ${brand}` : ''}</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border px-3 py-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Type</p>
            <Badge className={`text-xs px-2 py-0.5 capitalize ${TYPE_COLORS[data.adjustment_type] ?? 'bg-muted text-muted-foreground'}`}>
              {data.adjustment_type?.replace(/_/g, ' ')}
            </Badge>
          </div>
          <div className="rounded-lg border px-3 py-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Quantity</p>
            <p className="text-lg font-bold tabular-nums">{data.qty}</p>
          </div>
          <div className="rounded-lg border px-3 py-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Date</p>
            <p className="text-sm font-medium">{data.created_at ? format(new Date(data.created_at), 'dd MMM yy') : '—'}</p>
          </div>
        </div>

        {data.reason && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Reason</p>
            <p className="text-sm">{data.reason}</p>
          </div>
        )}
        {data.notes && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-muted-foreground">{data.notes}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <MetaRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Requested By" value={data.requested_by_name ?? '—'} />
          {data.approved_by_name && (
            <MetaRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Approved By" value={data.approved_by_name} />
          )}
        </div>
      </div>
    </>
  )
}

// ─── Landed Cost ────────────────────────────────────────────────────────────

function LandedCostView({ data }: { data: any }) {
  return (
    <div className="px-6 pt-6 pb-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Receipt className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{data.lc_number}</h3>
            <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status] ?? 'bg-muted text-muted-foreground'}`}>
              {data.status?.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Landed Cost</p>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-4">
        <MetaRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Supplier" value={data.suppliers?.company_name ?? '—'} />
        <MetaRow icon={<Receipt className="h-3.5 w-3.5 text-muted-foreground" />} label="Vendor Invoice" value={data.vendor_invoice_no ?? '—'} />
        <MetaRow icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />} label="Date" value={data.created_at ? format(new Date(data.created_at), 'dd MMM yyyy') : '—'} />
        <div className="rounded-lg border px-3 py-2.5 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Total Landed Cost</p>
          <p className="text-lg font-bold tabular-nums">{data.total_landed_cost != null ? Number(data.total_landed_cost).toFixed(2) : '—'}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Inventory Check ────────────────────────────────────────────────────────

function InventoryCheckView({ data }: { data: any }) {
  return (
    <div className="px-6 pt-6 pb-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <ClipboardCheck className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{data.check_number}</h3>
            <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status] ?? 'bg-muted text-muted-foreground'}`}>
              {data.status?.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Inventory Check</p>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-4">
        <MetaRow icon={<Warehouse className="h-3.5 w-3.5 text-muted-foreground" />} label="Warehouse" value={data.warehouse_name ?? '—'} />
        <MetaRow icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />} label="Started" value={data.started_at ? format(new Date(data.started_at), 'dd MMM yyyy') : '—'} />
        {data.reviewed_at && (
          <MetaRow icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />} label="Reviewed" value={format(new Date(data.reviewed_at), 'dd MMM yyyy')} />
        )}
      </div>
    </div>
  )
}
