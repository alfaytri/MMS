'use client'

import { useMemo } from 'react'
import { Eye, ChevronRight } from 'lucide-react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/formatters'
import type { Service } from '@/hooks/useServices'
import { buildTreeMap } from './ServiceTree'

const LEVEL_COLORS: Record<number, string> = {
  0: 'bg-blue-100 text-blue-700',
  1: 'bg-green-100 text-green-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-purple-100 text-purple-700',
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  root: Service | null
  allServices: Service[]
}

export function ServiceViewSheet({ open, onOpenChange, root, allServices }: Props) {
  const treeMap = useMemo(() => buildTreeMap(allServices), [allServices])

  function renderNode(service: Service, depth: number): React.ReactNode {
    const children = treeMap.get(service.id) ?? []
    const isBranch = children.length > 0
    const levelColor = LEVEL_COLORS[Math.min(depth, 3)] ?? 'bg-slate-100 text-slate-700'

    return (
      <div key={service.id}>
        <div
          className={cn(
            'flex items-center gap-2 py-2 border-b border-border/40',
            isBranch && 'bg-muted/30',
          )}
          style={{ paddingLeft: 12 + depth * 20 }}
        >
          <Badge className={cn('text-[9px] px-1 py-0 h-4 shrink-0 border-0', levelColor)}>
            L{depth + 1}
          </Badge>
          {isBranch && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className={cn('text-sm truncate', isBranch ? 'font-semibold' : 'font-medium')}>
              {service.name_en}
            </div>
            {service.name_ar && (
              <div className="text-xs text-muted-foreground truncate">{service.name_ar}</div>
            )}
          </div>
          {!isBranch && service.price != null && (
            <span className="text-xs font-semibold text-foreground shrink-0 pr-2">
              {formatCurrency(service.price)} QAR
              {service.price_unit && (
                <span className="font-normal text-muted-foreground"> / {service.price_unit}</span>
              )}
            </span>
          )}
        </div>
        {children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  const children = root ? (treeMap.get(root.id) ?? []) : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <SheetTitle className="text-base">
              {root?.name_en ?? 'Services'}
            </SheetTitle>
          </div>
          {root?.name_ar && (
            <p className="text-sm text-muted-foreground">{root.name_ar}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {children.length} direct sub-item{children.length !== 1 ? 's' : ''}
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {children.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No sub-services
            </div>
          ) : (
            children.map((child) => renderNode(child, 0))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
