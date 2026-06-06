'use client'

import { useState } from 'react'
import {
  ChevronRight, ChevronDown, ArrowUp, ArrowDown,
  Plus, Pencil, Archive, Eye, Info, Wrench, Package, GripVertical,
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/formatters'
import { type Service } from '@/hooks/useServices'
import { useSubmitServiceChange } from '@/hooks/useServiceChangeRequests'
import type { ReorderArgs } from './ServiceTree'

const LEVEL_COLORS: Record<number, string> = {
  0: 'bg-blue-100 text-blue-700',
  1: 'bg-green-100 text-green-700',
  2: 'bg-amber-100 text-amber-700',
}

const CONTRACT_TYPE_BADGES: Record<string, { label: string; className: string }> = {
  preventive: { label: 'PREVENTIVE', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  area: { label: 'AREA', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  general: { label: 'GENERAL', className: 'bg-amber-100 text-amber-700 border-amber-200' },
}

interface ContractTreeRowProps {
  service: Service
  depth: number
  isExpanded: boolean
  hasChildren: boolean
  hasDescendantPending?: boolean
  isFirst: boolean
  isLast: boolean
  treeType: string
  dragMode?: boolean
  divisionMap: Map<string, string>
  brandCountMap: Map<string, number>
  onToggleExpand: (id: string) => void
  onEdit: (node: Service) => void
  onView: (node: Service) => void
  onAddChild: (parentId: string) => void
  onReorder: (args: ReorderArgs) => void
  onShowHistory: (serviceId: string) => void
}

export function ContractTreeRow({
  service,
  depth,
  isExpanded,
  hasChildren,
  hasDescendantPending = false,
  isFirst,
  isLast,
  treeType,
  dragMode = false,
  divisionMap,
  brandCountMap,
  onToggleExpand,
  onEdit,
  onView,
  onAddChild,
  onReorder,
  onShowHistory,
}: ContractTreeRowProps) {
  const [archiveOpen, setArchiveOpen] = useState(false)
  const submitChange = useSubmitServiceChange()
  const isBranch = hasChildren

  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: service.id, disabled: !dragMode })

  const levelLabel = `L${depth + 1}`
  const levelColor = LEVEL_COLORS[Math.min(depth, 2)] ?? 'bg-muted text-foreground'

  const itemKind: string = service.item_kind ?? 'service'
  const contractType: string | null = service.contract_type ?? null
  const pricingMode: string = service.pricing_mode ?? 'by_condition'
  const discountScope: string = service.discount_scope ?? 'services_only'
  const brandCount = brandCountMap.get(service.id) ?? 0

  function handleArchiveConfirm() {
    submitChange.mutate(
      {
        service_id: service.id,
        change_type: 'delete' as const,
        changes: { deleted: { old: false, new: true } },
        division: Array.isArray(service.division) ? service.division : [],
        tree_type: treeType,
        parent_id: service.parent_id ?? null,
      },
      {
        onSuccess: (result) => {
          toast.success(result.action === 'applied' ? `"${service.name_en}" archived` : 'Archive request submitted for approval')
          setArchiveOpen(false)
        },
        onError: (e) => {
          toast.error(e.message || 'Failed to archive service')
          setArchiveOpen(false)
        },
      },
    )
  }

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    position: isDragging ? 'relative' as const : undefined,
    zIndex: isDragging ? 50 : undefined,
  }

  function renderPricingMode() {
    if (itemKind === 'product') return <span className="text-[11px] text-muted-foreground/40">—</span>
    if (contractType === 'preventive') {
      return pricingMode === 'fixed'
        ? <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-orange-50 text-orange-600 border-orange-200">Fixed Price</Badge>
        : <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-muted text-muted-foreground border-border">By Condition</Badge>
    }
    if (contractType === 'area') {
      const unit = service.price_unit || 'unit'
      return <span className="text-[10px] text-muted-foreground">Per {unit}</span>
    }
    if (contractType === 'general') {
      return <span className="text-[10px] text-muted-foreground">Discount</span>
    }
    return <span className="text-[11px] text-muted-foreground/40">—</span>
  }

  function renderPrice() {
    if (contractType === 'general' && service.discount != null) {
      return (
        <div>
          <div className="text-xs font-semibold">{service.discount}%</div>
          <div className="text-[9px] text-muted-foreground">
            {discountScope === 'services_and_products' ? '+ products' : 'services only'}
          </div>
        </div>
      )
    }
    if (service.price != null) {
      return <div className="text-xs font-semibold">{formatCurrency(service.price)} QAR</div>
    }
    return <span className="text-[11px] text-muted-foreground/40">—</span>
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={sortableStyle}
        className={cn(
          'flex items-center min-h-[40px] border-b border-border/50 hover:bg-muted/30',
          isBranch ? 'cursor-pointer bg-muted/20' : 'cursor-default',
          isDragging && 'bg-primary/5 border-primary/30',
        )}
        onClick={() => { if (isBranch) onToggleExpand(service.id) }}
      >
        {/* Drag handle */}
        {dragMode && (
          <div
            {...attributes}
            {...listeners}
            className="w-8 shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}

        {/* 1. Order — w-10 */}
        <div className="w-10 flex flex-col items-center justify-center gap-0 shrink-0">
          {isFirst && isLast ? (
            <span className="text-[10px] text-muted-foreground select-none">—</span>
          ) : (
            <>
              <Button variant="ghost" size="icon" className="h-4 w-4 p-0 disabled:opacity-30" disabled={isFirst}
                onClick={(e) => { e.stopPropagation(); onReorder({ movedId: service.id, parentId: service.parent_id ?? null, direction: 'up', treeType }) }}>
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-4 w-4 p-0 disabled:opacity-30" disabled={isLast}
                onClick={(e) => { e.stopPropagation(); onReorder({ movedId: service.id, parentId: service.parent_id ?? null, direction: 'down', treeType }) }}>
                <ArrowDown className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>

        {/* 2. Service — w-[350px] */}
        <div className="w-[350px] flex items-center gap-1.5 min-w-0 shrink-0" style={{ paddingLeft: 12 + depth * 20 }}>
          <button type="button" className="w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); if (isBranch) onToggleExpand(service.id) }}>
            {isBranch ? (isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : null}
          </button>
          <Badge className={cn('text-[9px] px-1 py-0 h-4 shrink-0 border-0', levelColor)}>{levelLabel}</Badge>
          <div className="min-w-0 flex-1">
            <div className={cn('text-sm truncate text-foreground leading-tight flex items-center gap-1', isBranch ? 'font-semibold' : 'font-medium')}>
              {service.name_en}
              {service.has_pending_change && <span className="h-2 w-2 rounded-full bg-orange-500 shrink-0" title="Change pending approval" />}
              {!isExpanded && hasDescendantPending && !service.has_pending_change && (
                <span className="h-2 w-2 rounded-full border border-orange-500 bg-orange-500/30 shrink-0" title="Child service has pending change" />
              )}
            </div>
            {service.name_ar && <div className="text-xs truncate text-muted-foreground leading-tight">{service.name_ar}</div>}
          </div>
        </div>

        {/* 3. Kind — w-[90px] */}
        <div className="w-[90px] shrink-0 px-2 flex items-center gap-1">
          {itemKind === 'product' ? (
            <>
              <Package className="h-3 w-3 text-amber-600" />
              <span className="text-[10px] text-amber-600">Product</span>
            </>
          ) : (
            <>
              <Wrench className="h-3 w-3 text-blue-600" />
              <span className="text-[10px] text-blue-600">Service</span>
            </>
          )}
        </div>

        {/* 4. Type — w-[110px] */}
        <div className="w-[110px] shrink-0 px-2">
          {itemKind === 'product' ? (
            <span className="text-[11px] text-muted-foreground/40">—</span>
          ) : contractType && CONTRACT_TYPE_BADGES[contractType] ? (
            <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-4', CONTRACT_TYPE_BADGES[contractType].className)}>
              {CONTRACT_TYPE_BADGES[contractType].label}
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">—</span>
          )}
        </div>

        {/* 5. Division — w-[100px] */}
        <div className="w-[100px] shrink-0 px-2 flex flex-wrap gap-0.5">
          {Array.isArray(service.division) && service.division.length > 0
            ? service.division.map((slug: string) => (
                <Badge key={slug} variant="outline" className="text-[9px] px-1 py-0 h-4 border-muted-foreground/30 text-muted-foreground">
                  {divisionMap.get(slug) ?? slug}
                </Badge>
              ))
            : !isBranch ? <span className="text-[11px] text-muted-foreground/40">—</span> : null}
        </div>

        {/* 6. Pricing Mode — w-[120px] */}
        <div className="w-[120px] shrink-0 px-2">
          {!isBranch ? renderPricingMode() : null}
        </div>

        {/* 7. Price — w-[120px] */}
        <div className="w-[120px] shrink-0 px-2">
          {!isBranch ? renderPrice() : null}
        </div>

        {/* 8. Brands — w-[80px] */}
        <div className="w-[80px] shrink-0 px-2">
          {!isBranch && itemKind === 'service' && contractType === 'preventive' && depth === 0 && brandCount > 0 ? (
            <span className="text-[10px] text-muted-foreground">{brandCount} brand{brandCount !== 1 ? 's' : ''}</span>
          ) : !isBranch ? (
            <span className="text-[11px] text-muted-foreground/40">—</span>
          ) : null}
        </div>

        {/* 9. Status — w-[80px] */}
        <div className="w-[80px] shrink-0 px-2">
          {!isBranch && (
            <Badge variant="outline" className={cn(
              'text-[9px] px-1.5 py-0 h-4',
              service.status === 'active'
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-muted text-muted-foreground border-border',
            )}>
              {service.status === 'active' ? 'Active' : 'Inactive'}
            </Badge>
          )}
        </div>

        {/* 10. Actions — w-[116px] */}
        <div className="w-[116px] shrink-0 flex items-center justify-end gap-0.5 px-1">
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); onShowHistory(service.id) }}>
            <Info className="h-3.5 w-3.5 text-orange-500" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); onView(service) }}>
            <Eye className="h-3.5 w-3.5 text-sky-500" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); onAddChild(service.id) }}>
            <Plus className="h-3.5 w-3.5 text-primary" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); onEdit(service) }}>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" disabled={submitChange.isPending}
            onClick={(e) => { e.stopPropagation(); setArchiveOpen(true) }}>
            <Archive className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Archive confirmation */}
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Service</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive &ldquo;{service.name_en}&rdquo;? It will be deactivated and hidden from active lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleArchiveConfirm}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
