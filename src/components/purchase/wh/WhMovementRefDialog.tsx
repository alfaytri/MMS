'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Package, Truck, ArrowRightLeft, ClipboardList,
  Receipt, ClipboardCheck, Calendar, Warehouse, User, Boxes,
  PackageMinus, Flag,
} from 'lucide-react'
import { ItemTreeCell } from './ItemTreeCell'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { shortenSubContainerName } from '@/hooks/useWarehouseSubContainers'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'

interface Props {
  referenceType: string
  referenceId: string
  open: boolean
  onClose: () => void
  // Sub-container of the clicked movement row (deliveries/receivals carry no
  // usable header sub_container, so the Movements tab passes it as context).
  subContainerName?: string | null
}

// ─── Sub-view data types ───────────────────────────────────────────────────

type VariantMeta = { categoryName: string | null; subcategoryName: string | null; itemType: string | null; itemName: string; brand: string | null; origin: string | null }

interface SaleDeliveryData {
  delivery_number: string
  status: string | null
  warehouse_name: string | null
  date: string | null
  sale_delivery_lines: Array<{ item_name: string; sku?: string | null; qty_delivered: number; brand_variant_id?: string | null }> | null
  sale_orders: { so_number: string; customers: { name: string } | null } | null
}

interface ReceivalData {
  receival_number: string
  status: string | null
  date: string | null
  received_by_name: string | null
  purchase_orders: { po_number: string; supplier_name: string } | null
  warehouses: { name: string } | null
  receival_items: Array<{ id: string; item_name: string; sku: string | null; qty_received: number; brand_variant_id: string | null }> | null
}

interface TransferData {
  transfer_number: string
  status: string | null
  transfer_kind: string | null
  date: string | null
  dispatched_by_name: string | null
  received_by_name: string | null
  from_warehouse: { name: string } | null
  to_warehouse: { name: string } | null
  from_sub_container: { name: string | null } | null
  to_sub_container: { name: string | null } | null
  transfer_items: Array<{ id: string; item_name: string; requested_qty: number; dispatched_qty: number | null; received_qty: number | null }> | null
}

interface AdjustmentData {
  brand_variant_id: string | null
  status: string
  adjustment_type: string
  qty: number
  created_at: string | null
  reason: string | null
  notes: string | null
  requested_by_name: string | null
  approved_by_name: string | null
  warehouses: { name: string } | null
  inventory_item_brand_variants: { brand: string | null; inventory_items: { name_en: string; sku: string | null } | null } | null
}

interface LandedCostData {
  lc_number: string
  status: string
  total_amount: number | null
  description: string | null
  currency: string | null
  date: string | null
  created_at: string | null
}

interface InventoryCheckData {
  check_number: string
  warehouse_name: string | null
  status: string
  started_at: string | null
  reviewed_at: string | null
}

interface SaleReturnData {
  return_number: string
  status: string | null
  date: string | null
  reason: string | null
  restock_warehouse_id: string | null
  restock_warehouse_name: string | null
  return_lines: Array<{ id: string; item_name: string; sku: string | null; qty: number; condition: string | null }> | null
  sale_orders: { so_number: string; customers: { name: string } | null } | null
}

interface ConsumptionData {
  ce_number: string | null
  date: string | null
  status: string | null
  notes: string | null
  consumer_type: string | null
  consumer: {
    name: string | null
    disciplines: { name: string } | null
    projects: { project_number: string; name: string | null } | null
  } | null
  source: { name: string | null } | null
  milestone: { label: string } | null
  items: Array<{ brand_variant_id: string | null; item_name: string | null; sku: string | null; qty: number; unit_cost: number | null }>
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
            .select('id, delivery_number, sale_order_id, warehouse_id, warehouse_name, date, status, sale_delivery_lines(item_name, sku, qty_delivered, brand_variant_id), sale_orders(so_number, customers(name))')
            .eq('id', referenceId)
            .maybeSingle()
          if (error) throw error
          if (!data) return null
          return { type: 'sale_delivery' as const, data }
        }
        case 'receival':
        case 'free_receival': {
          const { data, error } = await supabase
            .from('receivals')
            .select('id, receival_number, po_id, warehouse_id, date, status, received_by_name, purchase_orders(po_number, supplier_name), warehouses(name), receival_items(id, item_name, sku, qty_received, brand_variant_id)')
            .eq('id', referenceId)
            .maybeSingle()
          if (error) throw error
          if (!data) return null
          return { type: 'receival' as const, data }
        }
        case 'transfer': {
          const { data, error } = await supabase
            .from('warehouse_transfers')
            .select('*, from_warehouse:from_warehouse_id(name), to_warehouse:to_warehouse_id(name), from_sub_container:from_sub_container_id(name), to_sub_container:to_sub_container_id(name), transfer_items:warehouse_transfer_items(*)')
            .eq('id', referenceId)
            .maybeSingle()
          if (error) throw error
          if (!data) return null
          return { type: 'transfer' as const, data: data as unknown as TransferData }
        }
        case 'adjustment': {
          const { data, error } = await supabase
            .from('stock_adjustments')
            .select('*, warehouses(name), inventory_item_brand_variants(brand, inventory_items(name_en, sku))')
            .eq('id', referenceId)
            .maybeSingle()
          if (error) throw error
          if (!data) return null
          return { type: 'adjustment' as const, data }
        }
        case 'landed_cost': {
          const { data, error } = await supabase
            .from('landed_costs')
            .select('id, lc_number, total_amount, description, currency, applied_at, voided_at, date, created_at')
            .eq('id', referenceId)
            .maybeSingle()
          if (error) throw error
          if (!data) return null
          const status = data.voided_at ? 'voided' : data.applied_at ? 'applied' : 'draft'
          return { type: 'landed_cost' as const, data: { ...data, status } }
        }
        case 'inventory_check': {
          const { data, error } = await supabase
            .from('inventory_checks')
            .select('id, check_number, warehouse_name, status, started_at, reviewed_at')
            .eq('id', referenceId)
            .maybeSingle()
          if (error) throw error
          if (!data) return null
          return { type: 'inventory_check' as const, data }
        }
        case 'return':
        case 'sale_return': {
          // so_po_returns.source_id is polymorphic (source_type points at
          // sale_orders OR purchase_orders); PostgREST can't embed either, so
          // we split the fetch: return + lines first, then the SO + customer
          // + warehouse in parallel.
          const { data: retRow, error: retErr } = await supabase
            .from('so_po_returns')
            .select(`
              return_number, status, date, reason, source_type, source_id, restock_warehouse_id,
              return_lines(id, item_name, sku, qty, condition)
            `)
            .eq('id', referenceId)
            .maybeSingle()
          if (retErr) throw retErr
          if (!retRow) return null
          if (retRow.source_type !== 'sale_order') return null

          const [soRes, whRes] = await Promise.all([
            retRow.source_id
              ? supabase
                  .from('sale_orders')
                  .select('so_number, customers(name)')
                  .eq('id', retRow.source_id as string)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null } as const),
            retRow.restock_warehouse_id
              ? supabase
                  .from('warehouses')
                  .select('name')
                  .eq('id', retRow.restock_warehouse_id as string)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null } as const),
          ])

          const soData = (soRes.data ?? null) as { so_number: string; customers: { name: string } | null } | null
          return {
            type: 'sale_return' as const,
            data: {
              return_number:          retRow.return_number,
              status:                 retRow.status,
              date:                   retRow.date,
              reason:                 retRow.reason,
              restock_warehouse_id:   retRow.restock_warehouse_id,
              restock_warehouse_name: whRes.data?.name ?? null,
              return_lines:           (retRow as unknown as { return_lines: SaleReturnData['return_lines'] }).return_lines,
              sale_orders:            soData,
            } satisfies SaleReturnData,
          }
        }
        case 'consumption': {
          // The movement's reference_id points at consumption_entries.id.
          const { data: ce, error } = await supabase
            .from('consumption_entries')
            .select('id, ce_number, date, status, notes, consumer_type, consumer_sub_container_id, source_sub_container_id, milestone_id')
            .eq('id', referenceId)
            .maybeSingle()
          if (error) throw error
          if (!ce) return null
          // Resolve consumer (→ discipline/project), source, milestone, and the
          // consumed lines separately — robust against PostgREST join quirks.
          const [consumerRes, sourceRes, msRes, movesRes] = await Promise.all([
            ce.consumer_sub_container_id
              ? supabase.from('warehouse_sub_containers')
                  .select('name, disciplines(name), projects(project_number, name)')
                  .eq('id', ce.consumer_sub_container_id).maybeSingle()
              : Promise.resolve({ data: null } as const),
            ce.source_sub_container_id
              ? supabase.from('warehouse_sub_containers').select('name').eq('id', ce.source_sub_container_id).maybeSingle()
              : Promise.resolve({ data: null } as const),
            ce.milestone_id
              ? supabase.from('project_milestones').select('label').eq('id', ce.milestone_id).maybeSingle()
              : Promise.resolve({ data: null } as const),
            supabase.from('inventory_stock_movements')
              .select('brand_variant_id, item_name, sku, qty, unit_cost')
              .eq('reference_type', 'consumption').eq('reference_id', referenceId).limit(200),
          ])
          const consumer = (consumerRes.data ?? null) as ConsumptionData['consumer']
          const source = (sourceRes.data ?? null) as ConsumptionData['source']
          const milestone = (msRes.data ?? null) as ConsumptionData['milestone']
          return {
            type: 'consumption' as const,
            data: {
              ce_number: ce.ce_number, date: ce.date, status: ce.status, notes: ce.notes,
              consumer_type: ce.consumer_type, consumer, source, milestone,
              items: (movesRes.data ?? []) as ConsumptionData['items'],
            } satisfies ConsumptionData,
          }
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

export function WhMovementRefDialog({ referenceType, referenceId, open, onClose, subContainerName }: Props) {
  const { data: result, isLoading } = useRefDetail(referenceType, referenceId, open)
  const { data: fullStock = [] } = useWarehouseStock()

  const variantMeta = useMemo(() => {
    const map = new Map<string, VariantMeta>()
    for (const s of fullStock) {
      if (!map.has(s.brand_variant_id)) {
        map.set(s.brand_variant_id, { categoryName: s.category_name ?? null, subcategoryName: s.subcategory_name ?? null, itemType: s.item_type ?? null, itemName: s.item_name, brand: s.brand ?? null, origin: s.country_name ?? null })
      }
    }
    return map
  }, [fullStock])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* Fits its content (no dead space); a modest floor keeps short views and
          the loading state from feeling cramped, and tall views scroll at 85vh. */}
      <DialogContent className="max-w-2xl min-h-[280px] max-h-[85vh] overflow-y-auto p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-28">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-xs text-muted-foreground">Loading details…</p>
            </div>
          </div>
        ) : !result ? (
          <div className="flex items-center justify-center py-28">
            <p className="text-sm text-muted-foreground">Details not available</p>
          </div>
        ) : (
          <>
            {result.type === 'sale_delivery' && <SaleDeliveryView data={result.data} subContainer={subContainerName ?? null} />}
            {result.type === 'receival' && <ReceivalView data={result.data} variantMeta={variantMeta} isFree={referenceType === 'free_receival'} subContainer={subContainerName ?? null} />}
            {result.type === 'transfer' && <TransferView data={result.data} />}
            {result.type === 'adjustment' && <AdjustmentView data={result.data} variantMeta={variantMeta} />}
            {result.type === 'landed_cost' && <LandedCostView data={result.data} />}
            {result.type === 'inventory_check' && <InventoryCheckView data={result.data} />}
            {result.type === 'sale_return' && <SaleReturnView data={result.data} />}
            {result.type === 'consumption' && <ConsumptionView data={result.data} variantMeta={variantMeta} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Sale Delivery ──────────────────────────────────────────────────────────

function SaleDeliveryView({ data, subContainer }: { data: SaleDeliveryData; subContainer: string | null }) {
  const items = Array.isArray(data.sale_delivery_lines) ? data.sale_delivery_lines : []
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
              <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
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
          <MetaRow icon={<Boxes className="h-3.5 w-3.5 text-muted-foreground" />} label="Sub-container" value={subContainer ? shortenSubContainerName(subContainer, data.warehouse_name ?? '') : '—'} />
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
              {items.map((i, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px] gap-2 px-4 py-2.5 items-center">
                  <span className="text-sm">{i.item_name ?? '—'}</span>
                  <span className="text-sm text-right tabular-nums font-medium">{i.qty_delivered ?? 0}</span>
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

function ReceivalView({ data, variantMeta, isFree, subContainer }: { data: ReceivalData; variantMeta: Map<string, VariantMeta>; isFree: boolean; subContainer: string | null }) {
  const items = Array.isArray(data.receival_items) ? data.receival_items : []
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
              <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
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
          <MetaRow icon={<Boxes className="h-3.5 w-3.5 text-muted-foreground" />} label="Sub-container" value={subContainer ? shortenSubContainerName(subContainer, data.warehouses?.name ?? '') : '—'} />
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
              {items.map((i) => {
                const meta = i.brand_variant_id ? variantMeta.get(i.brand_variant_id) : null
                return (
                  <div key={i.id} className="grid grid-cols-[1fr_80px] gap-2 px-4 py-2.5 items-center">
                    <ItemTreeCell
                      category={meta?.categoryName}
                      subcategory={meta?.subcategoryName}
                      itemType={meta?.itemType}
                      itemName={meta?.itemName ?? i.item_name}
                      brand={meta?.brand}
                      origin={meta?.origin ?? null}
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

function TransferView({ data }: { data: TransferData }) {
  const items = Array.isArray(data.transfer_items) ? data.transfer_items : []

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
              <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
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
            <p className="text-sm font-semibold truncate" title={data.from_warehouse?.name ?? ''}>{data.from_warehouse?.name ?? '—'}</p>
            {data.from_sub_container?.name && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={data.from_sub_container.name}>
                {data.from_sub_container.name}
              </p>
            )}
          </div>
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 text-center rounded-lg border bg-muted/20 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">To</p>
            <p className="text-sm font-semibold truncate" title={data.to_warehouse?.name ?? ''}>{data.to_warehouse?.name ?? '—'}</p>
            {data.to_sub_container?.name && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={data.to_sub_container.name}>
                {data.to_sub_container.name}
              </p>
            )}
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
              {items.map((i) => (
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

function AdjustmentView({ data, variantMeta }: { data: AdjustmentData; variantMeta: Map<string, VariantMeta> }) {
  const meta = data.brand_variant_id ? variantMeta.get(data.brand_variant_id) : null
  const itemName = data.inventory_item_brand_variants?.inventory_items?.name_en ?? meta?.itemName ?? '—'
  const brand = data.inventory_item_brand_variants?.brand ?? meta?.brand
  const origin = meta?.origin ?? null

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
              <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
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
          <p className="text-sm font-semibold">{itemName}{brand ? ` — ${brand}` : ''}{origin ? ` · ${origin}` : ''}</p>
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

function LandedCostView({ data }: { data: LandedCostData }) {
  return (
    <div className="px-6 pt-6 pb-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Receipt className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{data.lc_number}</h3>
            <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
              {data.status?.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Landed Cost</p>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-4">
        <MetaRow icon={<Receipt className="h-3.5 w-3.5 text-muted-foreground" />} label="Description" value={data.description ?? '—'} />
        <MetaRow icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />} label="Date" value={data.date ? format(new Date(data.date), 'dd MMM yyyy') : data.created_at ? format(new Date(data.created_at), 'dd MMM yyyy') : '—'} />
        <div className="rounded-lg border px-3 py-2.5 text-center col-span-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Total Amount</p>
          <p className="text-lg font-bold tabular-nums">
            {data.total_amount != null
              ? `${data.currency ?? 'QAR'} ${Number(data.total_amount).toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Sale Return ────────────────────────────────────────────────────────────

function SaleReturnView({ data }: { data: SaleReturnData }) {
  const items = Array.isArray(data.return_lines) ? data.return_lines : []
  const customer = data.sale_orders?.customers?.name ?? '—'
  const soNumber = data.sale_orders?.so_number ?? '—'
  const totalQty = items.reduce((s, l) => s + (l.qty ?? 0), 0)
  const damagedQty = items.filter((l) => l.condition === 'damaged').reduce((s, l) => s + (l.qty ?? 0), 0)
  const statusLabel = (data.status ?? '').replace(/_/g, ' ')
  return (
    <div className="px-6 pt-6 pb-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
          <ClipboardList className="h-5 w-5 text-destructive" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold font-mono">{data.return_number}</h3>
            <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
              {statusLabel}
            </Badge>
            {damagedQty > 0 && (
              <Badge className="text-[10px] px-2 py-0.5 bg-destructive/10 text-destructive border-destructive/20">
                {damagedQty} damaged
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Sale Return · {soNumber} · {customer}</p>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-4">
        <MetaRow icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />} label="Date" value={data.date ? format(new Date(data.date), 'dd MMM yyyy') : '—'} />
        <MetaRow icon={<Warehouse className="h-3.5 w-3.5 text-muted-foreground" />} label="Restock Warehouse" value={data.restock_warehouse_name ?? '—'} />
        {data.reason && (
          <div className="col-span-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Reason</p>
            <p className="text-sm">{data.reason}</p>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Return Lines · {totalQty} unit{totalQty !== 1 ? 's' : ''}
            </p>
            <div className="rounded-md border overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_90px] gap-2 px-4 py-2 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span>Condition</span>
              </div>
              {items.map((l) => (
                <div key={l.id} className="grid grid-cols-[1fr_80px_90px] gap-2 px-4 py-2 border-t text-xs items-center">
                  <div className="min-w-0">
                    <div className="break-words">{l.item_name}</div>
                    {l.sku && <div className="text-[10px] text-muted-foreground">{l.sku}</div>}
                  </div>
                  <span className="text-right tabular-nums">{l.qty}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium w-fit ${
                    l.condition === 'good'       ? 'bg-green-100 text-green-700' :
                    l.condition === 'damaged'    ? 'bg-red-100 text-red-700' :
                    l.condition === 'inspection' ? 'bg-purple-100 text-purple-700' :
                                                   'bg-muted text-muted-foreground'
                  }`}>{l.condition ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Consumption ────────────────────────────────────────────────────────────

function ConsumptionView({ data, variantMeta }: { data: ConsumptionData; variantMeta: Map<string, VariantMeta> }) {
  const items = Array.isArray(data.items) ? data.items : []
  const isProject = !!data.consumer?.projects
  const consumerLabel = data.consumer?.projects
    ? `${data.consumer.projects.project_number}${data.consumer.disciplines ? ' · ' + data.consumer.disciplines.name : ''}`
    : (data.consumer?.name ?? (data.consumer_type === 'internal' ? 'Internal' : '—'))
  const totalQty = items.reduce((s, i) => s + Math.abs(i.qty ?? 0), 0)

  return (
    <>
      <div className="px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center flex-shrink-0">
            <PackageMinus className="h-5 w-5 text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold">{data.ce_number ?? 'Consumption'}</h3>
              {data.status && (
                <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status] ?? 'bg-muted text-muted-foreground'}`}>
                  {data.status.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{isProject ? 'Project Consumption' : 'Internal Consumption'}</p>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <MetaRow icon={<Boxes className="h-3.5 w-3.5 text-muted-foreground" />} label={isProject ? 'Project · Discipline' : 'Consumer'} value={consumerLabel} />
          <MetaRow icon={<Flag className="h-3.5 w-3.5 text-muted-foreground" />} label="Milestone" value={data.milestone?.label ?? '—'} />
          <MetaRow icon={<Warehouse className="h-3.5 w-3.5 text-muted-foreground" />} label="Source" value={data.source?.name ?? '—'} />
          <MetaRow icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />} label="Date" value={data.date ? format(new Date(data.date), 'dd MMM yyyy') : '—'} />
        </div>

        {data.notes && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-muted-foreground break-words">{data.notes}</p>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="px-6 pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Consumed Items · {totalQty} unit{totalQty !== 1 ? 's' : ''}
          </p>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-[1fr_80px] gap-2 px-4 py-2 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Item</span>
              <span className="text-right">Qty</span>
            </div>
            <div className="max-h-[220px] overflow-y-auto divide-y">
              {items.map((i, idx) => {
                const meta = i.brand_variant_id ? variantMeta.get(i.brand_variant_id) : null
                return (
                  <div key={idx} className="grid grid-cols-[1fr_80px] gap-2 px-4 py-2.5 items-center">
                    <ItemTreeCell
                      category={meta?.categoryName}
                      subcategory={meta?.subcategoryName}
                      itemType={meta?.itemType}
                      itemName={meta?.itemName ?? i.item_name ?? '—'}
                      brand={meta?.brand}
                      origin={meta?.origin ?? null}
                      sku={i.sku}
                      showSku
                    />
                    <span className="text-sm text-right tabular-nums font-medium">{Math.abs(i.qty ?? 0)}</span>
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

// ─── Inventory Check ────────────────────────────────────────────────────────

function InventoryCheckView({ data }: { data: InventoryCheckData }) {
  return (
    <div className="px-6 pt-6 pb-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <ClipboardCheck className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{data.check_number}</h3>
            <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[data.status ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
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
