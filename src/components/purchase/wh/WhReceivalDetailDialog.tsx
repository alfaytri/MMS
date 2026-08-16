'use client'

import { useMemo } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Package, Truck, Calendar, Warehouse, User, Boxes } from 'lucide-react'
import { ItemTreeCell } from './ItemTreeCell'
import { ReceivalDelivery, useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { shortenSubContainerName } from '@/hooks/useWarehouseSubContainers'
import { format } from 'date-fns'

const STATUS_STYLES: Record<string, string> = {
  approved:         'bg-success/10 text-success border-success/20',
  delivered:        'bg-success/10 text-success border-success/20',
  pending:          'bg-warning/10 text-warning border-warning/20',
  pending_approval: 'bg-warning/10 text-warning border-warning/20',
  dispatched:       'bg-primary/10 text-primary border-primary/20',
}

interface Props {
  item: ReceivalDelivery | null
  onClose: () => void
}

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

export function WhReceivalDetailDialog({ item, onClose }: Props) {
  const { data: fullStock = [] } = useWarehouseStock()

  const variantMeta = useMemo(() => {
    const map = new Map<string, { categoryName: string | null; subcategoryName: string | null; itemType: string | null; itemName: string; brand: string | null; origin: string | null }>()
    for (const s of fullStock) {
      if (!map.has(s.brand_variant_id)) {
        map.set(s.brand_variant_id, { categoryName: s.category_name ?? null, subcategoryName: s.subcategory_name ?? null, itemType: s.item_type ?? null, itemName: s.item_name, brand: s.brand ?? null, origin: s.country_name ?? null })
      }
    }
    return map
  }, [fullStock])

  if (!item) return null
  const isInbound = item.direction === 'inbound'
  const subLabel = item.subContainerNames.length === 0
    ? '—'
    : item.subContainerNames.map((n) => shortenSubContainerName(n, item.warehouseName)).join(' · ')

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        <div className="px-6 pt-6 pb-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isInbound ? 'bg-success/10' : 'bg-destructive/10'}`}>
              {isInbound
                ? <Package className="h-5 w-5 text-success" />
                : <Truck className="h-5 w-5 text-destructive" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">{item.docNumber}</h3>
                <Badge className={`text-[10px] px-2 py-0.5 capitalize ${STATUS_STYLES[item.status] ?? 'bg-muted text-muted-foreground'}`}>
                  {item.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isInbound ? 'PO Receival' : 'Sale Delivery'}{item.reference ? ` — ${item.reference}` : ''}
              </p>
            </div>
          </div>

          <Separator />

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-4">
            {item.counterparty && (
              <MetaRow
                icon={<User className="h-3.5 w-3.5 text-muted-foreground" />}
                label={isInbound ? 'Supplier' : 'Customer'}
                value={item.counterparty}
              />
            )}
            <MetaRow
              icon={<Warehouse className="h-3.5 w-3.5 text-muted-foreground" />}
              label="Warehouse"
              value={item.warehouseName || '—'}
            />
            <MetaRow
              icon={<Boxes className="h-3.5 w-3.5 text-muted-foreground" />}
              label="Sub-container"
              value={subLabel}
            />
            <MetaRow
              icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />}
              label="Date"
              value={item.date ? format(new Date(item.date), 'dd MMM yyyy') : '—'}
            />
            <MetaRow
              icon={<Package className="h-3.5 w-3.5 text-muted-foreground" />}
              label="Items"
              value={`${item.itemCount} item${item.itemCount !== 1 ? 's' : ''}`}
            />
          </div>
        </div>

        {/* Items table */}
        {item.items.length > 0 && (
          <div className="px-6 pb-6">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {isInbound ? 'Received Items' : 'Delivered Items'}
            </p>
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-[1fr_80px] gap-2 px-4 py-2 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Item</span>
                <span className="text-right">Qty</span>
              </div>
              <div className="max-h-[220px] overflow-y-auto divide-y">
                {item.items.map((i, idx) => {
                  const meta = i.brand_variant_id ? variantMeta.get(i.brand_variant_id) : null
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_80px] gap-2 px-4 py-2.5 items-center">
                      <ItemTreeCell
                        category={meta?.categoryName}
                        subcategory={meta?.subcategoryName}
                        itemType={meta?.itemType}
                        itemName={meta?.itemName ?? i.name}
                        brand={meta?.brand}
                        origin={meta?.origin ?? null}
                        sku={i.sku}
                        showSku
                      />
                      <span className="text-sm text-right tabular-nums font-medium">{i.qty}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
