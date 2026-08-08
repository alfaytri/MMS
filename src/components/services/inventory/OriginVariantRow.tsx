'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Pencil, Archive, PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { FifoLayersTable } from './FifoLayersTable'
import { BrandVariantEditDialog } from './BrandVariantEditDialog'
import { InventoryReceivalDialog } from '@/components/inventory/InventoryReceivalDialog'
import { useArchiveInventoryBrandVariant, useVariantWarehouseStock, type BrandVariant } from '@/hooks/useInventory'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useCanCreateInventoryReceivals } from '@/hooks/useInventoryReceivals'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { formatCurrency } from '@/lib/utils/formatters'

// The row-level shape: a DB BrandVariant plus the denormalized brand/origin
// labels carried in from the grouped fetch (`useInventoryBrandVariants` embeds
// `brands(name)` and `country_codes(name, flag, iso)` — ItemRow flattens those
// into these optional fields before grouping).
export type OriginVariant = BrandVariant & {
  brand_name?: string | null
  country_name?: string | null
  country_flag?: string | null
}

// Total header columns in the variant sub-table (ORIGIN, CODE, AVG COST,
// SELLING PRICE, RESERVED, AVAILABLE, INCOMING, ACTIONS). Defined here (a
// leaf module with no dependency on ItemRow/BrandGroupRow) and imported by
// ItemRow for its empty-state colSpan, so the header, the FIFO-expand row
// below, and the empty-state row can never desync. Deliberately NOT defined
// in ItemRow.tsx: ItemRow → BrandGroupRow → OriginVariantRow already forms an
// import chain, and importing back from ItemRow here would close a 3-file
// circular import — safe in some bundlers' live-binding ESM output, but
// unverifiable without running `next build`/`next dev` (out of scope for
// this task), so it's not a risk worth taking for a single shared constant.
export const VARIANT_COLUMN_COUNT = 8

type Props = {
  variant: OriginVariant
  itemId: string
  itemName: string
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

function AtpBadge({ stockLevel, reservedQty, reorderPoint }: { stockLevel: number; reservedQty: number; reorderPoint: number }) {
  const atp = stockLevel - reservedQty
  let color = 'bg-green-100 text-green-700'
  if (atp <= 0) color = 'bg-red-100 text-red-700'
  else if (atp <= reorderPoint) color = 'bg-amber-100 text-amber-700'

  return (
    <span
      title={`${stockLevel} On Hand · ${reservedQty} Reserved`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium cursor-default ${color}`}
    >
      {atp}
    </span>
  )
}

function WarehouseStockTooltip({
  variantId,
  disabled,
  children,
}: {
  variantId: string
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) return <>{children}</>
  return <WarehouseStockTooltipInner variantId={variantId}>{children}</WarehouseStockTooltipInner>
}

function WarehouseStockTooltipInner({
  variantId,
  children,
}: {
  variantId: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { data: warehouses = [], isLoading: warehousesLoading } = useWarehouses()
  const { data: whStock, isLoading } = useVariantWarehouseStock(variantId, open)

  const rows = whStock?.perWarehouse ?? []
  const unassigned = whStock?.unassigned ?? 0
  const total = rows.reduce((s, r) => s + r.qty, 0) + unassigned

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" className="p-0">
          <div className="min-w-[160px] max-h-60 overflow-y-auto px-3 py-2 text-xs">
            {isLoading || warehousesLoading ? (
              <div className="py-0.5 opacity-70">Loading…</div>
            ) : total === 0 ? (
              <div className="py-0.5 opacity-70">No stock data</div>
            ) : (
              <>
                {rows.map((r) => {
                  const wh = warehouses.find((w) => w.id === r.warehouse_id)
                  return (
                    <div key={r.warehouse_id} className="flex justify-between gap-4 py-0.5">
                      <span>{wh?.name ?? 'Unknown'}</span>
                      <span className="font-medium tabular-nums">{r.qty}</span>
                    </div>
                  )
                })}
                {unassigned > 0 && (
                  <div className="flex justify-between gap-4 py-0.5 opacity-70">
                    <span>Unassigned</span>
                    <span className="font-medium tabular-nums">{unassigned}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4 pt-1 mt-0.5 border-t border-primary-foreground/20">
                  <span>Total</span>
                  <span className="font-medium tabular-nums">{total}</span>
                </div>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function OriginVariantRow({ variant, itemId, itemName, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: Props) {
  // Primary row label is the ORIGIN (country), never a raw id — em dash when
  // the leaf carries no origin (e.g. a brand-only variant).
  const originLabel = variant.country_name
    ? `${variant.country_flag ?? ''} ${variant.country_name}`.trim()
    : '—'
  // Fuller "brand — origin" label for contexts outside the row (receival
  // dialog title, archive confirmation) where the brand is no longer visible
  // inline — the row itself now lives under a brand group header.
  const brandLabel = variant.brand_name
    ?? ((!variant.brand || variant.brand.toLowerCase() === 'generic') ? itemName : variant.brand)
  const fullLabel = variant.country_name ? `${brandLabel} — ${originLabel}` : brandLabel

  const [fifoOpen, setFifoOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [invReceivalOpen, setInvReceivalOpen] = useState(false)
  const archive = useArchiveInventoryBrandVariant()
  const { data: canCreateInvRcv = false } = useCanCreateInventoryReceivals()

  const stockLevel = variant.stock_level ?? 0
  const reservedQty = variant.reserved_qty ?? 0
  const reorderPoint = variant.reorder_point ?? 0
  const incoming = variant.incoming ?? 0
  const damagedQty = variant.damaged_qty ?? 0

  return (
    <>
      <TableRow
        className="min-h-11 text-xs cursor-pointer hover:bg-muted/30"
        onClick={() => setFifoOpen((v) => !v)}
      >
        <TableCell className="pl-6">
          <div className="flex items-center gap-1">
            {fifoOpen
              ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            }
            <button
              className="font-medium text-blue-600 hover:underline"
              onClick={(e) => { e.stopPropagation(); setEditOpen(true) }}
            >
              {originLabel}
            </button>
          </div>
        </TableCell>
        <TableCell className="font-mono text-[11px] hidden sm:table-cell">{variant.code ?? '—'}</TableCell>
        <TableCell className="text-right hidden md:table-cell">
          {variant.average_cost != null ? formatCurrency(variant.average_cost, 'QAR') : '—'}
        </TableCell>
        <TableCell className="text-right">
          {variant.selling_price != null ? formatCurrency(variant.selling_price, 'QAR') : '—'}
        </TableCell>
        <TableCell className="text-right">
          {reservedQty > 0 ? (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-orange-100 text-orange-700">
              {reservedQty}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            <WarehouseStockTooltip variantId={variant.id} disabled={stockLevel <= 0}>
              <AtpBadge stockLevel={stockLevel} reservedQty={reservedQty} reorderPoint={reorderPoint} />
            </WarehouseStockTooltip>
            <span
              title={`${damagedQty} damaged unit${damagedQty !== 1 ? 's' : ''} — not sellable`}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium cursor-default ${damagedQty > 0 ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}
            >
              {damagedQty} dmg
            </span>
          </div>
        </TableCell>
        <TableCell className="text-right text-[11px] hidden sm:table-cell">
          {incoming > 0 ? <span className="text-blue-600 font-medium">+{incoming}</span> : '—'}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {canCreateInvRcv && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0"
                      onClick={() => setInvReceivalOpen(true)}
                      aria-label="Create Inventory Receival"
                    >
                      <PackagePlus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Create Inventory Receival</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 min-h-11 min-w-11 md:min-h-6 md:min-w-6 hidden sm:inline-flex"
              disabled={!canMoveUp}
              onClick={() => onMoveUp()}
              aria-label="Move origin up"
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 min-h-11 min-w-11 md:min-h-6 md:min-w-6 hidden sm:inline-flex"
              disabled={!canMoveDown}
              onClick={() => onMoveDown()}
              aria-label="Move origin down"
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0"
              onClick={() => setEditOpen(true)}
              aria-label="Edit variant"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0 text-muted-foreground hover:text-destructive"
              onClick={() => setArchiveOpen(true)}
              aria-label="Archive variant"
            >
              <Archive className="h-3 w-3" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {fifoOpen && (
        <TableRow className="bg-muted/50 hover:bg-muted/50">
          <TableCell colSpan={VARIANT_COLUMN_COUNT} className="py-2 px-4">
            <FifoLayersTable brandVariantId={variant.id} />
          </TableCell>
        </TableRow>
      )}

      <BrandVariantEditDialog open={editOpen} onOpenChange={setEditOpen} itemId={itemId} variant={variant} />

      <InventoryReceivalDialog
        open={invReceivalOpen}
        onOpenChange={setInvReceivalOpen}
        brandVariantId={variant.id}
        variantLabel={fullLabel}
        variantCode={variant.code ?? '—'}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Brand Variant"
        description={`Archive "${fullLabel}"? It will be hidden from the inventory view.`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() =>
          archive.mutate(variant.id, {
            onSuccess: () => { toast.success('Variant archived'); setArchiveOpen(false) },
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </>
  )
}
