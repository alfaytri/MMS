'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFifoLayers } from '@/hooks/useInventory'
import { useReceival } from '@/hooks/useReceivals'
import { ReceivalDetailDialog } from '@/components/purchase/ReceivalDetailDialog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

export function FifoLayersTable({ brandVariantId }: { brandVariantId: string }) {
  const { data: layers = [], isLoading } = useFifoLayers(brandVariantId, true)
  const [viewingReceivalId, setViewingReceivalId] = useState<string | null>(null)
  const { data: receivalDetail } = useReceival(viewingReceivalId)

  return (
    <div className="rounded border border-border bg-muted overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted">
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground">SOURCE</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground">WAREHOUSE</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground">DATE</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">QTY IN</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">REMAINING</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">UNIT COST</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">LANDED</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">TOTAL/UNIT</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <>
              {[0, 1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-3 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-10 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-10 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-12 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-16 ml-auto" /></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))}
            </>
          )}
          {!isLoading && layers.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-[11px] text-muted-foreground py-4">
                No cost layers recorded
              </TableCell>
            </TableRow>
          )}
          {!isLoading &&
            layers.map((layer) => {
              const isInventoryReceival = typeof layer.receival_number === 'string' && layer.receival_number.startsWith('INV-')
              return (
                <TableRow key={layer.id} className="text-xs">
                  <TableCell className="font-mono text-[11px]">
                    {layer.receival_number
                      ? isInventoryReceival
                        ? <span className="text-purple-600 font-semibold">{layer.receival_number}</span>
                        : layer.receival_number
                      : layer.source_type === 'sale_return' ? <span className="text-emerald-600">Sale Return</span>
                      : layer.source_type === 'po_return' ? <span className="text-red-600">PO Return</span>
                      : layer.source_type === 'adjustment' ? <span className="text-amber-600">Adjustment</span>
                      : layer.source_type === 'transfer' ? <span className="text-blue-600">Transfer</span>
                      : layer.source_type === 'delivery_cancel' ? <span className="text-red-600">DEL Cancel</span>
                      : layer.source_type === 'stock_check' ? <span className="text-purple-600">Stock Check</span>
                      : layer.source_type === 'gap_fill' ? <span className="text-muted-foreground">Gap Fill</span>
                      : layer.source_type === 'damaged_repair_return' ? <span className="text-orange-600">Return from Repair</span>
                      : <span className="text-muted-foreground">Manual</span>}
                  </TableCell>
                  <TableCell className="text-[11px]">
                    {layer.warehouse_name ? (
                      <div className="flex flex-col leading-tight">
                        <span>{layer.warehouse_name}</span>
                        {layer.sub_container_name && (
                          <span className="text-[10px] text-muted-foreground">{layer.sub_container_name}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
                  <TableCell className="text-right w-10">
                    {layer.receival_id ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setViewingReceivalId(layer.receival_id)}
                        aria-label="View receival"
                        title="View receival"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
        </TableBody>
      </Table>

      <ReceivalDetailDialog
        receival={viewingReceivalId ? receivalDetail ?? null : null}
        onClose={() => setViewingReceivalId(null)}
      />
    </div>
  )
}
