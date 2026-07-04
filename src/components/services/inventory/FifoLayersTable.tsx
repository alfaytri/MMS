'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFifoLayers } from '@/hooks/useInventory'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

export function FifoLayersTable({ brandVariantId }: { brandVariantId: string }) {
  const { data: layers = [], isLoading } = useFifoLayers(brandVariantId, true)

  return (
    <div className="rounded border border-border bg-muted overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted">
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground">SOURCE</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground">DATE</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">QTY IN</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">REMAINING</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">UNIT COST</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">LANDED</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">TOTAL/UNIT</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <>
              {[0, 1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-3 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3 w-10 ml-auto" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3 w-10 ml-auto" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3 w-16 ml-auto" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3 w-12 ml-auto" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3 w-16 ml-auto" />
                  </TableCell>
                </TableRow>
              ))}
            </>
          )}
          {!isLoading && layers.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-[11px] text-muted-foreground py-4">
                No cost layers recorded
              </TableCell>
            </TableRow>
          )}
          {!isLoading &&
            layers.map((layer) => (
              <TableRow key={layer.id} className="text-xs">
                <TableCell className="font-mono text-[11px]">
                  {layer.receival_number
                    ? layer.receival_number
                    : layer.source_type === 'adjustment' ? <span className="text-amber-600">Adjustment</span>
                    : layer.source_type === 'transfer' ? <span className="text-blue-600">Transfer</span>
                    : layer.source_type === 'delivery_cancel' ? <span className="text-red-600">DEL Cancel</span>
                    : layer.source_type === 'stock_check' ? <span className="text-purple-600">Stock Check</span>
                    : layer.source_type === 'gap_fill' ? <span className="text-muted-foreground">Gap Fill</span>
                    : <span className="text-muted-foreground">Manual</span>}
                </TableCell>
                <TableCell className="text-[11px]">{formatDate(layer.date)}</TableCell>
                <TableCell className="text-right text-[11px]">{layer.qty}</TableCell>
                <TableCell className="text-right">
                  <span
                    className={`text-[11px] font-medium ${layer.remaining_qty > 0 ? 'text-success' : 'text-muted-foreground'}`}
                  >
                    {layer.remaining_qty}
                  </span>
                </TableCell>
                <TableCell className="text-right text-[11px]">{formatCurrency(layer.unit_cost, 'QAR')}</TableCell>
                <TableCell className="text-right text-[11px]">
                  {layer.landed_cost_per_unit > 0 ? formatCurrency(layer.landed_cost_per_unit, 'QAR') : '—'}
                </TableCell>
                <TableCell className="text-right text-[11px] font-medium">
                  {formatCurrency(layer.total_unit_cost, 'QAR')}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  )
}
