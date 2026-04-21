// src/components/services/ServiceTreeRow.tsx
'use client'

import { useState } from 'react'
import {
  ChevronRight, ChevronDown, ArrowUp, ArrowDown,
  Plus, Pencil, Settings2, Bell, Shield, Clock, Archive, Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/formatters'
import { useArchiveService, type Service } from '@/hooks/useServices'
import type { ReorderArgs } from './ServiceTree'

const LEVEL_COLORS: Record<number, string> = {
  0: 'bg-blue-100 text-blue-700',
  1: 'bg-green-100 text-green-700',
  2: 'bg-amber-100 text-amber-700',
}

interface ServiceTreeRowProps {
  service: Service
  depth: number
  isExpanded: boolean
  hasChildren: boolean
  isFirst: boolean
  isLast: boolean
  treeType: string
  onToggleExpand: (id: string) => void
  onEdit: (node: Service) => void
  onAddChild: (parentId: string) => void
  onReorder: (args: ReorderArgs) => void
}

export function ServiceTreeRow({
  service,
  depth,
  isExpanded,
  hasChildren,
  isFirst,
  isLast,
  treeType,
  onToggleExpand,
  onEdit,
  onAddChild,
  onReorder,
}: ServiceTreeRowProps) {
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archiveService = useArchiveService()
  const isBranch = hasChildren
  const levelLabel = `L${depth + 1}`
  const levelColor = LEVEL_COLORS[Math.min(depth, 2)] ?? 'bg-slate-100 text-slate-700'

  function handleRowClick() {
    if (isBranch) {
      onToggleExpand(service.id)
    } else {
      onEdit(service)
    }
  }

  function handleArchiveConfirm() {
    archiveService.mutate(
      { id: service.id, treeType },
      {
        onSuccess: () => {
          toast.success(`"${service.name_en}" archived`)
          setArchiveOpen(false)
        },
        onError: () => {
          toast.error('Failed to archive service')
          setArchiveOpen(false)
        },
      },
    )
  }

  return (
    <>
      <div
        className={cn(
          'flex items-center min-h-[40px] border-b border-border/50 hover:bg-muted/30 cursor-pointer',
          isBranch && 'bg-muted/20',
        )}
        onClick={handleRowClick}
      >
        {/* 1. Order — w-10 */}
        <div className="w-10 flex flex-col items-center justify-center gap-0 shrink-0">
          {isFirst && isLast ? (
            <span className="text-[10px] text-muted-foreground select-none">—</span>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 disabled:opacity-30"
                disabled={isFirst}
                aria-label="Move up"
                onClick={(e) => {
                  e.stopPropagation()
                  onReorder({ movedId: service.id, parentId: service.parent_id ?? null, direction: 'up', treeType })
                }}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 disabled:opacity-30"
                disabled={isLast}
                aria-label="Move down"
                onClick={(e) => {
                  e.stopPropagation()
                  onReorder({ movedId: service.id, parentId: service.parent_id ?? null, direction: 'down', treeType })
                }}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>

        {/* 2. Service — w-[260px] */}
        <div
          className="w-[260px] flex items-center gap-1 min-w-0 shrink-0"
          style={{ paddingLeft: 12 + depth * 20 }}
        >
          <span className="w-4 h-4 flex items-center justify-center shrink-0">
            {isBranch
              ? isExpanded
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              : null}
          </span>
          <Badge className={cn('text-[9px] px-1 py-0 h-4 shrink-0 border-0', levelColor)}>
            {levelLabel}
          </Badge>
          {service.service_type === 'configurable' && (
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 h-4 gap-0.5 text-primary border-primary shrink-0"
            >
              <Settings2 className="h-2 w-2" />Config
            </Badge>
          )}
          <div className="min-w-0 flex-1">
            <div className={cn('text-xs truncate text-foreground', isBranch ? 'font-semibold' : 'font-normal')}>
              {service.name_en}
            </div>
            {service.name_ar && (
              <div className="text-[10px] truncate text-muted-foreground">{service.name_ar}</div>
            )}
          </div>
        </div>

        {/* 3. Invoice Text — w-[200px] */}
        <div className="w-[200px] shrink-0 px-2">
          {!isBranch && (service.invoice_text_en || service.invoice_text_ar) ? (
            <>
              <div className="text-[11px] truncate text-foreground">{service.invoice_text_en ?? '—'}</div>
              <div className="text-[10px] truncate text-muted-foreground">{service.invoice_text_ar ?? ''}</div>
            </>
          ) : !isBranch ? (
            <span className="text-[11px] text-muted-foreground/40">—</span>
          ) : null}
        </div>

        {/* 4. Pricing / Unit — w-[160px] */}
        <div className="w-[160px] shrink-0 px-2">
          {!isBranch && (
            service.service_type === 'configurable' ? (
              <div className="flex items-center gap-1 text-[11px] text-primary">
                <Settings2 className="h-3 w-3" />Configurable
              </div>
            ) : service.price != null ? (
              <div>
                <div className="text-xs font-semibold">
                  Reg: {formatCurrency(service.price)} QAR
                </div>
                {service.price_unit && (
                  <div className="text-[9px] text-muted-foreground">/ {service.price_unit}</div>
                )}
                {service.emergency_price != null && (
                  <div className="text-[11px] text-destructive">
                    Emg: {formatCurrency(service.emergency_price)} QAR
                  </div>
                )}
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground/40">—</span>
            )
          )}
        </div>

        {/* 5. Reminders — w-[100px] */}
        <div className="w-[100px] shrink-0 px-2">
          {!isBranch && service.reminder_days != null ? (
            <div className="flex items-center gap-1 text-[11px]">
              <Bell className="h-3 w-3 text-yellow-500" />
              {service.reminder_days}d
            </div>
          ) : !isBranch ? (
            <span className="text-[11px] text-muted-foreground/40">—</span>
          ) : null}
        </div>

        {/* 6. Details — w-[130px] */}
        <div className="w-[130px] shrink-0 px-2 flex items-center gap-1.5">
          {!isBranch && (
            <>
              <div className={cn(
                'flex items-center gap-0.5 text-[10px]',
                service.warranty ? 'text-foreground' : 'text-muted-foreground/40',
              )}>
                <Shield className="h-3 w-3" />{service.warranty ?? 0}m
              </div>
              <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground w-[38px]">
                <Clock className="h-3 w-3" />{service.duration ?? 0}m
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px] px-1 py-0 h-3.5 gap-0.5',
                  service.spare_parts
                    ? 'border-green-500 text-green-600'
                    : 'border-muted text-muted-foreground/40',
                )}
              >
                <Wrench className="h-2 w-2" />Parts
              </Badge>
            </>
          )}
        </div>

        {/* 7. Actions — w-[70px] */}
        <div className="w-[70px] shrink-0 flex items-center justify-end gap-0.5 px-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            aria-label="Add child service"
            onClick={(e) => { e.stopPropagation(); onAddChild(service.id) }}
          >
            <Plus className="h-3.5 w-3.5 text-primary" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            aria-label="Edit service"
            onClick={(e) => { e.stopPropagation(); onEdit(service) }}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            aria-label="Archive service"
            disabled={archiveService.isPending}
            onClick={(e) => { e.stopPropagation(); setArchiveOpen(true) }}
          >
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
              Are you sure you want to archive &ldquo;{service.name_en}&rdquo;? It will be
              deactivated and hidden from active lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleArchiveConfirm}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
