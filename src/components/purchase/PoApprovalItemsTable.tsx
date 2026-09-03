// src/components/purchase/PoApprovalItemsTable.tsx
'use client'

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ItemLabel } from '@/components/shared/ItemLabel'
import { useVariantItemMeta } from '@/hooks/useVariantCategoryPaths'
import { formatCurrency } from '@/lib/utils/formatters'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import type { PurchaseOrder } from '@/hooks/usePurchaseOrders'

/**
 * PO line items for the approvals surface, rendered with the app-wide
 * <ItemLabel> so each row shows its Tag > Category > … > Leaf tree, brand, and
 * origin — the same block every other item surface uses.
 *
 * The name prefers the line's denormalized `item_name`; when that snapshot is
 * blank (a known data gap from the pre-hardening edit path) it falls back to the
 * variant's canonical name so the row is never anonymous.
 */
export function PoApprovalItemsTable({ po }: { po: PurchaseOrder }) {
  const lines = po.po_line_items ?? []
  const variantIds = lines
    .map((li) => li.brand_variant_id)
    .filter((id): id is string => !!id)
  const metaMap = useVariantItemMeta(variantIds)

  if (lines.length === 0) return null

  const showQar =
    po.currency !== 'QAR' && po.exchange_rate != null && po.exchange_rate !== 1

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((li, i) => {
            const meta = li.brand_variant_id ? metaMap.get(li.brand_variant_id) : null
            const resolvedName = li.item_name?.trim() || meta?.name || null
            return (
              <TableRow key={li.id} className={STAGGER_IN} style={staggerDelay(i)}>
                <TableCell className="text-sm align-top">
                  <ItemLabel
                    meta={meta}
                    name={
                      resolvedName ?? (
                        <span className="italic text-muted-foreground">Unnamed item</span>
                      )
                    }
                    nameClassName="font-medium"
                  />
                </TableCell>
                <TableCell className="text-right text-sm align-top">{li.qty}</TableCell>
                <TableCell className="text-right text-sm font-medium align-top">
                  <div className="flex flex-col items-end leading-tight">
                    <span>{formatCurrency(li.total_price, po.currency)}</span>
                    {showQar && (
                      <span className="text-[10px] font-normal text-muted-foreground/70">
                        ≈ {formatCurrency(li.total_price * po.exchange_rate, 'QAR')}
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
