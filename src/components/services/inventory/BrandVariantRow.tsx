'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Pencil, Archive } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { FifoLayersTable } from './FifoLayersTable'
import { BrandVariantEditDialog } from './BrandVariantEditDialog'
import { ReservedOrdersDialog } from './ReservedOrdersDialog'
import { useArchiveInventoryBrandVariant, type BrandVariant } from '@/hooks/useInventory'
import { formatCurrency } from '@/lib/utils/formatters'

type Props = {
  variant: BrandVariant
  itemId: string
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

export function BrandVariantRow({ variant, itemId, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: Props) {
  const [fifoOpen, setFifoOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [reservedOpen, setReservedOpen] = useState(false)
  const archive = useArchiveInventoryBrandVariant()

  const stockLevel = variant.stock_level ?? 0
  const reservedQty = variant.reserved_qty ?? 0
  const reorderPoint = variant.reorder_point ?? 0
  const incoming = variant.incoming ?? 0
  const damagedQty = variant.damaged_qty ?? 0

  return (
    <>
      <TableRow
        className="text-xs cursor-pointer hover:bg-muted/30"
        onClick={() => setFifoOpen((v) => !v)}
      >
        <TableCell className="pl-4">
          <div className="flex items-center gap-1">
            {fifoOpen
              ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            }
            <button
              className="font-medium text-blue-600 hover:underline"
              onClick={(e) => { e.stopPropagation(); setEditOpen(true) }}
            >
              {variant.brand}
            </button>
          </div>
        </TableCell>
        <TableCell className="font-mono text-[11px]">{variant.code ?? '—'}</TableCell>
        <TableCell className="text-right">
          {variant.average_cost != null ? formatCurrency(variant.average_cost, 'QAR') : '—'}
        </TableCell>
        <TableCell className="text-right">
          {variant.selling_price != null ? formatCurrency(variant.selling_price, 'QAR') : '—'}
        </TableCell>
        <TableCell className="text-right">
          {reservedQty > 0 ? (
            <button
              title="Click to see which orders are holding this reservation"
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium cursor-pointer bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
              onClick={(e) => { e.stopPropagation(); setReservedOpen(true) }}
            >
              {reservedQty}
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            <AtpBadge stockLevel={stockLevel} reservedQty={reservedQty} reorderPoint={reorderPoint} />
            <span
              title={`${damagedQty} damaged unit${damagedQty !== 1 ? 's' : ''} — not sellable`}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium cursor-default ${damagedQty > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}
            >
              {damagedQty} dmg
            </span>
          </div>
        </TableCell>
        <TableCell className="text-right text-[11px]">
          {incoming > 0 ? <span className="text-blue-600 font-medium">+{incoming}</span> : '—'}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveUp} onClick={() => onMoveUp()}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveDown} onClick={() => onMoveDown()}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-3 w-3" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {fifoOpen && (
        <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
          <TableCell colSpan={8} className="py-2 px-4">
            <FifoLayersTable brandVariantId={variant.id} />
          </TableCell>
        </TableRow>
      )}

      <BrandVariantEditDialog open={editOpen} onOpenChange={setEditOpen} itemId={itemId} variant={variant} />

      <ReservedOrdersDialog
        open={reservedOpen}
        onOpenChange={setReservedOpen}
        brandVariantId={variant.id}
        variantLabel={variant.brand ?? 'Variant'}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Brand Variant"
        description={`Archive "${variant.brand}"? It will be hidden from the inventory view.`}
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
